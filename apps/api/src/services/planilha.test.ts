import ExcelJS from 'exceljs';
import { describe, expect, test } from 'vitest';
import {
  lerPlanilha,
  mapearColunas,
  parseNumero,
  parsePeriodo,
  parseTexto,
  PlanilhaForaDoModeloError,
} from './planilha.js';

/**
 * O cabeçalho é mapeado por NOME, nunca por posição: reordenar colunas na
 * planilha não pode quebrar a importação. Herdado do portal PHP e
 * deliberado. Ver Specs/spec_modulo_estoque.md, seção 3.4.
 */

async function montarPlanilha(linhas: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Plan1');
  for (const linha of linhas) sheet.addRow(linha);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('mapearColunas', () => {
  test('mapeia cada coluna esperada para o seu índice', () => {
    expect(mapearColunas(['A', 'B', 'C'], ['A', 'C'])).toEqual({ A: 0, C: 2 });
  });

  test('cabeçalho fora de ordem funciona igual', () => {
    expect(mapearColunas(['C', 'B', 'A'], ['A', 'B', 'C'])).toEqual({ A: 2, B: 1, C: 0 });
  });

  test('coluna a mais na planilha é ignorada', () => {
    expect(mapearColunas(['A', 'EXTRA', 'B'], ['A', 'B'])).toEqual({ A: 0, B: 2 });
  });

  test('coluna faltando derruba a importação nomeando o que faltou', () => {
    expect(() => mapearColunas(['A'], ['A', 'B', 'C'])).toThrow(PlanilhaForaDoModeloError);
    expect(() => mapearColunas(['A'], ['A', 'B', 'C'])).toThrow(/B, C/);
  });

  test('espaço em volta do nome da coluna não atrapalha', () => {
    expect(mapearColunas(['  A  ', 'B'], ['A', 'B'])).toEqual({ A: 0, B: 1 });
  });
});

describe('parsePeriodo', () => {
  test('converte MM/AAAA no primeiro dia do mês', () => {
    expect(parsePeriodo('07/2026')).toBe('2026-07-01');
  });

  test('aceita mês com um dígito só', () => {
    expect(parsePeriodo('7/2026')).toBe('2026-07-01');
  });

  test('mês fora de 1..12 é inválido', () => {
    expect(parsePeriodo('13/2026')).toBeNull();
    expect(parsePeriodo('0/2026')).toBeNull();
  });

  test('formato diferente de MM/AAAA é inválido', () => {
    expect(parsePeriodo('2026-07')).toBeNull();
    expect(parsePeriodo('julho/2026')).toBeNull();
    expect(parsePeriodo('07/26')).toBeNull();
  });

  test('vazio e nulo são inválidos', () => {
    expect(parsePeriodo('')).toBeNull();
    expect(parsePeriodo(null)).toBeNull();
    expect(parsePeriodo(undefined)).toBeNull();
  });
});

describe('parseNumero', () => {
  test('lê número com ponto decimal', () => {
    expect(parseNumero('12.5')).toBe(12.5);
  });

  test('lê número com vírgula decimal, como o Excel pt-BR escreve', () => {
    expect(parseNumero('12,5')).toBe(12.5);
  });

  test('lê negativo', () => {
    expect(parseNumero('-3')).toBe(-3);
  });

  test('zero é zero, não nulo', () => {
    expect(parseNumero('0')).toBe(0);
  });

  test('vazio vira nulo, não zero', () => {
    expect(parseNumero('')).toBeNull();
    expect(parseNumero(null)).toBeNull();
  });

  test('texto que não é número vira nulo, nunca NaN', () => {
    expect(parseNumero('abc')).toBeNull();
  });
});

describe('parseTexto', () => {
  test('apara espaços', () => {
    expect(parseTexto('  x  ')).toBe('x');
  });

  test('vazio vira nulo', () => {
    expect(parseTexto('   ')).toBeNull();
    expect(parseTexto(null)).toBeNull();
  });
});

describe('lerPlanilha', () => {
  test('devolve o cabeçalho e as linhas seguintes', async () => {
    const buffer = await montarPlanilha([
      ['EMPRESA', 'QTDE'],
      ['JNK', '10'],
      ['CNK2', '20'],
    ]);

    const { cabecalho, linhas } = await lerPlanilha(buffer);

    expect(cabecalho).toEqual(['EMPRESA', 'QTDE']);
    expect(linhas).toEqual([
      ['JNK', '10'],
      ['CNK2', '20'],
    ]);
  });

  test('célula que o Excel guarda como número chega como texto', async () => {
    const buffer = await montarPlanilha([
      ['CD_PRODUTO', 'QTDE'],
      [1234, 10.5],
    ]);

    const { linhas } = await lerPlanilha(buffer);

    expect(linhas[0]).toEqual(['1234', '10.5']);
  });

  test('célula vazia vira nulo, sem deslocar as colunas seguintes', async () => {
    const buffer = await montarPlanilha([
      ['A', 'B', 'C'],
      ['x', null, 'z'],
    ]);

    const { linhas } = await lerPlanilha(buffer);

    expect(linhas[0]).toEqual(['x', null, 'z']);
  });

  test('linha inteiramente vazia é descartada', async () => {
    const buffer = await montarPlanilha([['A'], ['x'], [null], ['y']]);

    const { linhas } = await lerPlanilha(buffer);

    expect(linhas).toEqual([['x'], ['y']]);
  });

  test('planilha sem nenhuma aba é recusada', async () => {
    const workbook = new ExcelJS.Workbook();
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(lerPlanilha(buffer)).rejects.toThrow(PlanilhaForaDoModeloError);
  });

  test('arquivo que não é xlsx é recusado com erro de modelo, não erro interno', async () => {
    await expect(lerPlanilha(Buffer.from('isto nao e uma planilha'))).rejects.toThrow(
      PlanilhaForaDoModeloError,
    );
  });
});
