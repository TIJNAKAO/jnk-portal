import { describe, expect, test } from 'vitest';
import type { EmpresaPermitida } from './escopoEmpresas.js';
import { montarCondicoes } from './estoqueSaldos.js';

/**
 * Mesma fronteira de segurança da consulta de Preços: saldo por empresa,
 * e cinco das nove empresas SysEmp são contas de fulfillment de
 * marketplace. Escopo frouxo aqui mostra o estoque de uma companhia a quem
 * só deveria ver outra.
 */
const ESCOPO: EmpresaPermitida[] = [
  { origem: 'SYSEMP', cdFilial: 1 },
  { origem: 'SYSEMP', cdFilial: 4 },
  { origem: 'KPL', cdFilial: 7 },
];

describe('montarCondicoes', () => {
  test('nunca lista deletados, mesmo sem nenhum filtro', () => {
    expect(montarCondicoes({}, ESCOPO).where).toContain('ef.deleted = FALSE');
  });

  test('o corte de deletados sobrevive a todos os filtros combinados', () => {
    const { where } = montarCondicoes({ empresas: [1], marcas: ['X'], busca: 'abc', soComSaldo: true }, ESCOPO);

    expect(where.startsWith('ef.deleted = FALSE AND')).toBe(true);
  });

  test('restringe às empresas SysEmp do usuário, ignorando as do KPL', () => {
    const { where, params } = montarCondicoes({}, ESCOPO);

    expect(where).toContain('ef.id_empresa IN (?,?)');
    expect(params).toEqual([1, 4]);
  });

  test('escopo vazio gera condição sempre falsa, não ausência de filtro', () => {
    const { where } = montarCondicoes({}, []);

    expect(where).toBe('ef.deleted = FALSE AND 1 = 0');
  });

  test('escopo só de KPL também falha fechado nesta tela', () => {
    expect(montarCondicoes({}, [{ origem: 'KPL', cdFilial: 1 }]).where).toContain('1 = 0');
  });

  test('empresa pedida na tela soma ao escopo, sem substituí-lo', () => {
    const { where, params } = montarCondicoes({ empresas: [9] }, ESCOPO);

    expect(where).toContain('ef.id_empresa IN (?,?)');
    expect(params).toEqual([1, 4, 9]);
  });

  test('busca cobre código, descrição, código auxiliar e código de barras', () => {
    const { params } = montarCondicoes({ busca: '13' }, ESCOPO);

    expect(params).toEqual([1, 4, 13, '%13%', '%13%', '13']);
  });

  test('busca não numérica não vira id_produto — usa -1, que não existe', () => {
    const { params } = montarCondicoes({ busca: 'SWISS' }, ESCOPO);

    expect(params).toEqual([1, 4, -1, '%SWISS%', '%SWISS%', 'SWISS']);
  });

  test('só com saldo soma os oito depósitos com COALESCE', () => {
    // Sem COALESCE, um único depósito NULL anularia a soma inteira e
    // esconderia item que tem saldo em outro depósito.
    const { where } = montarCondicoes({ soComSaldo: true }, ESCOPO);

    expect(where).toContain('COALESCE(ef.saldo_disponivel, 0)');
    expect(where).toContain('COALESCE(ef.estoque_armazem_externo, 0)');
    expect((where.match(/COALESCE/g) ?? []).length).toBe(8);
  });

  test('por padrão mostra linha zerada — é consulta, não análise', () => {
    expect(montarCondicoes({}, ESCOPO).where).not.toContain('COALESCE');
  });
});
