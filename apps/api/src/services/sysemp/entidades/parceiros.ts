import { withTransaction } from '../../../config/database.js';
import * as integracaoLog from '../../integracaoLog.js';
import type { ResultadoSincronizacao } from '../../integracaoLog.js';
import { sysempPost } from '../client.js';
import { booleano, inteiro, valor } from '../dbUtil.js';

const TAMANHO_LOTE = 1000;
const MAX_ITERACOES = 500;

/** Lote por offset de registro. Ver Specs/spec_modulo_integracao.md, seção 2.4. */
export async function sincronizarParceiros(idLog: number): Promise<ResultadoSincronizacao> {
  let offset = 0;
  let total = 0;
  let primeiroIdAnterior: number | null = null;

  for (let iteracao = 0; iteracao < MAX_ITERACOES; iteracao++) {
    if (await integracaoLog.foiCancelado(idLog)) return { qtde: total, cancelado: true };

    const inicio = Date.now();
    const resposta = await sysempPost<{ qtde: number; retorno: Record<string, unknown>[] }>('/listarParceiros', {
      offset: String(offset),
      limit: String(TAMANHO_LOTE),
    });
    const parceiros = resposta.retorno ?? [];

    if (parceiros.length === 0) {
      await integracaoLog.detalhe(idLog, { pagina: offset, status: 'ok', qtdeRegistros: 0, duracaoMs: Date.now() - inicio, mensagem: 'Fim da paginação.' });
      break;
    }

    const primeiroIdAtual = inteiro(parceiros[0], 'codigo');
    if (primeiroIdAnterior !== null && primeiroIdAtual === primeiroIdAnterior) {
      // Bug conhecido do endpoint: às vezes ignora o offset e devolve sempre
      // a primeira página. Abortar em vez de girar infinitamente.
      const mensagem = `A SysEmp devolveu o mesmo primeiro registro (id_parceiro=${primeiroIdAtual}) do lote anterior — offset parece não estar sendo respeitado. Abortado para não ficar girando.`;
      await integracaoLog.detalhe(idLog, { pagina: offset, status: 'erro', mensagem, duracaoMs: Date.now() - inicio });
      throw new Error(mensagem);
    }
    primeiroIdAnterior = primeiroIdAtual;

    try {
      await withTransaction(async (connection) => {
        const linhas = parceiros
          .map((p) => {
            const idParceiro = inteiro(p, 'codigo');
            if (idParceiro === null) return null;
            return [
              idParceiro,
              booleano(p, 'class_cliente'),
              booleano(p, 'class_fornecedor'),
              booleano(p, 'class_transportadora'),
              valor(p, 'razao_social'),
              valor(p, 'fantasia'),
              valor(p, 'cpf_cnpj'),
              valor(p, 'tipopessoa'),
              valor(p, 'insc_estadual'),
              valor(p, 'inscr_municipal'),
              valor(p, 'contato_nome'),
              valor(p, 'sexo'),
              valor(p, 'data_nascimento'),
              valor(p, 'telefone1'),
              valor(p, 'telefone2'),
              valor(p, 'data_cadastro'),
              valor(p, 'logradouro'),
              valor(p, 'logradouro_numero'),
              valor(p, 'logradouro_complemento'),
              valor(p, 'logradouro_bairro'),
              valor(p, 'logradouro_municipio'),
              valor(p, 'logradouro_uf'),
              valor(p, 'logradouro_cep'),
              true,
              new Date(),
            ];
          })
          .filter((linha): linha is unknown[] => linha !== null);

        for (const linha of linhas) {
          await connection.query(
            `INSERT INTO sysemp_parceiro (
               id_parceiro, class_cliente, class_fornecedor, class_transportadora, razao_social, fantasia, cpf_cnpj,
               tipo_pessoa, insc_estadual, insc_municipal, contato_nome, sexo, data_nascimento, telefone1, telefone2,
               data_cadastro, logradouro, logradouro_numero, logradouro_complemento, logradouro_bairro,
               logradouro_municipio, logradouro_uf, logradouro_cep, ativo, synced_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               class_cliente = VALUES(class_cliente), class_fornecedor = VALUES(class_fornecedor),
               class_transportadora = VALUES(class_transportadora), razao_social = VALUES(razao_social),
               fantasia = VALUES(fantasia), cpf_cnpj = VALUES(cpf_cnpj), tipo_pessoa = VALUES(tipo_pessoa),
               insc_estadual = VALUES(insc_estadual), insc_municipal = VALUES(insc_municipal),
               contato_nome = VALUES(contato_nome), sexo = VALUES(sexo), data_nascimento = VALUES(data_nascimento),
               telefone1 = VALUES(telefone1), telefone2 = VALUES(telefone2), data_cadastro = VALUES(data_cadastro),
               logradouro = VALUES(logradouro), logradouro_numero = VALUES(logradouro_numero),
               logradouro_complemento = VALUES(logradouro_complemento), logradouro_bairro = VALUES(logradouro_bairro),
               logradouro_municipio = VALUES(logradouro_municipio), logradouro_uf = VALUES(logradouro_uf),
               logradouro_cep = VALUES(logradouro_cep), ativo = VALUES(ativo), synced_at = CURRENT_TIMESTAMP`,
            linha,
          );
        }
      });
      total += parceiros.length;
      await integracaoLog.detalhe(idLog, { pagina: offset, status: 'ok', qtdeRegistros: parceiros.length, duracaoMs: Date.now() - inicio });
    } catch (error) {
      await integracaoLog.detalhe(idLog, { pagina: offset, status: 'erro', mensagem: (error as Error).message, duracaoMs: Date.now() - inicio });
      throw error;
    }

    offset += parceiros.length;
  }

  return { qtde: total };
}
