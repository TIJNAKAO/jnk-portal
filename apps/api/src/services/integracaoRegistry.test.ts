import { describe, expect, test } from 'vitest';
import { buscarEntidadeIntegracao } from './integracaoRegistry.js';

/**
 * A chave da entidade precisa ser identica a gravada em
 * sysemp_fila_config pela migration 038_nf_compra_fila_seed.sql.
 * sincronizarFila(chave) busca a configuracao por esse texto: divergencia
 * de uma letra so aparece em runtime, quando o cron roda.
 */
describe('entidade notas_compra', () => {
  test('esta registrada com a chave que a migration 038 grava', () => {
    const entidade = buscarEntidadeIntegracao('notas_compra');
    expect(entidade).toBeDefined();
    expect(entidade?.chave).toBe('notas_compra');
  });

  test('tem nome legivel, que e o que aparece no Painel de Integracao', () => {
    expect(buscarEntidadeIntegracao('notas_compra')?.nome).toBe('Notas Fiscais de Compra');
  });

  test('nao colide com a entidade de Pedido de Compra, que e outra coisa', () => {
    const compra = buscarEntidadeIntegracao('notas_compra');
    const pedido = buscarEntidadeIntegracao('pedidos_compra');
    expect(compra).toBeDefined();
    expect(pedido).toBeDefined();
    expect(compra?.chave).not.toBe(pedido?.chave);
  });
});
