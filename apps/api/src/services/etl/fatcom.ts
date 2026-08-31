import { pool } from '../../config/database.js';
import * as integracaoLog from '../integracaoLog.js';
import type { ResultadoSincronizacao } from '../integracaoLog.js';

/**
 * Alimenta `etl_fatcom` — a tabela-fato de faturamento, uma linha por item de
 * NF, que é a base do módulo Faturamento e o ponto de consolidação dos dois
 * ERPs (`origem_dados` distingue `SYSEMP` do `KPL` a ser carregado no
 * futuro). Ver `Specs/spec_modulo_faturamento.md`.
 *
 * Reescrito em 31/08/2026. A versão anterior falhou em 94 de 94 execuções
 * (`Data too long for column 'cst'`) e, mesmo quando carregava, gravava
 * `vt_custo`, `vt_desconto` e a taxa de marketplace fixos em zero, incluía
 * notas canceladas e descartava em silêncio ~30% dos itens por causa de um
 * `INNER JOIN`. Três decisões estruturais mudaram:
 *
 * 1. **`LEFT JOIN` em vez de `INNER JOIN`** — todo item de NF entra. O que
 *    ainda não sincronizou fica marcado em `ref_pendente` em vez de sumir da
 *    soma do faturamento.
 * 2. **Custo congelado** — `vu_custo`/`vt_custo` são gravados na primeira
 *    carga da linha e nunca atualizados (ficam fora do `ON DUPLICATE KEY
 *    UPDATE`). A margem de um mês fechado não muda quando o custo médio sobe.
 * 3. **Só insumos, não derivados** — a tabela guarda fatos (impostos, custo,
 *    comissão, frete). LÍQUIDO, MARGEM e % MARGEM são calculados na camada de
 *    consulta, num único lugar testável, sem exigir recarga quando a regra
 *    de margem mudar.
 *
 * `LEFT(...)` em toda coluna de texto é proposital: foi um único CST de 4
 * caracteres contra uma coluna de 3 que derrubou a carga 94 vezes. Truncar
 * uma célula é ruim; parar o faturamento do mês inteiro é pior.
 */

/** Rateio pró-rata de um valor de cabeçalho entre os itens, pelo peso do item no total de produtos. */
const RATEIO_ITEM = '(it.vr_total_bruto / NULLIF(nf.total_produtos, 0))';

/** Comissão do marketplace: preferimos o valor por item; caímos no rateio do cabeçalho quando ele não vem. */
const COMISSAO = `COALESCE(it.valor_comissao_ml, nf.valor_comissao * ${RATEIO_ITEM}, 0)`;

/** Frete pago pelo seller: mesma lógica da comissão. */
const FRETE_SELLER = `COALESCE(it.frete_seller, nf.valor_frete_seller * ${RATEIO_ITEM}, 0)`;

/** Custo unitário congelado. NULL quando o produto não tem custo — margem sai vazia, nunca zerada. */
const CUSTO_UNITARIO = 'COALESCE(NULLIF(ef.custo_formacao, 0), NULLIF(ef.custo_medio, 0))';

/** `nota_emissao` é nula em algumas notas; `dt_movto` e `periodo` são NOT NULL. */
const DATA_MOVIMENTO = 'COALESCE(nf.nota_emissao, nf.nota_saida, nf.nota_cadastro)';

/** Só entra no fato o que a SEFAZ autorizou — é a definição fiscal de faturamento. */
const AUTORIZADA = `nf.protocolo_nfe IS NOT NULL AND nf.protocolo_nfe <> ''`;

/**
 * Número e série da NF. 89 notas autorizadas chegam com `nota_numero` vazio
 * ou "0" — sem tratamento, todas colidem entre si na chave única e se
 * sobrescrevem. A chave de acesso da NF-e carrega os dois campos em posição
 * fixa (série nos dígitos 23–25, número nos 26–34), então servem de fonte
 * secundária. Conferido contra as 22.523 notas que têm número E chave: o
 * número extraído bate em 100% delas.
 */
