import { describe, expect, test } from 'vitest';
import {
  calcularLiquido,
  calcularMargem,
  calcularPercentualMargem,
  type InsumosFaturamento,
} from './faturamentoCalculos.js';

/**
 * Fórmulas de líquido e margem do módulo Faturamento
 * (Specs/spec_modulo_faturamento.md, seção 4.2).
 *
 * Estas contas são a razão de o Vitest existir neste repositório: margem
 * errada não gera erro em log nenhum — chega errada numa reunião.
 */

/** Item sem imposto, taxa ou custo: base para cada teste sobrescrever só o que importa. */
function insumos(sobrescritas: Partial<InsumosFaturamento> = {}): InsumosFaturamento {
  return {
    vt_merc: 0,
    vt_icms: 0,
    vt_icms_st: 0,
    vt_ipi: 0,
    vt_pis: 0,
    vt_cofins: 0,
    vt_icms_difal: 0,
    vt_fecp: 0,
    vt_tx_fatur: 0,
    vt_add_frete: 0,
    vt_custo: 0,
    vu_custo: null,
    ...sobrescritas,
  };
}

describe('calcularLiquido', () => {
  test('sem deduções, o líquido é o próprio valor da mercadoria', () => {
    expect(calcularLiquido(insumos({ vt_merc: 1000 }))).toBe(1000);
  });

  test('deduz cada um dos sete tributos', () => {
    const resultado = calcularLiquido(
      insumos({
        vt_merc: 1000,
        vt_icms: 100,
        vt_icms_st: 50,
        vt_ipi: 40,
        vt_pis: 16.5,
        vt_cofins: 76,
        vt_icms_difal: 30,
        vt_fecp: 7.5,
      }),
    );

    expect(resultado).toBe(680);
  });

  test('deduz comissão de marketplace e frete seller', () => {
    expect(calcularLiquido(insumos({ vt_merc: 1000, vt_tx_fatur: 130, vt_add_frete: 70 }))).toBe(800);
  });

  test('devolução, com mercadoria negativa, produz líquido negativo', () => {
    expect(calcularLiquido(insumos({ vt_merc: -500, vt_icms: -90 }))).toBe(-410);
  });
});

describe('calcularMargem', () => {
  test('é o líquido menos o custo total', () => {
    expect(calcularMargem(insumos({ vt_merc: 1000, vt_icms: 180, vt_custo: 500, vu_custo: 250 }))).toBe(320);
  });

  test('é nula quando o produto não tem custo conhecido', () => {
    expect(calcularMargem(insumos({ vt_merc: 1000, vt_custo: 0, vu_custo: null }))).toBeNull();
  });

  test('custo zero informado é diferente de custo desconhecido', () => {
    expect(calcularMargem(insumos({ vt_merc: 1000, vt_custo: 0, vu_custo: 0 }))).toBe(1000);
  });

  test('é negativa quando o custo supera o líquido', () => {
    expect(calcularMargem(insumos({ vt_merc: 100, vt_custo: 150, vu_custo: 150 }))).toBe(-50);
  });
});

describe('calcularPercentualMargem', () => {
  test('é a margem sobre o valor da mercadoria, em pontos percentuais', () => {
    expect(calcularPercentualMargem(insumos({ vt_merc: 1000, vt_custo: 600, vu_custo: 600 }))).toBe(40);
  });

  test('é nulo quando não há custo conhecido', () => {
    expect(calcularPercentualMargem(insumos({ vt_merc: 1000, vu_custo: null }))).toBeNull();
  });

  test('é nulo quando a mercadoria é zero, em vez de dividir por zero', () => {
    expect(calcularPercentualMargem(insumos({ vt_merc: 0, vt_custo: 10, vu_custo: 10 }))).toBeNull();
  });
});

describe('agregação', () => {
  /**
   * As fórmulas são lineares nos insumos, então somar as linhas e aplicar a
   * fórmula dá o mesmo que aplicar a fórmula e somar. É isso que permite o
   * dashboard usar as MESMAS funções sobre totais vindos de SUM() no SQL,
   * sem reescrever as fórmulas em duas linguagens.
   */
  test('a fórmula sobre a soma dos itens é igual à soma dos líquidos', () => {
    const itemA = insumos({ vt_merc: 1000, vt_icms: 180, vt_tx_fatur: 100, vt_custo: 400, vu_custo: 400 });
    const itemB = insumos({ vt_merc: 500, vt_icms: 90, vt_tx_fatur: 50, vt_custo: 200, vu_custo: 200 });

    const somaDosLiquidos = calcularLiquido(itemA) + calcularLiquido(itemB);
    const liquidoDaSoma = calcularLiquido(
      insumos({ vt_merc: 1500, vt_icms: 270, vt_tx_fatur: 150, vt_custo: 600, vu_custo: 600 }),
    );

    expect(liquidoDaSoma).toBe(somaDosLiquidos);
  });
});
