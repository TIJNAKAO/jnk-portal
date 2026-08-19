import { pool } from '../../config/database.js';
import * as integracaoLog from '../integracaoLog.js';
import type { ResultadoSincronizacao } from '../integracaoLog.js';

/**
 * Cruza `sysemp_nota_fiscal` + `sysemp_nota_fiscal_item` (INNER JOIN) com
 * `sysemp_empresa`, `sysemp_parceiro` e `sysemp_produto` — uma linha por
 * item de NF. INNER JOIN é proposital (spec, seção 3.4): uma NF só entra
 * quando empresa/cliente/produto do item já estiverem sincronizados, sem
 * erro, só ausência silenciosa até a entidade correspondente sincronizar.
 *
 * Vários campos não têm fonte confirmada no schema disponível (não foi
 * possível validar contra a API real) — ficam com o melhor mapeamento
 * possível a partir das colunas já existentes, ou fixos em 0 quando a
 * spec já documentava a ausência de fonte (VT_ICMS_ST_GNRE, VT_CUSTO,
 * VB_TX_FATUR, TAXA_FATUR, VT_LIQ_FINAL, VT_ENCARGOS, VT_DESCONTO,
 * ALIQ_ICMS_CALC, ALIQ_PISCOF_CALC, VT_REBATE). Validar contra dado real
 * antes de usar em relatório de margem de verdade.
 */
export async function rodarEtlFatcom(idLog: number): Promise<ResultadoSincronizacao> {
  const inicio = Date.now();

  const [resultado] = await pool.query(
    `INSERT INTO etl_fatcom (
       origem_dados, grupo_empresa, cd_filial, nf, serie, item, cd_produto, dc_filial, periodo, dt_movto, ent_sai,
       status_nf, ctrl_financeiro, cd_clifor, dc_clifor, uf, dc_produto, um, ncm, marca, canal, cfop, cst, qtde,
       vu_merc, vt_merc, vb_icms, aliq_icms, aliq_icms_calc, aliq_red_icms, vt_icms, vt_icms_st, vt_icms_st_gnre,
       vt_icms_difal, vt_icms_frete, vb_ipi, aliq_ipi, vt_ipi, vb_pis, aliq_pis, vt_pis, vb_cofins, aliq_cofins,
       aliq_piscof_calc, vt_cofins, vt_encargos, vt_frete, vt_desconto, vt_nota, vt_liquido, vt_liq_final, vt_custo,
       vb_tx_fatur, taxa_fatur, vt_tx_fatur, vt_add_frete, vt_rebate, atualizado_em
     )
     SELECT
       'SYSEMP',
       COALESCE(NULLIF(e.grupo_empresa, ''), 'N/D'),
       e.id_empresa,
       LEFT(COALESCE(nf.nota_numero, ''), 9),
       LEFT(COALESCE(nf.nota_serie_danfe, ''), 3),
       it.item,
       COALESCE(NULLIF(pr.codigo_auxiliar, ''), CAST(pr.id_produto AS CHAR)),
       LEFT(e.razao_social, 25),
       DATE_FORMAT(nf.nota_emissao, '%Y%m'),
       nf.nota_emissao,
       COALESCE(nf.entrada_saida, 'S'),
       COALESCE(nf.status_nota, ''),
       CASE WHEN it.gera_financeiro = TRUE THEN 'S' ELSE 'N' END,
       CAST(nf.id_cliente AS CHAR),
       LEFT(par.razao_social, 100),
       COALESCE(par.logradouro_uf, ''),
       LEFT(pr.nome_produto, 100),
       COALESCE(pr.unidade, ''),
       COALESCE(it.ncm, pr.ncm, ''),
       COALESCE(LEFT(pr.descricao_marca, 50), ''),
       COALESCE(nf.canal_venda, ''),
       COALESCE(it.item_cfop, ''),
       COALESCE(it.cst, ''),
       COALESCE(it.qtde, 0),
       COALESCE(it.vr_unitario_bruto, 0),
       COALESCE(it.vr_total_bruto, 0),
       COALESCE(it.base_icms, 0),
       COALESCE(it.aliquota_icms, 0),
       0,
       COALESCE(it.reducao, 0),
       COALESCE(it.valor_icms, 0),
       COALESCE(it.icms_st, 0),
       0,
       COALESCE(it.difal, 0),
       0,
       COALESCE(it.base_ipi, 0),
       COALESCE(it.ipi_percentual, 0),
       COALESCE(it.valor_ipi, 0),
       COALESCE(it.base_pis, 0),
       COALESCE(it.aliq_pis, 0),
       COALESCE(it.valor_pis, 0),
       COALESCE(it.base_cofins, 0),
       COALESCE(it.aliq_cofins, 0),
       0,
       COALESCE(it.valor_cofins, 0),
       0,
       COALESCE(it.vr_frete, 0),
       0,
       COALESCE(it.vr_total_bruto, 0),
       COALESCE(it.vr_item_liquido, 0),
       0,
       0,
       0,
       0,
       COALESCE(it.vr_frete, 0),
       0,
       0,
       CURRENT_TIMESTAMP
     FROM sysemp_nota_fiscal_item it
     JOIN sysemp_nota_fiscal nf ON nf.id_nota_saida = it.id_nota_saida
     JOIN sysemp_empresa e ON e.id_empresa = nf.id_empresa
     JOIN sysemp_parceiro par ON par.id_parceiro = nf.id_cliente
     JOIN sysemp_produto pr ON pr.id_produto = it.id_produto
     WHERE nf.deleted = FALSE AND it.deleted = FALSE
     ON DUPLICATE KEY UPDATE
       dc_filial = VALUES(dc_filial), periodo = VALUES(periodo), dt_movto = VALUES(dt_movto),
       status_nf = VALUES(status_nf), qtde = VALUES(qtde), vu_merc = VALUES(vu_merc), vt_merc = VALUES(vt_merc),
       vt_icms = VALUES(vt_icms), vt_ipi = VALUES(vt_ipi), vt_pis = VALUES(vt_pis), vt_cofins = VALUES(vt_cofins),
       vt_nota = VALUES(vt_nota), atualizado_em = CURRENT_TIMESTAMP`,
  );

  const qtde = (resultado as { affectedRows: number }).affectedRows;
  await integracaoLog.detalhe(idLog, { status: 'ok', qtdeRegistros: qtde, duracaoMs: Date.now() - inicio });
  return { qtde };
}
