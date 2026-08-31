import { describe, expect, test } from 'vitest';
import {
  aplicarEscopo,
  aplicarFoco,
  condicaoEscopo,
  condicaoEscopoPorRecno,
  type FilialPermitida,
} from './escopoFilial.js';

function filial(recno: number, origem: string, cdFilial: number): FilialPermitida {
  return { recno, origem, cdFilial, nome: `F${recno}`, grupo: 'JNK', empresa: null };
}

const PERMITIDAS = [filial(1, 'SYSEMP', 1), filial(2, 'SYSEMP', 2), filial(23, 'KPL', 1)];

describe('aplicarFoco', () => {
  test('sem filial em foco, devolve tudo que o usuário pode ver', () => {
    expect(aplicarFoco(PERMITIDAS, null)).toEqual(PERMITIDAS);
  });

  test('com uma filial em foco, restringe àquela', () => {
    expect(aplicarFoco(PERMITIDAS, 2)).toEqual([filial(2, 'SYSEMP', 2)]);
  });

  test('foco numa filial FORA da permissão não amplia o acesso', () => {
    // Regressão mais importante desta mudança: o seletor é conveniência,
    // não permissão. Focar o que não se pode ver devolve vazio.
    expect(aplicarFoco(PERMITIDAS, 99)).toEqual([]);
  });

  test('usuário sem permissão nenhuma continua sem ver nada, com ou sem foco', () => {
    expect(aplicarFoco([], null)).toEqual([]);
    expect(aplicarFoco([], 2)).toEqual([]);
  });
});

describe('aplicarEscopo', () => {
  test('sem pedido, devolve tudo que o usuário pode ver', () => {
    expect(aplicarEscopo(undefined, PERMITIDAS)).toEqual(PERMITIDAS);
  });

  test('lista vazia equivale a não ter pedido nada', () => {
    expect(aplicarEscopo([], PERMITIDAS)).toEqual(PERMITIDAS);
  });

  test('filtra pelos recnos pedidos', () => {
    expect(aplicarEscopo([23], PERMITIDAS)).toEqual([filial(23, 'KPL', 1)]);
  });

  test('recno fora da permissão é descartado, nunca concedido', () => {
    expect(aplicarEscopo([99], PERMITIDAS)).toEqual([]);
  });

  test('sem permissão nenhuma, nada é devolvido', () => {
    expect(aplicarEscopo(undefined, [])).toEqual([]);
  });
});

describe('condicaoEscopo', () => {
  test('escopo vazio produz condição sempre falsa, nunca condição ausente', () => {
    expect(condicaoEscopo([])).toEqual({ where: '1 = 0', params: [] });
  });

  test('cada filial vira um par origem+código', () => {
    expect(condicaoEscopo([filial(2, 'SYSEMP', 2)])).toEqual({
      where: '((origem_dados = ? AND cd_filial = ?))',
      params: ['SYSEMP', 2],
    });
  });

  test('várias filiais são alternativas dentro de um único parêntese', () => {
    const { where, params } = condicaoEscopo([filial(1, 'SYSEMP', 1), filial(23, 'KPL', 1)]);
    expect(where).toBe('((origem_dados = ? AND cd_filial = ?) OR (origem_dados = ? AND cd_filial = ?))');
    expect(params).toEqual(['SYSEMP', 1, 'KPL', 1]);
  });
});

describe('condicaoEscopoPorRecno', () => {
  test('escopo vazio produz condição sempre falsa', () => {
    expect(condicaoEscopoPorRecno([], 'e.filial_id')).toEqual({ where: '1 = 0', params: [] });
  });

  test('usa o recno, para tabelas do portal que apontam para config_filial', () => {
    expect(condicaoEscopoPorRecno(PERMITIDAS, 'e.filial_id')).toEqual({
      where: 'e.filial_id IN (?,?,?)',
      params: [1, 2, 23],
    });
  });
});
