import type { PoolConnection } from '../../config/database.js';
import { pool, withTransaction } from '../../config/database.js';
import type { RowDataPacket } from 'mysql2';
import * as integracaoLog from '../integracaoLog.js';
import type { ResultadoSincronizacao } from '../integracaoLog.js';
import { sysempPost } from './client.js';

export interface LinhaFilaPendente extends RowDataPacket {
  id_fila: number;
  tipo_tabela: number;
  acao: 'I' | 'U' | 'D';
  id_registro: number;
  datahora_criacao_sysemp: Date | null;
  datahora_processamento_sysemp: Date | null;
}

export interface ConsumidorFila {
  tipoTabela: number;
  /** Grava o efeito de um evento (I/U/D) nas tabelas de destino desta entidade. */
  gravar: (connection: PoolConnection, detalhe: Record<string, unknown> | null, acao: 'I' | 'U' | 'D', idRegistro: number) => Promise<void>;
  /**
   * Sobrescreve como o detalhe de um evento é buscado — por padrão, a fila
   * chama `config.endpoint_detalhe` com `{[config.campo_id_detalhe]: idRegistro}`.
   * Usar quando o endpoint da SysEmp não aceita busca por id sozinho (ex:
   * `/listarPedidos`, que exige `data_inicial`/`data_final` e devolve HTTP
   * 400 sem eles — confirmado em produção).
   */
  buscarDetalhe?: (idRegistro: number, linhaFila: LinhaFilaPendente) => Promise<Record<string, unknown> | null>;
}

const registro = new Map<number, ConsumidorFila>();

const MAX_ITERACOES = 200; // trava de segurança — até 200 páginas por execução

export function registrarConsumidorFila(consumidor: ConsumidorFila): void {
  registro.set(consumidor.tipoTabela, consumidor);
}

interface FilaConfigRow extends RowDataPacket {
  chave: string;
  nome: string;
  tipo_tabela: number;
  endpoint_fila: string;
  endpoint_detalhe: string | null;
  campo_id_detalhe: string | null;
  endpoint_confirmacao: string;
  limite_pagina: number;
  ativo: number;
}

interface ItemFilaSysemp {
  id_fila: string;
  tipo_tabela: string;
  desc_tipo_tabela?: string;
  acao: 'I' | 'U' | 'D';
  desc_acao?: string;
  id_registro: string;
  status: string;
  datahora_criacao: string;
  datahora_processamento?: string | null;
}

/** SysEmp manda `"2026-08-06 17:17:18.39149-03"` — DATETIME do MySQL não aceita fração+timezone. */
function normalizarDataSysemp(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const data = new Date(valor.replace(' ', 'T'));
  if (Number.isNaN(data.getTime())) return null;
  return data.toISOString().slice(0, 19).replace('T', ' ');
}

async function importarPaginaFila(config: FilaConfigRow): Promise<number> {
  const resposta = await sysempPost<{ qtde: number; retorno: ItemFilaSysemp[] }>(config.endpoint_fila, {
    offset: '0',
    limit: String(config.limite_pagina),
    tipo_tabela: String(config.tipo_tabela),
    status: 'PENDENTE',
  });

  const itens = resposta.retorno ?? [];
  if (itens.length === 0) return 0;

  // Upsert que NUNCA sobrescreve consumido/confirmado — só os metadados
  // vindos da SysEmp (senão reimportar resetaria progresso já feito).
  for (const item of itens) {
    await pool.query(
      `INSERT INTO sysemp_fila (id_fila, tipo_tabela, desc_tipo_tabela, acao, desc_acao, id_registro, status_sysemp, datahora_criacao_sysemp, datahora_processamento_sysemp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         desc_tipo_tabela = VALUES(desc_tipo_tabela),
         desc_acao = VALUES(desc_acao),
         status_sysemp = VALUES(status_sysemp),
         datahora_processamento_sysemp = VALUES(datahora_processamento_sysemp)`,
      [
        Number(item.id_fila),
        Number(item.tipo_tabela),
        item.desc_tipo_tabela ?? null,
        item.acao,
        item.desc_acao ?? null,
        Number(item.id_registro),
        item.status,
        normalizarDataSysemp(item.datahora_criacao),
        normalizarDataSysemp(item.datahora_processamento),
      ],
    );
  }

  return itens.length;
}

