import { describe, expect, test } from 'vitest';
import { extrairLinhasInventario } from './estoqueInventarioFisico.js';
import { PlanilhaForaDoModeloError, type PlanilhaLida } from './planilha.js';

const CABECALHO = [
  'ID_EMPRESA', 'PERIODO', 'CD_PRODUTO', 'DC_PRODUTO', 'MARCA', 'ALMOX',
  'CONTAGEM_1', 'CONTAGEM_2', 'CONTAGEM_3', 'CONTAGEM_4', 'CONTAGEM_5',
  'CONTAGEM_FINAL', 'SALDO_SYSEMP', 'DIVERGENCIA', 'ANALISE', 'ACAO',
];

function planilha(linhas: (string | null)[][]): PlanilhaLida {
  return { cabecalho: CABECALHO, linhas };
}

const LINHA_OK = [
  '7', '07/2026', '0012', 'PARAFUSO', 'ACME', 'PRINCIPAL',
  '10', '11', '10', '', '', '10', '12', '-2', 'Recontar', 'Ajustar no ERP',
];

describe('extrairLinhasInventario', () => {
  test('lê uma linha completa', () => {
    const { validas, ignoradas } = extrairLinhasInventario(planilha([LINHA_OK]));

    expect(ignoradas).toEqual([]);
    expect(validas[0]).toEqual({
      periodo: '2026-07-01',
      idEmpresa: 7,
      cdProduto: '0012',
      almox: 'PRINCIPAL',
      marca: 'ACME',
      contagem1: 10,
      contagem2: 11,
      contagem3: 10,
      contagem4: null,
      contagem5: null,
      contagemFinal: 10,
      saldoSysemp: 12,
      divergencia: -2,
      analise: 'Recontar',
      acao: 'Ajustar no ERP',
    });
  });

  test('divergência negativa é preservada com o sinal', () => {
    expect(extrairLinhasInventario(planilha([LINHA_OK])).validas[0]?.divergencia).toBe(-2);
  });

  test('rodada de contagem não feita vira nulo, não zero', () => {
    const { validas } = extrairLinhasInventario(planilha([LINHA_OK]));

    expect(validas[0]?.contagem4).toBeNull();
    expect(validas[0]?.contagem5).toBeNull();
  });

  test('contagem final zero é zero, e não ausência de contagem', () => {
    const zerada = [...LINHA_OK];
    zerada[11] = '0';

    expect(extrairLinhasInventario(planilha([zerada])).validas[0]?.contagemFinal).toBe(0);
  });

  test('mesmo produto em almoxarifados diferentes gera duas linhas', () => {
    const avarias = [...LINHA_OK];
    avarias[5] = 'AVARIAS';

    const { validas } = extrairLinhasInventario(planilha([LINHA_OK, avarias]));

    expect(validas.map((l) => l.almox)).toEqual(['PRINCIPAL', 'AVARIAS']);
  });

  test('almoxarifado vazio vira string vazia, que é o default da coluna', () => {
    const semAlmox = [...LINHA_OK];
    semAlmox[5] = '';

    expect(extrairLinhasInventario(planilha([semAlmox])).validas[0]?.almox).toBe('');
  });

  test('coluna faltando derruba a importação', () => {
    const semAcao = CABECALHO.filter((c) => c !== 'ACAO');

    expect(() => extrairLinhasInventario({ cabecalho: semAcao, linhas: [] })).toThrow(
      PlanilhaForaDoModeloError,
    );
  });

  test('id de empresa não numérico ignora a linha', () => {
    const ruim = [...LINHA_OK];
    ruim[0] = '';

    expect(extrairLinhasInventario(planilha([ruim])).ignoradas).toEqual([
      { linha: 2, motivo: 'ID_EMPRESA ou CD_PRODUTO vazio/inválido.' },
    ]);
  });

  test('período inválido ignora a linha com motivo próprio', () => {
    const ruim = [...LINHA_OK];
    ruim[1] = 'julho';

    expect(extrairLinhasInventario(planilha([ruim])).ignoradas[0]?.motivo).toBe(
      'PERIODO inválido (esperado MM/AAAA).',
    );
  });
});