const CHAVE_VALIDA = `CHAR_LENGTH(COALESCE(nf.chave_nfe, '')) = 44`;

// O COLLATE explícito é necessário: `CAST(... AS CHAR)` produz utf8mb4_bin,
// que não compara com o utf8mb4_0900_ai_ci das colunas de etl_fatcom.
const NUMERO_NF = `LEFT(COALESCE(
    NULLIF(NULLIF(nf.nota_numero, ''), '0'),
    CASE WHEN ${CHAVE_VALIDA} THEN CAST(CAST(SUBSTRING(nf.chave_nfe, 26, 9) AS UNSIGNED) AS CHAR) COLLATE utf8mb4_0900_ai_ci END,
    ''), 9)`;

const SERIE_NF = `LEFT(COALESCE(
    NULLIF(nf.nota_serie_danfe, ''),
    CASE WHEN ${CHAVE_VALIDA} THEN CAST(CAST(SUBSTRING(nf.chave_nfe, 23, 3) AS UNSIGNED) AS CHAR) COLLATE utf8mb4_0900_ai_ci END,
    ''), 3)`;

/** Colunas gravadas uma vez e nunca reescritas — é isto que congela o custo histórico. */
const COLUNAS_CONGELADAS = new Set(['vu_custo', 'vt_custo']);

/**
 * Mapa coluna → expressão SQL. Mesma motivação do consumidor de Notas
 * Fiscais: com 60 colunas, manter a lista do INSERT alinhada à do SELECT à
 * mão é como erros de mapeamento passam despercebidos.
 */
