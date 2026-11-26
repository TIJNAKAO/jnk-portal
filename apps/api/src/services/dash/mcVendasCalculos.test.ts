import { describe, expect, test } from 'vitest';
import {
  aliquotaDaNota,
  calcularMc,
  classificarAbc,
  classificarFaixa,
  componentesDaLinha,
  percentualSobre,
  type InsumosLinhaMc,
} from './mcVendasCalculos.js';

/**
 * Fórmulas da MC Vendas (Specs/spec_modulo_dash.md, seção 2).
 * Margem errada não gera erro em log: chega errada na decisão de preço.
 */

function linha(sobrescritas: Partial<InsumosLinhaMc> = {}): InsumosLinhaMc {
  return {
    qtde: 1,
    vt_merc: 0,
    vt_icms: 0,
    vt_pis: 0,
    vt_cofins: 0,
    vt_icms_difal: 0,
    vt_fecp: 0,
    vt_tx_fatur: 0,
    vt_add_frete: 0,
    vu_custo_liquido: 0,
    ...sobrescritas,
  };
}

describe('componentesDaLinha', () => {
  test('custo líquido é o unitário vezes a quantidade', () => {
    expect(componentesDaLinha(linha({ qtde: 3, vu_custo_liquido: 50 })).custoLiquido).toBe(150);
  });

  test('sem custo, o custo líquido fica nulo, não zero', () => {
    expect(componentesDaLinha(linha({ qtde: 3, vu_custo_liquido: null })).custoLiquido).toBeNull();
  });

  test('PIS e COFINS saem somados, DIFAL leva o FECP junto', () => {
    const c = componentesDaLinha(linha({ vt_pis: 16.5, vt_cofins: 76, vt_icms_difal: 60, vt_fecp: 20 }));
    expect(c.pisCofins).toBe(92.5);
    expect(c.difal).toBe(80);
  });
});

describe('calcularMc', () => {
  test('desconta custo líquido, os três impostos, tarifa e frete', () => {
    const c = componentesDaLinha(
      linha({
        qtde: 1,
        vt_merc: 1000,
        vu_custo_liquido: 500,
        vt_icms: 120,
        vt_pis: 14.52,
        vt_cofins: 66.88,
        vt_icms_difal: 60,
        vt_tx_fatur: 120,
        vt_add_frete: 30,
      }),
    );
    expect(calcularMc(c)).toBeCloseTo(88.6, 6);
  });

  test('sem custo, a MC é nula', () => {
    expect(calcularMc(componentesDaLinha(linha({ vt_merc: 1000, vu_custo_liquido: null })))).toBeNull();
  });

  test('pode ser negativa', () => {
    const c = componentesDaLinha(linha({ vt_merc: 100, vu_custo_liquido: 90, vt_icms: 18, vt_tx_fatur: 12 }));
    expect(calcularMc(c)).toBe(-20);
  });

  test('serve a um total: somar e calcular dá o mesmo que calcular e somar', () => {
    const a = componentesDaLinha(linha({ vt_merc: 200, vu_custo_liquido: 80, vt_icms: 24, vt_tx_fatur: 20 }));
    const b = componentesDaLinha(linha({ qtde: 2, vt_merc: 300, vu_custo_liquido: 60, vt_pis: 10, vt_add_frete: 15 }));
    const soma = {
      vendas: a.vendas + b.vendas,
      custoLiquido: (a.custoLiquido ?? 0) + (b.custoLiquido ?? 0),
      icms: a.icms + b.icms,
      pisCofins: a.pisCofins + b.pisCofins,
      difal: a.difal + b.difal,
      tarifa: a.tarifa + b.tarifa,
      frete: a.frete + b.frete,
    };
    expect(calcularMc(soma)).toBeCloseTo((calcularMc(a) ?? 0) + (calcularMc(b) ?? 0), 6);
  });
});

describe('percentualSobre', () => {
  test('devolve pontos percentuais', () => {
    expect(percentualSobre(120, 1000)).toBe(12);
  });

  test('sem base ou sem valor, é nulo', () => {
    expect(percentualSobre(120, 0)).toBeNull();
    expect(percentualSobre(null, 1000)).toBeNull();
  });
});

describe('aliquotaDaNota', () => {
  test('usa a alíquota informada no item', () => {
    expect(aliquotaDaNota(7, 1.84, 26.29)).toBe(7);
  });

  test('sem alíquota informada, recupera por valor sobre base', () => {
    expect(aliquotaDaNota(0, 12, 100)).toBe(12);
  });

  test('sem imposto ou sem base, não há alíquota', () => {
    expect(aliquotaDaNota(12, 0, 100)).toBeNull();
    expect(aliquotaDaNota(0, 5, 0)).toBeNull();
  });
});

describe('classificarFaixa', () => {
  test('os limites pertencem à faixa de cima', () => {
    expect(classificarFaixa(9.99, true)).toBe('lt10');
    expect(classificarFaixa(10, true)).toBe('f1015');
    expect(classificarFaixa(15, true)).toBe('f1520');
    expect(classificarFaixa(20, true)).toBe('f2025');
    expect(classificarFaixa(25, true)).toBe('ge25');
  });

  test('MC negativa cai na faixa mais baixa', () => {
    expect(classificarFaixa(-7, true)).toBe('lt10');
  });

  test('sem custo vence qualquer percentual', () => {
    expect(classificarFaixa(null, false)).toBe('semcusto');
  });

  test('com custo mas sem base de percentual não entra em faixa', () => {
    expect(classificarFaixa(null, true)).toBeNull();
  });
});

describe('classificarAbc', () => {
  test('A até 80% acumulado, B até 95%, C o resto', () => {
    expect(classificarAbc([50, 30, 10, 6, 4])).toEqual(['A', 'A', 'B', 'B', 'C']);
  });

  test('a classe segue a posição original, não a ordem da curva', () => {
    expect(classificarAbc([4, 50, 6, 30, 10])).toEqual(['C', 'A', 'B', 'A', 'B']);
  });

  test('um campeão sozinho acima de 80% continua sendo A', () => {
    expect(classificarAbc([90, 10])).toEqual(['A', 'B']);
  });

  test('MC negativa ou zero é C', () => {
    expect(classificarAbc([100, -5, 0])).toEqual(['A', 'C', 'C']);
  });

  test('sem custo não é classificado', () => {
    expect(classificarAbc([100, null])).toEqual(['A', null]);
  });

  test('ninguém com MC positiva: todos C', () => {
    expect(classificarAbc([-1, -2])).toEqual(['C', 'C']);
  });
});