/** Porta de `SyncFilaSysemp.php` + `SysempIntegracao.php`. Ver spec, seção 2.2/2.3. */
export async function sincronizarFila(chaveConfig: string, idLog: number): Promise<ResultadoSincronizacao> {
  const [linhasConfig] = await pool.query<FilaConfigRow[]>('SELECT * FROM sysemp_fila_config WHERE chave = ? AND ativo = TRUE', [
    chaveConfig,
  ]);
  const config = linhasConfig[0];
  if (!config) {
    throw new Error(`Configuração de fila '${chaveConfig}' não encontrada ou inativa.`);
  }

  const consumidor = registro.get(config.tipo_tabela);
  if (!consumidor) {
    throw new Error(`Nenhum consumidor registrado pra tipo_tabela=${config.tipo_tabela} (chave '${chaveConfig}').`);
  }

  let totalProcessados = 0;

  // Uma página só traz até `limite_pagina` eventos ainda PENDENTES do lado
  // da SysEmp — se a fila tiver mais que isso, repete até esgotar (ou até
  // a trava de segurança), senão sobra muito registro pendente de uma
  // execução pra outra.
  for (let iteracao = 0; iteracao < MAX_ITERACOES; iteracao++) {
    if (await integracaoLog.foiCancelado(idLog)) {
      return { qtde: totalProcessados, cancelado: true };
    }

    const inicioImportacao = Date.now();
    let qtdeImportada = 0;
    try {
      qtdeImportada = await importarPaginaFila(config);
      await integracaoLog.detalhe(idLog, {
        status: 'ok',
        qtdeRegistros: qtdeImportada,
        duracaoMs: Date.now() - inicioImportacao,
        mensagem: `Página da fila importada: ${qtdeImportada} evento(s).`,
      });
    } catch (error) {
      await integracaoLog.detalhe(idLog, {
        status: 'erro',
        mensagem: (error as Error).message,
        duracaoMs: Date.now() - inicioImportacao,
      });
      throw error;
    }

    // ORDER BY id_fila é obrigatório: id_fila é a sequência global de
    // eventos da SysEmp — processar fora dessa ordem (ou pular um evento
    // com erro pra tentar os seguintes) descompassa o estado local em
    // relação à ordem real das mudanças, especialmente quando há mais de
    // um evento pendente pro mesmo id_registro.
    const [pendentes] = await pool.query<LinhaFilaPendente[]>(
      'SELECT * FROM sysemp_fila WHERE tipo_tabela = ? AND (consumido = FALSE OR confirmado_sysemp = FALSE) ORDER BY id_fila ASC',
      [config.tipo_tabela],
    );

    for (const linha of pendentes) {
      if (await integracaoLog.foiCancelado(idLog)) {
        return { qtde: totalProcessados, cancelado: true };
      }

      const inicioRegistro = Date.now();
      const idFila = linha.id_fila as number;
      const idRegistro = linha.id_registro as number;
      const acao = linha.acao as 'I' | 'U' | 'D';
      let jaConsumido = Boolean(linha.consumido);

      if (!jaConsumido) {
        try {
          await withTransaction(async (connection) => {
            if (acao === 'D') {
              await consumidor.gravar(connection, null, 'D', idRegistro);
            } else if (consumidor.buscarDetalhe) {
              const registroDetalhe = await consumidor.buscarDetalhe(idRegistro, linha);
              await consumidor.gravar(connection, registroDetalhe, acao, idRegistro);
            } else {
              if (!config.endpoint_detalhe || !config.campo_id_detalhe) {
                throw new Error(`Config de fila '${chaveConfig}' sem endpoint_detalhe/campo_id_detalhe.`);
              }
              const detalheResposta = await sysempPost<{ retorno: Record<string, unknown>[] }>(config.endpoint_detalhe, {
                [config.campo_id_detalhe]: String(idRegistro),
              });
              const registroDetalhe = detalheResposta.retorno?.[0] ?? null;
              await consumidor.gravar(connection, registroDetalhe, acao, idRegistro);
            }
            await connection.query('UPDATE sysemp_fila SET consumido = TRUE, consumido_em = CURRENT_TIMESTAMP, erro_consumo = NULL WHERE id_fila = ?', [
              idFila,
            ]);
          });
          jaConsumido = true;
        } catch (error) {
          await pool.query('UPDATE sysemp_fila SET erro_consumo = ? WHERE id_fila = ?', [(error as Error).message.slice(0, 500), idFila]);
          const mensagem = `Falha ao consumir id_fila=${idFila} (id_registro=${idRegistro}): ${(error as Error).message}`;
          await integracaoLog.detalhe(idLog, {
            pagina: idFila,
            status: 'erro',
            mensagem,
            duracaoMs: Date.now() - inicioRegistro,
          });
          // Não segue pros próximos id_fila: eventos posteriores podem ser
          // do mesmo id_registro, e processá-los fora de ordem descompassa
          // a sequência de atualização local. Encerra a execução inteira
          // aqui (erro_consumo fica setado, consumido continua FALSE) — a
          // próxima chamada retoma exatamente deste id_fila em diante.
          throw new Error(mensagem);
        }
      }

      if (jaConsumido) {
        try {
          await sysempPost(config.endpoint_confirmacao, { id_fila: String(idFila) });
          await pool.query('UPDATE sysemp_fila SET confirmado_sysemp = TRUE, confirmado_em = CURRENT_TIMESTAMP, erro_confirmacao = NULL WHERE id_fila = ?', [
            idFila,
          ]);
          totalProcessados++;
          await integracaoLog.detalhe(idLog, {
            pagina: idFila,
            status: 'ok',
            qtdeRegistros: 1,
            duracaoMs: Date.now() - inicioRegistro,
            mensagem: `id_fila=${idFila} (id_registro=${idRegistro}, acao=${acao}) consumido e confirmado.`,
          });
        } catch (error) {
          await pool.query('UPDATE sysemp_fila SET erro_confirmacao = ? WHERE id_fila = ?', [(error as Error).message.slice(0, 500), idFila]);
          await integracaoLog.detalhe(idLog, {
            pagina: idFila,
            status: 'erro',
            mensagem: `id_fila=${idFila} consumido mas falha ao confirmar: ${(error as Error).message}`,
            duracaoMs: Date.now() - inicioRegistro,
          });
        }
      }
    }

    if (qtdeImportada === 0) break; // fila da SysEmp esgotada por enquanto
  }

  return { qtde: totalProcessados };
}
