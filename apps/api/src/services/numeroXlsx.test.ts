import { describe, expect, test } from 'vitest';
import { numeroXlsx } from './numeroXlsx.js';

/**
 * mysql2 devolve DECIMAL como string por padrão (o pool não configura
 * `decimalNumbers: true` — ver `config/database.ts`), então toda linha
 * exportada para .xlsx precisa passar por aqui antes de `sheet.addRows`.
 * Sem isso o exceljs grava a STRING na célula, e o Excel mostra "número
 * armazenado como texto": o ponto decimal aparece literal, sem nenhuma
 * formatação de locale.
 */
describe('numeroXlsx', () => {
  test('converte string decimal do mysql2 em number de verdade', () => {
    const r = numeroXlsx('96.8588');
    expect(r).toBe(96.8588);
    expect(typeof r).toBe('number');
  });

  test('numero ja numerico passa sem alteracao', () => {
    expect(numeroXlsx(42)).toBe(42);
  });

  test('null continua null, nao vira zero', () => {
    expect(numeroXlsx(null)).toBeNull();
  });

  test('undefined vira null', () => {
    expect(numeroXlsx(undefined)).toBeNull();
  });

  test('string vazia vira null, nao NaN nem zero', () => {
    expect(numeroXlsx('')).toBeNull();
  });

  test('texto que nao e numero vira null, nunca NaN na celula', () => {
    expect(numeroXlsx('abc')).toBeNull();
  });

  test('preserva negativo', () => {
    expect(numeroXlsx('-3.5000')).toBe(-3.5);
  });

  test('zero em string continua zero, nao null', () => {
    expect(numeroXlsx('0.0000')).toBe(0);
  });
});
