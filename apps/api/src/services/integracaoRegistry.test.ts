import { describe, expect, test } from 'vitest';
import { buscarEntidadeIntegracao, ENTIDADES_INTEGRACAO } from './integracaoRegistry.js';

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

  // O teste acima compara duas strings literais diferentes - verdade por
  // construcao, nao pega o risco real: duas entidades cadastradas com a
  // MESMA chave (find() so acharia a primeira, a segunda ficaria invisivel
  // e sincronizarFila nunca seria chamada pra ela). Esta verificacao cobre
  // o registro inteiro, nao so o par notas_compra/pedidos_compra.
  test('nenhuma entidade registrada colide de chave com outra', () => {
    expect(new Set(ENTIDADES_INTEGRACAO.map((e) => e.chave)).size).toBe(ENTIDADES_INTEGRACAO.length);
  });
});