const MAPEAMENTO: Record<string, string> = {
  origem_dados: `'SYSEMP'`,
  grupo_empresa: `COALESCE(NULLIF(e.grupo_empresa, ''), 'N/D')`,
  cd_filial: 'nf.id_empresa',
  nf: NUMERO_NF,
  serie: SERIE_NF,
  item: 'it.item',
  cd_produto: `LEFT(COALESCE(NULLIF(pr.codigo_auxiliar, ''), CAST(it.id_produto AS CHAR), ''), 50)`,

  dc_filial: `LEFT(COALESCE(e.razao_social, ''), 100)`,
  periodo: `DATE_FORMAT(${DATA_MOVIMENTO}, '%Y%m')`,
  dt_movto: DATA_MOVIMENTO,
  ent_sai: `COALESCE(nf.entrada_saida, 'S')`,
  status_nf: `LEFT(COALESCE(nf.status_nota, ''), 50)`,
  ctrl_financeiro: `CASE WHEN it.gera_financeiro = TRUE THEN 'S' ELSE 'N' END`,

  cd_clifor: `LEFT(COALESCE(CAST(nf.id_cliente AS CHAR), ''), 20)`,
  dc_clifor: `LEFT(COALESCE(par.razao_social, ''), 255)`,
  uf: `COALESCE(par.logradouro_uf, '')`,
  dc_produto: `LEFT(COALESCE(pr.nome_produto, ''), 255)`,

  // Torna visível o que o INNER JOIN anterior escondia.
  ref_pendente: `CASE
      WHEN par.id_parceiro IS NULL AND pr.id_produto IS NULL THEN 'CLIENTE+PRODUTO'
      WHEN par.id_parceiro IS NULL THEN 'CLIENTE'
      WHEN pr.id_produto IS NULL THEN 'PRODUTO'
      WHEN e.id_empresa IS NULL THEN 'EMPRESA'
      ELSE NULL
    END`,

  um: `LEFT(COALESCE(it.unidade, pr.unidade, ''), 10)`,
  ncm: `LEFT(COALESCE(it.ncm, pr.ncm, ''), 15)`,
  marca: `LEFT(COALESCE(TRIM(pr.descricao_marca), ''), 50)`,
  canal: `LEFT(COALESCE(nf.canal_venda, ''), 50)`,
  cfop: `LEFT(COALESCE(it.item_cfop, nf.nota_cfop, ''), 5)`,
  cst: `LEFT(COALESCE(it.cst, ''), 4)`,

  qtde: 'COALESCE(it.qtde, 0)',
  vu_merc: 'COALESCE(it.vr_unitario_bruto, 0)',
  vt_merc: 'COALESCE(it.vr_total_bruto, 0)',

  vb_icms: 'COALESCE(it.base_icms, 0)',
  aliq_icms: 'COALESCE(it.aliquota_icms, 0)',
  // Alíquota efetiva sobre a mercadoria — difere de `aliq_icms` quando há
  // redução de base. O COALESCE externo cobre mercadoria zerada: a divisão
  // vira NULL e a coluna é NOT NULL.
  aliq_icms_calc: `COALESCE(COALESCE(it.valor_icms, 0) / NULLIF(it.vr_total_bruto, 0) * 100, 0)`,
  aliq_red_icms: 'COALESCE(it.reducao, 0)',
  vt_icms: 'COALESCE(it.valor_icms, 0)',
  vt_icms_st: 'COALESCE(it.icms_st, 0)',
  vt_fecp: 'COALESCE(it.fecp, 0)',
  vt_icms_st_gnre: '0',
  vt_icms_difal: 'COALESCE(it.difal, 0)',
  vt_icms_frete: '0',

  vb_ipi: 'COALESCE(it.base_ipi, 0)',
  aliq_ipi: 'COALESCE(it.ipi_percentual, 0)',
  vt_ipi: 'COALESCE(it.valor_ipi, 0)',

  vb_pis: 'COALESCE(it.base_pis, 0)',
  aliq_pis: 'COALESCE(it.aliq_pis, 0)',
  vt_pis: 'COALESCE(it.valor_pis, 0)',

  vb_cofins: 'COALESCE(it.base_cofins, 0)',
  aliq_cofins: 'COALESCE(it.aliq_cofins, 0)',
  aliq_piscof_calc: `COALESCE((COALESCE(it.valor_pis, 0) + COALESCE(it.valor_cofins, 0)) / NULLIF(it.vr_total_bruto, 0) * 100, 0)`,
  vt_cofins: 'COALESCE(it.valor_cofins, 0)',

  vt_encargos: '0',
  vt_frete: 'COALESCE(it.vr_frete, 0)',
  vt_desconto: 'COALESCE(it.vr_desconto, 0)',
  // Total da NOTA repetido em cada item, para conferência contra o DANFE.
  // Somar esta coluna duplica em notas multi-item — o relatório sinaliza.
  vt_nota: 'COALESCE(nf.valor_nota, 0)',
  // Líquido FISCAL da SysEmp (mercadoria − desconto + frete + IPI, ou seja, a
  // base de ICMS). NÃO é receita líquida: o líquido comercial do relatório é
  // calculado na camada de consulta.
  vt_liquido: 'COALESCE(it.vr_item_liquido, 0)',
  vt_liq_final: '0',

  vt_custo: `COALESCE(it.qtde * ${CUSTO_UNITARIO}, 0)`,
  vu_custo: CUSTO_UNITARIO,

  vb_tx_fatur: 'COALESCE(it.vr_total_bruto, 0)',
  taxa_fatur: `COALESCE(${COMISSAO} / NULLIF(it.vr_total_bruto, 0) * 100, 0)`,
  vt_tx_fatur: COMISSAO,
  vt_add_frete: FRETE_SELLER,
  vt_rebate: '0',

  atualizado_em: 'CURRENT_TIMESTAMP',
};

