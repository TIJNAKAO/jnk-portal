import { withTransaction } from '../../../config/database.js';
import * as integracaoLog from '../../integracaoLog.js';
import type { ResultadoSincronizacao } from '../../integracaoLog.js';
import { sysempPost } from '../client.js';
import { inteiro, valor } from '../dbUtil.js';

/** Sem paginação — `/listarRepresentantes` devolve o cadastro inteiro numa chamada, sem `--data`. */
export async function sincronizarRepresentantes(idLog: number): Promise<ResultadoSincronizacao> {
  const inicio = Date.now();
  const resposta = await sysempPost<{ retorno: Record<string, unknown>[] }>('/listarRepresentantes', {});
  const representantes = resposta.retorno ?? [];

  await withTransaction(async (connection) => {
    for (const rep of representantes) {
      const idRepresentante = inteiro(rep, 'codigo_representante_vendas') ?? inteiro(rep, 'id_representante');
      if (idRepresentante === null) continue;

      await connection.query(
        `INSERT INTO sysemp_representante (id_representante, nome_representante, ativo, synced_at)
         VALUES (?, ?, TRUE, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE nome_representante = VALUES(nome_representante), synced_at = CURRENT_TIMESTAMP`,
        [idRepresentante, valor(rep, 'nome_representante')],
      );
    }
  });

  await integracaoLog.detalhe(idLog, { status: 'ok', qtdeRegistros: representantes.length, duracaoMs: Date.now() - inicio });
  return { qtde: representantes.length };
}
