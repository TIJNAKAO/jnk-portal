import { describe, expect, test } from 'vitest';
import { ultimoDiaDoMes, valorizarLinhaFull } from './estoqueCustoFechamento.js';

/**
 * A única parte do módulo com risco contábil de verdade. Um erro aqui
 * produz um custo errado que ninguém questiona, porque o número continua
 * parecendo razoável. Ver Specs/spec_modulo_estoque.md, seção 3.5.
 */
const PERCENTUAL = 50;

describe('valorizarLinhaFull', () => {
  test('usa o custo do Fechamento quando existe e é positivo', () => {
    const r = valorizarLinhaFull({ qtde: 10, custoEstoque: 3, precoVenda: 20, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCustoEstoque).toBe(3);
    expect(r.vuCustoVenda).toBeNull();
    expect(r.vuCusto).toBe(3);
    expect(r.valorCustoTotal).toBe(30);
  });

  test('o preço de venda não é consultado quando há custo — vuCustoVenda fica nulo', () => {
    const r = valorizarLinhaFull({ qtde: 1, custoEstoque: 3, precoVenda: 100, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCustoVenda).toBeNull();
  });

  test('custo zero cai para o percentual do preço de venda', () => {
    const r = valorizarLinhaFull({ qtde: 2, custoEstoque: 0, precoVenda: 20, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCustoEstoque).toBe(0);
    expect(r.vuCustoVenda).toBe(10);
    expect(r.vuCusto).toBe(10);
    expect(r.valorCustoTotal).toBe(20);
  });

  test('custo nulo cai para o percentual do preço de venda', () => {
    const r = valorizarLinhaFull({ qtde: 2, custoEstoque: null, precoVenda: 20, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCusto).toBe(10);
  });

  test('custo negativo também cai para o preço de venda', () => {
    const r = valorizarLinhaFull({ qtde: 1, custoEstoque: -5, precoVenda: 20, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCusto).toBe(10);
  });

  test('o percentual é percentual mesmo: 50 significa metade', () => {
    const r = valorizarLinhaFull({ qtde: 1, custoEstoque: null, precoVenda: 80, percentualCustoVenda: 50 });

    expect(r.vuCustoVenda).toBe(40);
  });

  test('percentual diferente de 50 é respeitado', () => {
    const r = valorizarLinhaFull({ qtde: 1, custoEstoque: null, precoVenda: 80, percentualCustoVenda: 25 });

    expect(r.vuCustoVenda).toBe(20);
  });

  test('sem custo e sem preço fica sem custo, e não custo zero', () => {
    const r = valorizarLinhaFull({ qtde: 5, custoEstoque: null, precoVenda: null, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCusto).toBeNull();
    expect(r.valorCustoTotal).toBeNull();
  });

  test('preço de venda zero conta como ausência de preço', () => {
    const r = valorizarLinhaFull({ qtde: 5, custoEstoque: null, precoVenda: 0, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCusto).toBeNull();
  });

  test('quantidade nula não vira zero: sem quantidade não há valor total', () => {
    const r = valorizarLinhaFull({ qtde: null, custoEstoque: 3, precoVenda: null, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCusto).toBe(3);
    expect(r.valorCustoTotal).toBeNull();
  });

  test('quantidade zero é zero, e o valor total é zero — não nulo', () => {
    const r = valorizarLinhaFull({ qtde: 0, custoEstoque: 3, precoVenda: null, percentualCustoVenda: PERCENTUAL });

    expect(r.valorCustoTotal).toBe(0);
  });

  test('quantidade negativa (estorno) é preservada com o sinal', () => {
    const r = valorizarLinhaFull({ qtde: -2, custoEstoque: 3, precoVenda: null, percentualCustoVenda: PERCENTUAL });

    expect(r.valorCustoTotal).toBe(-6);
  });
});

describe('ultimoDiaDoMes', () => {
  test('mes de 31 dias', () => {
    expect(ultimoDiaDoMes('2026-07-01').getDate()).toBe(31);
  });

  test('mes de 30 dias', () => {
    expect(ultimoDiaDoMes('2026-04-01').getDate()).toBe(30);
  });

  test('fevereiro comum', () => {
    expect(ultimoDiaDoMes('2026-02-01').getDate()).toBe(28);
  });

  test('fevereiro bissexto', () => {
    expect(ultimoDiaDoMes('2024-02-01').getDate()).toBe(29);
  });

  test('dezembro nao vaza para o ano seguinte', () => {
    const data = ultimoDiaDoMes('2026-12-01');

    expect(data.getDate()).toBe(31);
    expect(data.getMonth()).toBe(11);
    expect(data.getFullYear()).toBe(2026);
  });
});
