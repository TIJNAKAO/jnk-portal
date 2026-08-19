import { pool } from '../../config/database.js';
import * as integracaoLog from '../integracaoLog.js';
import type { ResultadoSincronizacao } from '../integracaoLog.js';

/** Transforma `sysemp_produto` em `etl_produto`. Porta de `etl_produto.php`. */
export async function rodarEtlProduto(idLog: number): Promise<ResultadoSincronizacao> {
  const inicio = Date.now();

  const [resultado] = await pool.query(
    `INSERT INTO etl_produto (origem_dados, cd_produto, dc_produto, um, ncm, marca, atualizado_em)
     SELECT
       'SYSEMP',
       COALESCE(NULLIF(codigo_auxiliar, ''), CAST(id_produto AS CHAR)),
       LEFT(nome_produto, 100),
       COALESCE(LEFT(unidade, 2), ''),
       COALESCE(ncm, ''),
       COALESCE(LEFT(descricao_marca, 20), ''),
       CURRENT_TIMESTAMP
     FROM sysemp_produto
     WHERE ativo = TRUE
     ON DUPLICATE KEY UPDATE
       dc_produto = VALUES(dc_produto), um = VALUES(um), ncm = VALUES(ncm), marca = VALUES(marca),
       atualizado_em = CURRENT_TIMESTAMP`,
  );

  const qtde = (resultado as { affectedRows: number }).affectedRows;
  await integracaoLog.detalhe(idLog, { status: 'ok', qtdeRegistros: qtde, duracaoMs: Date.now() - inicio });
  return { qtde };
}
