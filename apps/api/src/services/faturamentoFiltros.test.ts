import { describe, expect, test } from 'vitest';
import { montarFiltro, type FiltroFaturamento } from './faturamentoFiltros.js';

/**
 * Montagem do WHERE das consultas de faturamento sobre `etl_fatcom`.
 *
 * O que estes testes protegem: placeholders em número diferente dos
 * parâmetros, ou fora de ordem, produzem resultado errado em silêncio — a
 * consulta roda, só devolve o dado de outro filtro.
 */

describe('montarFiltro', () => {
  test('sem filtro nenhum, traz apenas saídas — devoluções ficam de fora por padrão', () => {
    const { where, params } = montarFiltro({});

    expect(where).toBe('ent_sai = ?');
    expect(params).toEqual(['S']);
  });

  test('tipoOperacao "ambos" remove a restrição de entrada/saída', () => {
    const { where, params } = montarFiltro({ tipoOperacao: 'ambos' });

    expect(where).toBe('1 = 1');
    expect(params).toEqual([]);
  });

  test('tipoOperacao "E" traz somente devoluções', () => {
    expect(montarFiltro({ tipoOperacao: 'E' }).params).toEqual(['E']);
  });

  test('empresas viram um IN com um placeholder por valor', () => {
    const { where, params } = montarFiltro({ empresas: [1, 2, 5] });

    expect(where).toContain('cd_filial IN (?,?,?)');
    expect(params).toEqual(['S', 1, 2, 5]);
  });

  test('período completo vira intervalo fechado em dt_movto', () => {
    const { where, params } = montarFiltro({ dataInicio: '2026-03-01', dataFim: '2026-03-31' });

    expect(where).toContain('dt_movto >= ?');
    expect(where).toContain('dt_movto <= ?');
    expect(params).toEqual(['S', '2026-03-01', '2026-03-31']);
  });

  test('apenas data inicial não impõe limite superior', () => {
    const { where, params } = montarFiltro({ dataInicio: '2026-03-01' });

    expect(where).toContain('dt_movto >= ?');
    expect(where).not.toContain('dt_movto <= ?');
    expect(params).toEqual(['S', '2026-03-01']);
  });

  test('geraFinanceiro verdadeiro restringe a ctrl_financeiro S', () => {
    expect(montarFiltro({ geraFinanceiro: true }).params).toEqual(['S', 'S']);
  });

  test('geraFinanceiro falso restringe a ctrl_financeiro N', () => {
    expect(montarFiltro({ geraFinanceiro: false }).params).toEqual(['S', 'N']);
  });

  test('listas vazias não geram condição — evita um IN () que não casa com nada', () => {
    const { where, params } = montarFiltro({ empresas: [], marcas: [], canais: [], origens: [] });

    expect(where).toBe('ent_sai = ?');
    expect(params).toEqual(['S']);
  });

  test('os parâmetros seguem a mesma ordem em que as condições aparecem no WHERE', () => {
    const filtros: FiltroFaturamento = {
      origens: ['SYSEMP'],
      empresas: [2],
      marcas: ['MAKITA'],
      canais: ['BALCAO'],
      dataInicio: '2026-01-01',
      dataFim: '2026-12-31',
      geraFinanceiro: true,
    };

    const { where, params } = montarFiltro(filtros);

    const posicoes = [
      where.indexOf('ent_sai'),
      where.indexOf('origem_dados'),
      where.indexOf('cd_filial'),
      where.indexOf('marca'),
      where.indexOf('canal'),
      where.indexOf('dt_movto >='),
      where.indexOf('dt_movto <='),
      where.indexOf('ctrl_financeiro'),
    ];
    expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b));
    expect(posicoes.every((p) => p >= 0)).toBe(true);

    expect(params).toEqual(['S', 'SYSEMP', 2, 'MAKITA', 'BALCAO', '2026-01-01', '2026-12-31', 'S']);
  });
});
