import { describe, expect, test } from 'vitest';
import { extrairCabecalhoPedidoCompra, extrairItensPedidoCompra } from './pedidosCompra.js';

/**
 * Payload real de /listarPedidosCompra (id_compra=294), conferido em
 * produção. Ver Specs/spec_modulo_integracao.md, seção 3.3: campo_id_detalhe
 * da BUSCA é "id_compra", mas o campo homônimo na RESPOSTA é "id_pedcompra"
 * — os dois nomes não são o mesmo texto.
 */
const PAYLOAD_REAL = {
  id_pedcompra: '294',
  codigo_status: '0',
  status_pedido: 'Pedido Liberado',
  id_empresa: '2',
  id_fornecedor: '715103',
  data_pedido: '2026-09-01',
  data_prev_entrega: null,
  valor_liquido_pedido: '2152839.2884',
  valor_desconto: '0.000000000000000000000000',
  valor_frete: '0.00000000',
  valor_ipi: '60707.65807100000000000000000000',
  valor_bruto: '2092131.63000000',
  total_geral: '2222435.3936',
  comprador: null,
  observacao: '',
  tipo_pedido: '0',
  status_entrega: 'RECEBIDO PARCIAL',
  itens: [
    {
      item: 1,
      desconto: 0,
      id_compra: 294,
      id_produto: 449,
      qtde_pedido: 14,
      total_bruto: 232.4,
      aliquota_ipi: 0,
      aliquota_icms: 0,
      qtde_pendente: 14,
      qtde_recebido: 0,
      total_liquido: 232.4,
      data_prev_entrega: null,
      valor_unitario_bruto: 16.6,
      valor_unitario_liquido: 16.6,
    },
    {
      item: 2,
      desconto: 0,
      id_compra: 294,
      id_produto: 1276,
      qtde_pedido: 19,
      total_bruto: 350.74,
      aliquota_ipi: 0,
      aliquota_icms: 0,
      qtde_pendente: 19,
      qtde_recebido: 0,
      total_liquido: 350.74,
      data_prev_entrega: null,
      valor_unitario_bruto: 18.46,
      valor_unitario_liquido: 18.46,
    },
  ],
};

describe('extrairCabecalhoPedidoCompra', () => {
  test('mapeia o payload real, incluindo o rename id_fornecedor -> idParceiroFornecedor', () => {
    const c = extrairCabecalhoPedidoCompra(PAYLOAD_REAL);

    expect(c).toEqual({
      idEmpresa: 2,
      idParceiroFornecedor: 715103,
      dataPedido: '2026-09-01',
      dataPrevEntrega: null,
      valorBruto: 2092131.63,
      valorDesconto: 0,
      valorFrete: 0,
      valorIpi: 60707.658071,
      valorLiquidoPedido: 2152839.2884,
      totalGeral: 2222435.3936,
      comprador: null,
      observacao: '',
      tipoPedido: '0',
      codigoStatus: '0',
      statusPedido: 'Pedido Liberado',
      statusEntrega: 'RECEBIDO PARCIAL',
    });
  });

  test('payload nulo devolve nulo', () => {
    expect(extrairCabecalhoPedidoCompra(null)).toBeNull();
  });

  test('comprador ausente vira null, nao string vazia', () => {
    const c = extrairCabecalhoPedidoCompra({ ...PAYLOAD_REAL, comprador: null });
    expect(c?.comprador).toBeNull();
  });

  test('data_prev_entrega nula continua nula', () => {
    const c = extrairCabecalhoPedidoCompra(PAYLOAD_REAL);
    expect(c?.dataPrevEntrega).toBeNull();
  });
});

describe('extrairItensPedidoCompra', () => {
  test('mapeia os dois itens do payload real', () => {
    const itens = extrairItensPedidoCompra(PAYLOAD_REAL);

    expect(itens).toHaveLength(2);
    expect(itens[0]).toEqual({
      item: 1,
      idProduto: 449,
      qtdePedido: 14,
      qtdePendente: 14,
      qtdeRecebido: 0,
      desconto: 0,
      totalBruto: 232.4,
      totalLiquido: 232.4,
      valorUnitarioBruto: 16.6,
      valorUnitarioLiquido: 16.6,
      aliquotaIpi: 0,
      aliquotaIcms: 0,
      dataPrevEntrega: null,
    });
  });

  test('payload nulo devolve lista vazia', () => {
    expect(extrairItensPedidoCompra(null)).toEqual([]);
  });

  test('payload sem itens devolve lista vazia', () => {
    expect(extrairItensPedidoCompra({ id_pedcompra: '1' })).toEqual([]);
  });

  test('item sem numero e ignorado, sem derrubar os demais', () => {
    const itens = extrairItensPedidoCompra({
      itens: [{ id_produto: 1 }, { item: 2, id_produto: 2 }],
    });

    expect(itens).toHaveLength(1);
    expect(itens[0]?.item).toBe(2);
  });

  test('quantidade zero e zero, nao null', () => {
    const itens = extrairItensPedidoCompra({
      itens: [{ item: 1, qtde_recebido: 0 }],
    });

    expect(itens[0]?.qtdeRecebido).toBe(0);
  });
});
