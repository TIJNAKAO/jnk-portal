import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../config/database.js';

/**
 * Histórico das importações de planilha do Fechamento de Custo.
 *
 * É o equivalente do Painel de Integração para upload de arquivo: sem
 * ele, uma importação parcial só aparece semanas depois, num total que
 * não fecha. Ver Specs/spec_modulo_estoque.md, seção 3.10.
 *
 * A gravação acontece **dentro da transação da importação**, e por isso
 * recebe a conexão em vez de usar o pool: importação que rola atrás não
 * pode deixar para trás um log dizendo que deu certo.
 */

export type TipoImportacao = 'fechamento_estoque' | 'estoque_full' | 'inventario_fisico';

export interface LinhaIgnorada {
  /** Número da linha na planilha, contando o cabeçalho como linha 1. */
  linha: number;
  motivo: string;
}

export interface ResultadoImportacao {
  totalLinhas: number;
  inseridas: number;
  atualizadas: number;
  ignoradas: LinhaIgnorada[];
  produtosNaoEncontrados: number;
  empresasNaoEncontradas: number;
  /** Só o Fechamento Mensal soma custo; nas outras planilhas fica nulo. */
  custoTotal: number | null;
  /** Período encontrado na planilha, quando ela tem um só. */
  periodo: string | null;
}

export interface DadosLog extends ResultadoImportacao {
  tipo: TipoImportacao;
  arquivo: string;
  usuarioId: number;
}

/** Quantas linhas ignoradas cabem em `observacoes` antes de virar ruído. */
const IGNORADAS_NO_LOG = 50;

export async function registrarImportacao(conexao: PoolConnection, dados: DadosLog): Promise<void> {
  const observacoes =
    dados.ignoradas.length === 0
      ? null
      : dados.ignoradas
          .slice(0, IGNORADAS_NO_LOG)
          .map((i) => `Linha ${i.linha}: ${i.motivo}`)
          .join('\n') +
        (dados.ignoradas.length > IGNORADAS_NO_LOG
          ? `\n… e mais ${dados.ignoradas.length - IGNORADAS_NO_LOG} linha(s) ignorada(s).`
          : '');

  await conexao.query(
    `INSERT INTO estoque_importacao_log
       (tipo, arquivo, periodo, total_linhas, inseridas, atualizadas, ignoradas,
        produtos_nao_encontrados, empresas_nao_encontradas, custo_total, observacoes, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dados.tipo,
      dados.arquivo,
      dados.periodo,
      dados.totalLinhas,
      dados.inseridas,
      dados.atualizadas,
      dados.ignoradas.length,
      dados.produtosNaoEncontrados,
      dados.empresasNaoEncontradas,
      dados.custoTotal,
      observacoes,
      dados.usuarioId,
    ],
  );
}

export interface LinhaLog extends RowDataPacket {
  id: number;
  tipo: string;
  arquivo: string | null;
  periodo: string | null;
  total_linhas: number;
  inseridas: number;
  atualizadas: number;
  ignoradas: number;
  produtos_nao_encontrados: number;
  empresas_nao_encontradas: number;
  custo_total: number | null;
  observacoes: string | null;
  usuario: string | null;
  executado_em: string;
}

/** Últimas 300 execuções, como no portal PHP — é histórico, não auditoria paginada. */
export async function listarImportacoes(tipo?: TipoImportacao): Promise<LinhaLog[]> {
  const filtro = tipo ? 'WHERE l.tipo = ?' : '';
  const params = tipo ? [tipo] : [];

  const [linhas] = await pool.query<LinhaLog[]>(
    `SELECT l.id, l.tipo, l.arquivo, l.periodo, l.total_linhas, l.inseridas, l.atualizadas,
            l.ignoradas, l.produtos_nao_encontrados, l.empresas_nao_encontradas,
            l.custo_total, l.observacoes, u.nome AS usuario, l.executado_em
       FROM estoque_importacao_log l
       LEFT JOIN usuarios u ON u.id = l.usuario_id
       ${filtro}
      ORDER BY l.executado_em DESC
      LIMIT 300`,
    params,
  );

  return linhas;
}
