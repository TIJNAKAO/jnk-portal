import { describe, expect, test } from 'vitest';
import { COLUNAS_LEGADO, data, decimal, periodoParaData, texto } from './comprasCustoLegado.js';

/**
 * O legado guarda PERIODO como VARCHAR(6) 'aaaamm' e valores como FLOAT.
 * Aqui vira DATE no primeiro dia do mes e DECIMAL, conforme a spec.
 */
describe('periodoParaData', () => {
  test('converte aaaamm para o primeiro dia do mes', () => {
    expect(periodoParaData('202604')).toBe('2026-04-01');
  });

  test('mantem o mes 12 sem virar o ano', () => {
    expect(periodoParaData('202512')).toBe('2025-12-01');
  });

  test('cobre o periodo mais antigo da carga', () => {
    expect(periodoParaData('201701')).toBe('2017-01-01');
  });

  test('recusa periodo fora do formato em vez de gravar lixo', () => {
    expect(() => periodoParaData('2026-4')).toThrow();
    expect(() => periodoParaData('202613')).toThrow();
    expect(() => periodoParaData('')).toThrow();
  });
});

describe('texto', () => {
  test('tira espaco das pontas — o legado usa CHAR e vem preenchido', () => {
    expect(texto('  ABC123  ')).toBe('ABC123');
  });

  test('vazio vira null, nao string vazia', () => {
    expect(texto('')).toBeNull();
    expect(texto('   ')).toBeNull();
    expect(texto(undefined)).toBeNull();
  });
});

describe('decimal', () => {
  test('le numero com ponto decimal', () => {
    expect(decimal('21.62424')).toBe(21.62424);
  });

  test('aceita negativo e zero', () => {
    expect(decimal('0')).toBe(0);
    expect(decimal('-1.5')).toBe(-1.5);
  });

  test('campo vazio do bcp vira null', () => {
    expect(decimal('')).toBeNull();
    expect(decimal(undefined)).toBeNull();
  });

  test('texto que nao e numero lanca em vez de virar NaN ou null em silencio', () => {
    expect(() => decimal('N/D')).toThrow();
  });
});

describe('data', () => {
  test('mantem data ISO', () => {
    expect(data('2026-04-01')).toBe('2026-04-01');
  });

  test('vazio vira null', () => {
    expect(data('')).toBeNull();
    expect(data(undefined)).toBeNull();
  });

  test('recusa data fora do formato ISO em vez de deixar o MySQL adivinhar', () => {
    expect(() => data('01/04/2026')).toThrow();
  });
});

describe('COLUNAS_LEGADO', () => {
  test('tem as 36 colunas do KPL_ULT_COMPRA, na ordem do export', () => {
    expect(COLUNAS_LEGADO).toHaveLength(36);
    expect(COLUNAS_LEGADO[0]).toBe('CD_EMPRESA');
    expect(COLUNAS_LEGADO[1]).toBe('PERIODO');
    expect(COLUNAS_LEGADO[35]).toBe('CST');
  });
});