const ORIGEM = `
  FROM sysemp_nota_fiscal_item it
  JOIN sysemp_nota_fiscal nf ON nf.id_nota_saida = it.id_nota_saida
  LEFT JOIN sysemp_empresa e ON e.id_empresa = nf.id_empresa
  LEFT JOIN sysemp_parceiro par ON par.id_parceiro = nf.id_cliente
  LEFT JOIN sysemp_produto pr ON pr.id_produto = it.id_produto
  LEFT JOIN sysemp_estoque_fisico ef
    ON ef.id_produto = it.id_produto AND ef.id_empresa = nf.id_empresa AND ef.deleted = FALSE
  WHERE nf.deleted = FALSE
    AND it.deleted = FALSE
    AND ${DATA_MOVIMENTO} IS NOT NULL
    AND ${AUTORIZADA}
    AND nf.data_cancelamento_nfe IS NULL
    AND COALESCE(nf.status_nota, '') <> '101'
`;

function montarInsert(): string {
  const colunas = Object.keys(MAPEAMENTO);
  const atualizaveis = colunas.filter((c) => !COLUNAS_CONGELADAS.has(c));

  return `INSERT INTO etl_fatcom (${colunas.join(', ')})
    SELECT ${colunas.map((c) => `${MAPEAMENTO[c]} AS ${c}`).join(',\n           ')}
    ${ORIGEM}
    ON DUPLICATE KEY UPDATE
      ${atualizaveis.map((c) => `${c} = VALUES(${c})`).join(',\n      ')}`;
}

/**
 * Remove do fato as linhas cuja nota foi cancelada ou excluída DEPOIS de já
 * ter sido carregada — o filtro do INSERT impede que entrem, mas não desfaz
 * o que já entrou. Sem isto, uma nota cancelada hoje continuaria somando ao
 * faturamento para sempre.
 */
const SQL_LIMPEZA = `
  DELETE f FROM etl_fatcom f
  JOIN sysemp_nota_fiscal nf
    ON nf.id_empresa = f.cd_filial
   AND ${NUMERO_NF} = f.nf
   AND ${SERIE_NF} = f.serie
  WHERE f.origem_dados = 'SYSEMP'
    AND (nf.deleted = TRUE OR nf.data_cancelamento_nfe IS NOT NULL OR COALESCE(nf.status_nota, '') = '101')
`;

export interface OpcoesEtlFatcom {
  /**
   * Apaga as linhas de `origem_dados = 'SYSEMP'` antes de carregar. Usado na
   * reconstrução, para eliminar o que a versão anterior gravou com custo
   * zerado e notas canceladas. Não toca em nenhuma outra origem — o KPL,
   * quando existir, é preservado.
   *
   * Atenção: recarregar refaz o congelamento do custo com o valor de hoje.
   */
  recargaCompleta?: boolean;
}

export async function rodarEtlFatcom(idLog: number, opcoes: OpcoesEtlFatcom = {}): Promise<ResultadoSincronizacao> {
  const inicio = Date.now();

  if (opcoes.recargaCompleta) {
    const [apagadas] = await pool.query(`DELETE FROM etl_fatcom WHERE origem_dados = 'SYSEMP'`);
    await integracaoLog.detalhe(idLog, {
      status: 'ok',
      qtdeRegistros: (apagadas as { affectedRows: number }).affectedRows,
      mensagem: `Recarga completa: ${(apagadas as { affectedRows: number }).affectedRows} linha(s) da origem SYSEMP removida(s).`,
    });
  }

  const [resultado] = await pool.query(montarInsert());
  const qtde = (resultado as { affectedRows: number }).affectedRows;

  const [removidas] = await pool.query(SQL_LIMPEZA);
  const canceladas = (removidas as { affectedRows: number }).affectedRows;

  await integracaoLog.detalhe(idLog, {
    status: 'ok',
    qtdeRegistros: qtde,
    duracaoMs: Date.now() - inicio,
    mensagem: canceladas > 0 ? `${canceladas} linha(s) de nota cancelada/excluída removida(s).` : undefined,
  });

  return { qtde };
}
