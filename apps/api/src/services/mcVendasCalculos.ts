/**
 * Fórmulas da MC Vendas (margem de contribuição venda a venda).
 * Ver Specs/spec_modulo_faturamento.md, seção 12.
 *
 * Empresa de **lucro real**: a conta compara a receita, já sem os tributos
 * destacados na NF de saída, com o **custo líquido** — o custo de entrada sem
 * os créditos de ICMS, PIS e COFINS. É a resposta à pendência 6 da seção 9,
 * que media a margem contra custo bruto.
 *
 * Vivem aqui, e só aqui, pelo mesmo motivo de `faturamentoCalculos.ts`: são
 * lineares nos insumos, então a mesma função serve para uma linha e para um
 * total vindo de `SUM()`.
 */

/** Os sete números que formam a MC. Servem tanto a uma linha quanto a um total. */
export interface ComponentesMc {
  /** Valor da mercadoria vendida. */
  vendas: number;
  /** Custo líquido de créditos (unitário × quantidade). `null` = custo desconhecido, nunca zero. */
  custoLiquido: number | null;
  icms: number;
  /** PIS + COFINS de saída. */
  pisCofins: number;
  /** DIFAL + FECP: os dois são devidos ao estado de destino na mesma operação. */
  difal: number;
  /** Comissão e taxas do marketplace. */
  tarifa: number;
  /** Frete pago pelo vendedor. */
  frete: number;
}

/** Colunas de `etl_fatcom` que a MC lê, mais o custo líquido vindo do Fechamento. */
export interface InsumosLinhaMc {
  qtde: number;
  vt_merc: number;
  vt_icms: number;
  vt_pis: number;
  vt_cofins: number;
  vt_icms_difal: number;
  vt_fecp: number;
  vt_tx_fatur: number;
  vt_add_frete: number;
  /** Custo líquido unitário. `null` quando o produto não tem Fechamento de Custo. */
  vu_custo_liquido: number | null;
}

export function componentesDaLinha(l: InsumosLinhaMc): ComponentesMc {
  return {
    vendas: l.vt_merc,
    custoLiquido: l.vu_custo_liquido === null ? null : l.qtde * l.vu_custo_liquido,
    icms: l.vt_icms,
    pisCofins: l.vt_pis + l.vt_cofins,
    difal: l.vt_icms_difal + l.vt_fecp,
    tarifa: l.vt_tx_fatur,
    frete: l.vt_add_frete,
  };
}

/**
 * MC = vendas − custo líquido − ICMS − PIS/COFINS − DIFAL − tarifa − frete.
 *
 * IPI e ICMS-ST ficam de fora de propósito: são cobrados por fora do valor
 * da mercadoria, então não saem da receita que `vendas` representa.
 *
 * `null` sem custo: margem sobre custo desconhecido não é zero, é "não sei".
 */
export function calcularMc(c: ComponentesMc): number | null {
  if (c.custoLiquido === null) return null;
  return c.vendas - c.custoLiquido - c.icms - c.pisCofins - c.difal - c.tarifa - c.frete;
}

/** `valor` em pontos percentuais de `base`. `null` quando não há base ou valor. */
export function percentualSobre(valor: number | null, base: number): number | null {
  if (valor === null || base === 0) return null;
  return (valor / base) * 100;
}

export const FAIXAS_MC = ['lt10', 'f1015', 'f1520', 'f2025', 'ge25', 'semcusto'] as const;
export type FaixaMc = (typeof FAIXAS_MC)[number];

/**
 * Faixa de MC % de uma linha. `null` quando há custo mas não há base para o
 * percentual (venda de valor zero) — a linha não pertence a faixa nenhuma.
 */
export function classificarFaixa(percMc: number | null, temCusto: boolean): FaixaMc | null {
  if (!temCusto) return 'semcusto';
  if (percMc === null) return null;
  if (percMc < 10) return 'lt10';
  if (percMc < 15) return 'f1015';
  if (percMc < 20) return 'f1520';
  if (percMc < 25) return 'f2025';
  return 'ge25';
}

export type ClasseAbc = 'A' | 'B' | 'C';

/**
 * Curva ABC sobre a MC: A até 80% da MC positiva acumulada, B até 95%, C o
 * restante. Devolve a classe na mesma ordem da entrada.
 *
 * Produto com MC negativa ou zero é C: não contribui, então não pode ocupar
 * lugar na curva. Produto sem custo fica `null` — não dá para classificar o
 * que não se mede.
 */
export function classificarAbc(mcs: (number | null)[]): (ClasseAbc | null)[] {
  const totalPositivo = mcs.reduce<number>((soma, mc) => soma + (mc !== null && mc > 0 ? mc : 0), 0);
  const classes: (ClasseAbc | null)[] = mcs.map(() => null);

  const ordem = mcs
    .map((mc, indice) => ({ mc, indice }))
    .filter((item): item is { mc: number; indice: number } => item.mc !== null)
    .sort((a, b) => b.mc - a.mc);

  let acumulado = 0;
  for (const { mc, indice } of ordem) {
    if (mc <= 0 || totalPositivo === 0) {
      classes[indice] = 'C';
      continue;
    }
    // A classe é decidida pelo acumulado ANTES do item: o produto que cruza
    // os 80% ainda é A, senão um campeão sozinho acima de 80% cairia em B.
    const antes = acumulado / totalPositivo;
    classes[indice] = antes < 0.8 ? 'A' : antes < 0.95 ? 'B' : 'C';
    acumulado += mc;
  }

  return classes;
}
