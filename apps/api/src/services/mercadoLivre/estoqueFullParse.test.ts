import { describe, expect, test } from 'vitest';
import { dataRefBrasilia, extrairInventarios } from './estoqueFullParse.js';

describe('extrairInventarios', () => {
  test('item simples usa o seller_custom_field sem espaços', () => {
    expect(
      extrairInventarios({ id: 'MLB1', title: 'Furadeira', inventory_id: 'INV1', seller_custom_field: ' ABC-1 ' }),
    ).toEqual([{ itemId: 'MLB1', variacaoId: null, inventoryId: 'INV1', sku: 'ABC-1', titulo: 'Furadeira' }]);
  });

  test('item com variações gera uma entrada por variação', () => {
    const r = extrairInventarios({
      id: 'MLB2',
      title: 'Camiseta',
      variations: [
        { id: 11, inventory_id: 'INV2', seller_custom_field: 'X-1' },
        { id: 12, inventory_id: 'INV3', seller_custom_field: 'X-2' },
      ],
    });
    expect(r.map((e) => [e.variacaoId, e.inventoryId, e.sku])).toEqual([
      [11, 'INV2', 'X-1'],
      [12, 'INV3', 'X-2'],
    ]);
  });

  test('SKU só no atributo SELLER_SKU', () => {
    const r = extrairInventarios({
      id: 'MLB3',
      title: 'Cabo',
      inventory_id: 'INV4',
      attributes: [{ id: 'SELLER_SKU', value_name: 'Z-9' }],
    });
    expect(r[0]?.sku).toBe('Z-9');
  });

  test('item sem inventory_id não gera entrada', () => {
    expect(extrairInventarios({ id: 'MLB4', title: 'Sem full' })).toEqual([]);
  });
});

describe('dataRefBrasilia', () => {
  test('antes das 03:00 UTC ainda é o dia anterior em Brasília', () => {
    expect(dataRefBrasilia(new Date('2026-11-05T02:30:00Z'))).toBe('2026-11-04');
  });

  test('às 03:00 UTC vira o dia seguinte', () => {
    expect(dataRefBrasilia(new Date('2026-11-05T03:00:00Z'))).toBe('2026-11-05');
  });
});
