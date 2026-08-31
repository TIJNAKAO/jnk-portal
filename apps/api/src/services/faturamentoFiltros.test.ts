import { describe, expect, test } from 'vitest';
import { montarFiltro, montarFiltroComEscopo, type FiltroFaturamento } from './faturamentoFiltros.js';

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

  test('busca procura em número da NF, cliente e produto ao mesmo tempo', () => {
    const { where, params } = montarFiltro({ busca: 'makita' });

    expect(where).toContain('nf LIKE ?');
    expect(where).toContain('dc_clifor LIKE ?');
    expect(where).toContain('dc_produto LIKE ?');
    expect(where).toContain('cd_produto LIKE ?');
    expect(params).toEqual(['S', '%makita%', '%makita%', '%makita%', '%makita%']);
  });

  test('as alternativas da busca ficam entre parênteses, para não vazar o OR', () => {
    const { where } = montarFiltro({ busca: 'x', empresas: [1] });

    // Sem os parênteses, `A AND B OR C` traria linhas de outra empresa.
    expect(where).toContain('(nf LIKE ?');
    expect(where).toMatch(/\(nf LIKE \?.*\)/);
  });

  test('busca só com espaços é ignorada', () => {
    expect(montarFiltro({ busca: '   ' }).params).toEqual(['S']);
  });

  test('caracteres curinga do LIKE na busca são escapados', () => {
    // Sem escape, "100%" viraria "qualquer coisa começando com 100".
    expect(montarFiltro({ busca: '100%' }).params[1]).toBe('%100\\%%');
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

describe('montarFiltroComEscopo', () => {
  const escopoJnk = [
    { origem: 'SYSEMP', cdFilial: 1 },
    { origem: 'SYSEMP', cdFilial: 2 },
  ];

  test('sem escolha de empresa, restringe ao escopo do usuário', () => {
    const { where, params } = montarFiltroComEscopo({}, escopoJnk);

    expect(where).toContain('(origem_dados = ? AND cd_filial = ?)');
    expect(params).toEqual(['S', 'SYSEMP', 1, 'SYSEMP', 2]);
  });

  test('empresa escolhida dentro do escopo é respeitada', () => {
    expect(montarFiltroComEscopo({ empresas: [2] }, escopoJnk).params).toEqual(['S', 'SYSEMP', 2]);
  });

  test('empresa escolhida FORA do escopo não retorna nada — não vaza', () => {
    // A empresa 3 (NK2) chega pela query string. Quem só tem JNK não pode
    // vê-la de jeito nenhum, e a consulta precisa devolver vazio.
    expect(montarFiltroComEscopo({ empresas: [3] }, escopoJnk).where).toContain('1 = 0');
  });

  test('usuário sem nenhuma empresa vinculada não enxerga nada', () => {
    expect(montarFiltroComEscopo({}, []).where).toContain('1 = 0');
  });

  test('o escopo é somado por AND, nunca substitui os filtros da tela', () => {
    const { where } = montarFiltroComEscopo({ marcas: ['MAKITA'] }, escopoJnk);
    expect(where).toContain('marca IN (?)');
    expect(where).toContain(' AND ');
  });
});
