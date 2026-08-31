import { describe, expect, test } from 'vitest';
import {
  aplicarEscopo,
  condicaoEscopo,
  condicaoEscopoDeUmaOrigem,
  type EmpresaPermitida,
} from './escopoEmpresas.js';

/**
 * Interseção entre o que o usuário pediu na tela e o que ele tem direito de ver.
 *
 * É a fronteira de segurança dos relatórios: um erro aqui vaza faturamento e
 * margem de uma empresa para quem não deveria vê-los, e vaza em silêncio — a
 * consulta roda e devolve números plausíveis.
 */

const JNK: EmpresaPermitida[] = [
  { origem: 'SYSEMP', cdFilial: 1 },
  { origem: 'SYSEMP', cdFilial: 2 },
  { origem: 'KPL', cdFilial: 1 },
];

describe('aplicarEscopo', () => {
  test('sem pedido do usuário, devolve tudo que ele pode ver', () => {
    expect(aplicarEscopo(undefined, JNK)).toEqual(JNK);
  });

  test('lista vazia do usuário equivale a não ter pedido nada', () => {
    expect(aplicarEscopo([], JNK)).toEqual(JNK);
  });

  test('mantém apenas as empresas pedidas que ele tem direito de ver', () => {
    expect(aplicarEscopo([1], JNK)).toEqual([
      { origem: 'SYSEMP', cdFilial: 1 },
      { origem: 'KPL', cdFilial: 1 },
    ]);
  });

  test('descarta empresa pedida fora do escopo, em vez de concedê-la', () => {
    // O código da empresa chega pela query string: pedir a 3 sem ter direito
    // não pode, em hipótese alguma, devolver a 3.
    expect(aplicarEscopo([3], JNK)).toEqual([]);
  });

  test('mistura de permitida e proibida mantém só a permitida', () => {
    expect(aplicarEscopo([2, 3, 99], JNK)).toEqual([{ origem: 'SYSEMP', cdFilial: 2 }]);
  });

  test('usuário sem nenhuma empresa vinculada não vê nada, mesmo sem pedir filtro', () => {
    // Falha fechada: a ausência de vínculo nunca pode significar "vê tudo".
    expect(aplicarEscopo(undefined, [])).toEqual([]);
    expect(aplicarEscopo([1], [])).toEqual([]);
  });

  test('o mesmo código em origens diferentes são empresas diferentes', () => {
    // SYSEMP 1 é Barueri; KPL 1 é JNK Barueri do ERP antigo. Pedir "1" alcança
    // as duas, mas cada uma só entra se estiver no escopo.
    expect(aplicarEscopo([1], [{ origem: 'KPL', cdFilial: 1 }])).toEqual([{ origem: 'KPL', cdFilial: 1 }]);
  });
});

describe('condicaoEscopo', () => {
  test('escopo vazio produz condição sempre falsa, nunca condição ausente', () => {
    // A distinção entre "1 = 0" e "" é a distinção entre não ver nada e ver
    // tudo. Um WHERE vazio aqui liberaria o faturamento inteiro.
    expect(condicaoEscopo([])).toEqual({ where: '1 = 0', params: [] });
  });

  test('uma empresa vira um par origem+código', () => {
    expect(condicaoEscopo([{ origem: 'SYSEMP', cdFilial: 2 }])).toEqual({
      where: '((origem_dados = ? AND cd_filial = ?))',
      params: ['SYSEMP', 2],
    });
  });

  test('várias empresas são alternativas dentro de um único parêntese', () => {
    // O parêntese externo é obrigatório: sem ele, combinar com outros filtros
    // por AND deixaria o OR vazar e traria empresas fora do escopo.
    const { where, params } = condicaoEscopo([
      { origem: 'SYSEMP', cdFilial: 1 },
      { origem: 'KPL', cdFilial: 4 },
    ]);

    expect(where).toBe('((origem_dados = ? AND cd_filial = ?) OR (origem_dados = ? AND cd_filial = ?))');
    expect(params).toEqual(['SYSEMP', 1, 'KPL', 4]);
  });

  test('aceita nomes de coluna diferentes, para tabelas que não usam o mesmo esquema', () => {
    const { where } = condicaoEscopo([{ origem: 'SYSEMP', cdFilial: 1 }], 'orig', 'emp');
    expect(where).toBe('((orig = ? AND emp = ?))');
  });

  test('a ordem dos parâmetros acompanha a ordem das condições', () => {
    const { params } = condicaoEscopo([
      { origem: 'KPL', cdFilial: 3 },
      { origem: 'SYSEMP', cdFilial: 9 },
    ]);
    expect(params).toEqual(['KPL', 3, 'SYSEMP', 9]);
  });
});

describe('condicaoEscopoDeUmaOrigem', () => {
  const escopo: EmpresaPermitida[] = [
    { origem: 'SYSEMP', cdFilial: 1 },
    { origem: 'KPL', cdFilial: 4 },
    { origem: 'SYSEMP', cdFilial: 2 },
  ];

  test('usa somente os codigos da origem pedida', () => {
    // Estoque so tem dado da SysEmp: a empresa 4 do KPL nao pode virar a
    // empresa 4 da SysEmp so porque compartilham o numero.
    expect(condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', 'ef.id_empresa')).toEqual({
      where: 'ef.id_empresa IN (?,?)',
      params: [1, 2],
    });
  });

  test('sem nenhuma empresa daquela origem, condicao sempre falsa', () => {
    expect(condicaoEscopoDeUmaOrigem([{ origem: 'KPL', cdFilial: 1 }], 'SYSEMP', 'ef.id_empresa')).toEqual({
      where: '1 = 0',
      params: [],
    });
  });

  test('escopo vazio tambem nao libera nada', () => {
    expect(condicaoEscopoDeUmaOrigem([], 'SYSEMP', 'ef.id_empresa').where).toBe('1 = 0');
  });
});
