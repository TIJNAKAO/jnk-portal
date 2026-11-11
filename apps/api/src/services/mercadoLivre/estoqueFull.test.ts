import { describe, expect, test } from 'vitest';
import { linhaParaGravacao } from './estoqueFull.js';

const inv = { itemId: 'MLB1', variacaoId: null, inventoryId: 'INV1', sku: 'ABC-1', titulo: 'Furadeira' };

describe('linhaParaGravacao', () => {
  test('separa disponível, não disponível e guarda o detalhe em JSON', () => {
    const detalhe = [
      { status: 'damaged', quantity: 2 },
      { status: 'lost', quantity: 1 },
    ];
    const linha = linhaParaGravacao(inv, {
      inventory_id: 'INV1',
      total: 10,
      available_units: 7,
      not_available_units: 3,
      not_available_detail: detalhe,
    });

    expect(linha.disponivel).toBe(7);
    expect(linha.naoDisponivel).toBe(3);
    expect(linha.total).toBe(10);
    expect(linha.naoDisponivelDetalhe).toBe(JSON.stringify(detalhe));
    expect(linha.sku).toBe('ABC-1');
  });

  test('guarda a resposta bruta, inclusive campos não mapeados', () => {
    const bruto = { inventory_id: 'INV1', total: 5, available_units: 5, not_available_units: 0, campo_novo: 9 };
    const linha = linhaParaGravacao(inv, bruto);
    expect(JSON.parse(linha.payload)).toEqual(bruto);
  });

  test('sem detalhe grava null', () => {
    const linha = linhaParaGravacao(inv, { inventory_id: 'INV1', total: 4, available_units: 4, not_available_units: 0 });
    expect(linha.naoDisponivelDetalhe).toBeNull();
  });

  test('campos ausentes na resposta viram zero', () => {
    const linha = linhaParaGravacao(inv, { inventory_id: 'INV1' } as never);
    expect([linha.total, linha.disponivel, linha.naoDisponivel]).toEqual([0, 0, 0]);
  });
});
