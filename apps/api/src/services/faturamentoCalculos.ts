/**
 * Fórmulas de líquido e margem do módulo Faturamento.
 * Ver Specs/spec_modulo_faturamento.md, seção 3.2.
 *
 * Vivem aqui, e só aqui, de propósito: `etl_fatcom` materializa **insumos**
 * (fatos que não mudam — impostos, custo congelado, comissão), enquanto
 * líquido e margem são **regras**, que mudam. Mantê-las fora do ETL significa
 * que ajustar a definição de margem é um deploy, não uma recarga da tabela.
 *
 * Por serem lineares nos insumos, as mesmas funções servem para uma linha do
 * relatório e para um total agregado vindo de `SUM()` no SQL — o dashboard não
 * reescreve fórmula nenhuma.
 */

export interface InsumosFaturamento {
  /** Valor total da mercadoria do item. */
  vt_merc: number;
  vt_icms: number;
  vt_icms_st: number;
  vt_ipi: number;
  vt_pis: number;
  vt_cofins: number;
  vt_icms_difal: number;
  vt_fecp: number;
  /** Taxa/comissão do marketplace. */
  vt_tx_fatur: number;
  /** Frete pago pelo seller. */
  vt_add_frete: number;
  /** Custo total (unitário × quantidade), congelado na carga do fato. */
  vt_custo: number;
  /** Custo unitário congelado. `null` significa custo desconhecido — não custo zero. */
  vu_custo: number | null;
}

/** Receita líquida: mercadoria menos tributos, comissão de marketplace e frete seller. */
export function calcularLiquido(i: InsumosFaturamento): number {
  return (
    i.vt_merc -
    i.vt_icms -
    i.vt_icms_st -
    i.vt_ipi -
    i.vt_pis -
    i.vt_cofins -
    i.vt_icms_difal -
    i.vt_fecp -
    i.vt_tx_fatur -
    i.vt_add_frete
  );
}

/**
 * Líquido menos o custo. `null` quando o custo é desconhecido — nunca zero,
 * que seria lido como "margem nula" em vez de "não sei".
 */
export function calcularMargem(i: InsumosFaturamento): number | null {
  if (i.vu_custo === null) return null;
  return calcularLiquido(i) - i.vt_custo;
}

/** Margem em pontos percentuais sobre a mercadoria. `null` sem custo ou sem mercadoria. */
export function calcularPercentualMargem(i: InsumosFaturamento): number | null {
  const margem = calcularMargem(i);
  if (margem === null || i.vt_merc === 0) return null;
  return (margem / i.vt_merc) * 100;
}
