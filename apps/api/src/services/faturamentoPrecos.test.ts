import { describe, expect, test } from 'vitest';
import type { EmpresaPermitida } from './escopoEmpresas.js';
import { montarCondicoes } from './faturamentoPrecos.js';

/**
 * O WHERE desta tela é fronteira de segurança: `sysemp_preco` guarda preço
 * por empresa, e cinco das nove empresas SysEmp são contas de marketplace
 * com preços bem diferentes entre si. Um escopo frouxo aqui vaza tabela de
 * preço de uma companhia para quem só deveria ver outra.
 */
const ESCOPO: EmpresaPermitida[] = [
  { origem: 'SYSEMP', cdFilial: 1 },
  { origem: 'SYSEMP', cdFilial: 4 },
  { origem: 'KPL', cdFilial: 7 },
];

describe('montarCondicoes', () => {
  test('restringe às empresas SysEmp do usuário, ignorando as do KPL', () => {
    // A empresa 7 do KPL não pode liberar a 7 da SysEmp — são companhias
    // diferentes que compartilham o número.
    const { where, params } = montarCondicoes({}, ESCOPO);

    expect(where).toContain('p.id_empresa IN (?,?)');
    expect(params).toEqual([1, 4]);
  });

  test('escopo vazio gera condição sempre falsa, não ausência de filtro', () => {
    const { where, params } = montarCondicoes({}, []);

    expect(where).toBe('1 = 0');
    expect(params).toEqual([]);
  });

  test('escopo só de KPL também falha fechado nesta tela', () => {
    expect(montarCondicoes({}, [{ origem: 'KPL', cdFilial: 1 }]).where).toBe('1 = 0');
  });

  test('empresa pedida na tela soma ao escopo, sem substituí-lo', () => {
    // O IN do escopo continua no WHERE; o pedido é uma segunda condição.
    // Assim, pedir a empresa 9 (fora do escopo) devolve nada, em vez de
    // conceder acesso a ela.
    const { where, params } = montarCondicoes({ empresas: [9] }, ESCOPO);

    expect(where).toContain('p.id_empresa IN (?,?)');
    expect(params).toEqual([1, 4, 9]);
  });

  test('busca cobre código, descrição, código auxiliar e código de barras', () => {
    const { where, params } = montarCondicoes({ busca: '13' }, ESCOPO);

    expect(where).toContain('p.id_produto = ?');
    expect(params).toEqual([1, 4, 13, '%13%', '%13%', '13']);
  });

  test('busca não numérica não vira id_produto — usa -1, que não existe', () => {
    const { params } = montarCondicoes({ busca: 'SWISS' }, ESCOPO);

    expect(params).toEqual([1, 4, -1, '%SWISS%', '%SWISS%', 'SWISS']);
  });

  test('filtro de marca entra parametrizado', () => {
    const { where, params } = montarCondicoes({ marcas: ['DISPLAY SHOW', 'OUTRA'] }, ESCOPO);

    expect(where).toContain('pr.descricao_marca IN (?,?)');
    expect(params).toEqual([1, 4, 'DISPLAY SHOW', 'OUTRA']);
  });

  test('só promoção exige preço promocional e vigência na data de hoje', () => {
    const { where } = montarCondicoes({ soPromocao: true }, ESCOPO);

    expect(where).toContain('p.preco_promocao > 0');
    expect(where).toContain('p.data_inicio_promocao <= CURDATE()');
    expect(where).toContain('p.data_termino_promocao IS NULL OR p.data_termino_promocao >= CURDATE()');
  });

  test('sem promoção vigente pedida, não filtra por promoção', () => {
    expect(montarCondicoes({}, ESCOPO).where).not.toContain('CURDATE()');
  });

  test('filtros combinam com AND, todos sob o escopo', () => {
    const { where } = montarCondicoes({ empresas: [1], marcas: ['X'], busca: 'abc', soPromocao: true }, ESCOPO);

    expect(where.startsWith('p.id_empresa IN (?,?) AND')).toBe(true);
    expect(where.split(' AND ').length).toBeGreaterThanOrEqual(5);
  });
});
