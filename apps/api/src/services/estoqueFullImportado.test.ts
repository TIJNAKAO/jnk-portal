import { describe, expect, test } from 'vitest';
import { extrairLinhasFull, normalizarTipoSaldo } from './estoqueFullImportado.js';
import { PlanilhaForaDoModeloError, type PlanilhaLida } from './planilha.js';

const CABECALHO = ['ID_EMPRESA', 'CONTA', 'PERIODO', 'TIPO_SALDO', 'CD_PRODUTO', 'DC_PRODUTO', 'QTDE'];

function planilha(linhas: (string | null)[][]): PlanilhaLida {
  return { cabecalho: CABECALHO, linhas };
}

const LINHA_OK = ['7', 'SHOPEE', '07/2026', 'Aptas para venda', '0012', 'PARAFUSO', '10'];

describe('normalizarTipoSaldo', () => {
  test('vazio vira Disponível para Faturamento', () => {
    expect(normalizarTipoSaldo('')).toBe('Disponível para Faturamento');
    expect(normalizarTipoSaldo(null)).toBe('Disponível para Faturamento');
  });

  test('traço vira Disponível para Faturamento', () => {
    expect(normalizarTipoSaldo('-')).toBe('Disponível para Faturamento');
  });

  test('classificação de verdade é preservada', () => {
    expect(normalizarTipoSaldo('Extraviadas')).toBe('Extraviadas');
  });
});

describe('extrairLinhasFull', () => {
  test('lê uma linha completa', () => {
    const { validas, ignoradas } = extrairLinhasFull(planilha([LINHA_OK]));

    expect(ignoradas).toEqual([]);
    expect(validas[0]).toEqual({
      periodo: '2026-07-01',
      idEmpresa: 7,
      conta: 'SHOPEE',
      tipoSaldo: 'Aptas para venda',
      cdProduto: '0012',
      qtde: 10,
    });
  });

  test('DC_PRODUTO é exigida no cabeçalho mas não é lida', () => {
    const { validas } = extrairLinhasFull(planilha([LINHA_OK]));

    expect(Object.keys(validas[0] ?? {})).not.toContain('descricao');
  });

  test('cabeçalho sem DC_PRODUTO derruba a importação', () => {
    const semDc = CABECALHO.filter((c) => c !== 'DC_PRODUTO');

    expect(() => extrairLinhasFull({ cabecalho: semDc, linhas: [] })).toThrow(PlanilhaForaDoModeloError);
  });

  test('mesmo produto com tipos de saldo diferentes gera duas linhas', () => {
    const extraviada = [...LINHA_OK];
    extraviada[3] = 'Extraviadas';

    const { validas } = extrairLinhasFull(planilha([LINHA_OK, extraviada]));

    expect(validas).toHaveLength(2);
    expect(validas.map((l) => l.tipoSaldo)).toEqual(['Aptas para venda', 'Extraviadas']);
  });

  test('id de empresa não numérico ignora a linha', () => {
    const ruim = [...LINHA_OK];
    ruim[0] = 'JNK';

    const { validas, ignoradas } = extrairLinhasFull(planilha([ruim]));

    expect(validas).toEqual([]);
    expect(ignoradas).toEqual([
      { linha: 2, motivo: 'ID_EMPRESA, CONTA ou CD_PRODUTO vazio/inválido.' },
    ]);
  });

  test('conta vazia ignora a linha', () => {
    const ruim = [...LINHA_OK];
    ruim[1] = '';

    expect(extrairLinhasFull(planilha([ruim])).ignoradas).toHaveLength(1);
  });

  test('período inválido ignora a linha com motivo próprio', () => {
    const ruim = [...LINHA_OK];
    ruim[2] = '2026-07';

    expect(extrairLinhasFull(planilha([ruim])).ignoradas[0]?.motivo).toBe(
      'PERIODO inválido (esperado MM/AAAA).',
    );
  });

  test('quantidade vazia vira nulo, não zero', () => {
    const semQtde = [...LINHA_OK];
    semQtde[6] = '';

    expect(extrairLinhasFull(planilha([semQtde])).validas[0]?.qtde).toBeNull();
  });
});
