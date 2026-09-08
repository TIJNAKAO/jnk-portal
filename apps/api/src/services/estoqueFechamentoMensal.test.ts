import { describe, expect, test } from 'vitest';
import { extrairLinhasFechamento } from './estoqueFechamentoMensal.js';
import { PlanilhaForaDoModeloError, type PlanilhaLida } from './planilha.js';

const CABECALHO = [
  'EMPRESA',
  'ID Produto',
  'Código Auxiliar',
  'Descrição',
  'NCM',
  'Un',
  'Marca',
  'Estoque',
  'Custo',
  'Total',
  'CST Venda',
  'Mês/Ano',
];

function planilha(linhas: (string | null)[][]): PlanilhaLida {
  return { cabecalho: CABECALHO, linhas };
}

const LINHA_OK = [
  'CASA J NAKAO LTDA',
  '4321',
  '0012',
  'PARAFUSO',
  '73181500',
  'UN',
  'ACME',
  '10',
  '2,50',
  '25',
  '000',
  '07/2026',
];

describe('extrairLinhasFechamento', () => {
  test('lê uma linha completa', () => {
    const { validas, ignoradas } = extrairLinhasFechamento(planilha([LINHA_OK]));

    expect(ignoradas).toEqual([]);
    expect(validas[0]).toEqual({
      periodo: '2026-07-01',
      empresa: 'CASA J NAKAO LTDA',
      idProduto: 4321,
      codigoAuxiliar: '0012',
      descricao: 'PARAFUSO',
      ncm: '73181500',
      unidade: 'UN',
      marca: 'ACME',
      estoque: 10,
      custo: 2.5,
      total: 25,
      cstVenda: '000',
    });
  });

  test('preserva zero à esquerda do código auxiliar', () => {
    const { validas } = extrairLinhasFechamento(planilha([LINHA_OK]));

    expect(validas[0]?.codigoAuxiliar).toBe('0012');
  });

  test('cabeçalho fora de ordem funciona igual', () => {
    const invertido = [...CABECALHO].reverse();
    const linhaInvertida = [...LINHA_OK].reverse();

    const { validas } = extrairLinhasFechamento({ cabecalho: invertido, linhas: [linhaInvertida] });

    expect(validas[0]?.idProduto).toBe(4321);
    expect(validas[0]?.periodo).toBe('2026-07-01');
  });

  test('coluna faltando derruba a importação inteira', () => {
    expect(() => extrairLinhasFechamento({ cabecalho: ['EMPRESA'], linhas: [] })).toThrow(
      PlanilhaForaDoModeloError,
    );
  });

  test('empresa vazia ignora a linha, apontando o número na planilha', () => {
    const semEmpresa = [...LINHA_OK];
    semEmpresa[0] = '';

    const { validas, ignoradas } = extrairLinhasFechamento(planilha([semEmpresa]));

    expect(validas).toEqual([]);
    expect(ignoradas).toEqual([{ linha: 2, motivo: 'EMPRESA ou ID Produto vazio/inválido.' }]);
  });

  test('id de produto não numérico ignora a linha', () => {
    const idRuim = [...LINHA_OK];
    idRuim[1] = 'ABC';

    const { ignoradas } = extrairLinhasFechamento(planilha([idRuim]));

    expect(ignoradas[0]?.motivo).toMatch(/ID Produto/);
  });

  test('período inválido ignora a linha com motivo próprio', () => {
    const periodoRuim = [...LINHA_OK];
    periodoRuim[11] = '13/2026';

    const { ignoradas } = extrairLinhasFechamento(planilha([periodoRuim]));

    expect(ignoradas).toEqual([{ linha: 2, motivo: 'Mês/Ano inválido (esperado MM/AAAA).' }]);
  });

  test('o número da linha ignorada conta o cabeçalho como linha 1', () => {
    const ruim = [...LINHA_OK];
    ruim[0] = '';

    const { ignoradas } = extrairLinhasFechamento(planilha([LINHA_OK, LINHA_OK, ruim]));

    expect(ignoradas[0]?.linha).toBe(4);
  });

  test('custo vazio vira nulo, não zero', () => {
    const semCusto = [...LINHA_OK];
    semCusto[8] = '';

    const { validas } = extrairLinhasFechamento(planilha([semCusto]));

    expect(validas[0]?.custo).toBeNull();
  });

  test('linha válida e linha inválida convivem na mesma planilha', () => {
    const ruim = [...LINHA_OK];
    ruim[1] = '';

    const { validas, ignoradas } = extrairLinhasFechamento(planilha([LINHA_OK, ruim]));

    expect(validas).toHaveLength(1);
    expect(ignoradas).toHaveLength(1);
  });
});
