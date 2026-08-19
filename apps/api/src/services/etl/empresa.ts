import { pool } from '../../config/database.js';
import * as integracaoLog from '../integracaoLog.js';
import type { ResultadoSincronizacao } from '../integracaoLog.js';

/**
 * Não fala com API nenhuma — só transforma `sysemp_empresa` (já
 * sincronizada) em `etl_empresa`, camada pronta pra Excel/Power BI. Sempre
 * upsert por chave de negócio, nunca deleta. Porta de `etl_empresa.php`.
 *
 * `DC_FANTASIA` no projeto original é um nome curado por `id_empresa`
 * (`CASE` fixo, específico do cadastro daquele cliente) — sem essa curadoria
 * documentada, usa `fantasia` (ou `razao_social` se `fantasia` estiver
 * vazio) truncado pra 25 caracteres. Ajustar aqui se for preciso um `CASE`
 * fixo igual ao original.
 */
export async function rodarEtlEmpresa(idLog: number): Promise<ResultadoSincronizacao> {
  const inicio = Date.now();

  const [resultado] = await pool.query(
    `INSERT INTO etl_empresa (origem_dados, grupo, cd_filial, dc_filial, dc_fantasia, cnpj, ie, atualizado_em)
     SELECT
       'SYSEMP',
       COALESCE(NULLIF(grupo_empresa, ''), 'N/D'),
       id_empresa,
       LEFT(razao_social, 80),
       LEFT(COALESCE(NULLIF(fantasia, ''), razao_social), 25),
       COALESCE(cnpj, ''),
       COALESCE(insc_estadual, ''),
       CURRENT_TIMESTAMP
     FROM sysemp_empresa
     WHERE ativa = TRUE
     ON DUPLICATE KEY UPDATE
       grupo = VALUES(grupo), dc_filial = VALUES(dc_filial), dc_fantasia = VALUES(dc_fantasia),
       cnpj = VALUES(cnpj), ie = VALUES(ie), atualizado_em = CURRENT_TIMESTAMP`,
  );

  const qtde = (resultado as { affectedRows: number }).affectedRows;
  await integracaoLog.detalhe(idLog, { status: 'ok', qtdeRegistros: qtde, duracaoMs: Date.now() - inicio });
  return { qtde };
}
