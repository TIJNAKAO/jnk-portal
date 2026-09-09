import type { PoolConnection } from '../../../config/database.js';
import { inteiro, numeroSeguro } from '../dbUtil.js';
import { registrarConsumidorFila } from '../fila.js';

/**
 * Consumidor de fila pra Pedido de Compra (tipo_tabela 5). Cabeçalho e
 * itens vêm juntos no mesmo JSON de `/listarPedidosCompra`, como Nota
 * Fiscal — sem a limitação de `/listarPedidos` (Pedido de Venda), que
 * exige janela de data.
 *
 * Não confundir com NF Compra (tipo_tabela 3, documento fiscal de
 * entrada) — este é o pedido em si, pode não ter NF nenhuma emitida
 * ainda. Ver Specs/spec_modulo_integracao.md, seção 3.3.
 *
 * `campo_id_detalhe` da busca é "id_compra", mas o campo homônimo na
 * resposta é "id_pedcompra" — os dois nomes não são o mesmo texto.
 * `id_fornecedor` do payload vira `idParceiroFornecedor`, pra bater com a
 * convenção de `sysemp_pedido`.
 */

export interface CabecalhoPedidoCompra {
  idEmpresa: number | null;
  idParceiroFornecedor: number | null;
  dataPedido: string | null;
  dataPrevEntrega: string | null;
  valorBruto: number | null;
  valorDesconto: number | null;
  valorFrete: number | null;
  valorIpi: number | null;
  valorLiquidoPedido: number | null;
  totalGeral: number | null;
  comprador: string | null;
  observacao: string | null;
  tipoPedido: string | null;
  codigoStatus: string | null;
  statusPedido: string | null;
  statusEntrega: string | null;
}

export interface ItemPedidoCompra {
  item: number;
  idProduto: number | null;
  qtdePedido: number | null;
  qtdePendente: number | null;
  qtdeRecebido: number | null;
  desconto: number | null;
  totalBruto: number | null;
  totalLiquido: number | null;
  valorUnitarioBruto: number | null;
  valorUnitarioLiquido: number | null;
  aliquotaIpi: number | null;
  aliquotaIcms: number | null;
  dataPrevEntrega: string | null;
}

interface PedidoCompraPayload {
  itens?: Record<string, unknown>[];
  [chave: string]: unknown;
}

export function extrairCabecalhoPedidoCompra(
  payload: Record<string, unknown> | null,
): CabecalhoPedidoCompra | null {
  if (!payload) return null;

  return {
    idEmpresa: inteiro(payload, 'id_empresa'),
    idParceiroFornecedor: inteiro(payload, 'id_fornecedor'),
    dataPedido: (payload.data_pedido as string | null) ?? null,
    dataPrevEntrega: (payload.data_prev_entrega as string | null) ?? null,
    valorBruto: numeroSeguro(payload, 'valor_bruto'),
    valorDesconto: numeroSeguro(payload, 'valor_desconto'),
    valorFrete: numeroSeguro(payload, 'valor_frete'),
    valorIpi: numeroSeguro(payload, 'valor_ipi'),
    valorLiquidoPedido: numeroSeguro(payload, 'valor_liquido_pedido'),
    totalGeral: numeroSeguro(payload, 'total_geral'),
    comprador: (payload.comprador as string | null) ?? null,
    observacao: (payload.observacao as string | null) ?? null,
    tipoPedido: (payload.tipo_pedido as string | null) ?? null,
    codigoStatus: (payload.codigo_status as string | null) ?? null,
    statusPedido: (payload.status_pedido as string | null) ?? null,
    statusEntrega: (payload.status_entrega as string | null) ?? null,
  };
}

export function extrairItensPedidoCompra(payload: Record<string, unknown> | null): ItemPedidoCompra[] {
  const itens = (payload as PedidoCompraPayload | null)?.itens ?? [];
  const validos: ItemPedidoCompra[] = [];

  for (const item of itens) {
    const numeroItem = inteiro(item, 'item');
    if (numeroItem === null) continue; // sem número de item, não há como formar a chave (id_pedcompra, item)

    validos.push({
      item: numeroItem,
      idProduto: inteiro(item, 'id_produto'),
      qtdePedido: numeroSeguro(item, 'qtde_pedido'),
      qtdePendente: numeroSeguro(item, 'qtde_pendente'),
      qtdeRecebido: numeroSeguro(item, 'qtde_recebido'),
      desconto: numeroSeguro(item, 'desconto'),
      totalBruto: numeroSeguro(item, 'total_bruto'),
      totalLiquido: numeroSeguro(item, 'total_liquido'),
      valorUnitarioBruto: numeroSeguro(item, 'valor_unitario_bruto'),
      valorUnitarioLiquido: numeroSeguro(item, 'valor_unitario_liquido'),
      aliquotaIpi: numeroSeguro(item, 'aliquota_ipi'),
      aliquotaIcms: numeroSeguro(item, 'aliquota_icms'),
      dataPrevEntrega: (item.data_prev_entrega as string | null) ?? null,
    });
  }

  return validos;
}

async function gravarPedidoCompra(
  connection: PoolConnection,
  payload: Record<string, unknown> | null,
  acao: 'I' | 'U' | 'D',
  idRegistro: number,
): Promise<void> {
  if (acao === 'D') {
    await connection.query('UPDATE sysemp_pedido_compra SET deleted = TRUE WHERE id_pedcompra = ?', [idRegistro]);
    await connection.query('UPDATE sysemp_pedido_compra_item SET deleted = TRUE WHERE id_pedcompra = ?', [
      idRegistro,
    ]);
    return;
  }

  const cabecalho = extrairCabecalhoPedidoCompra(payload);
  if (!cabecalho) return;

  await connection.query(
    `INSERT INTO sysemp_pedido_compra (
       id_pedcompra, id_empresa, id_parceiro_fornecedor, data_pedido, data_prev_entrega,
       valor_bruto, valor_desconto, valor_frete, valor_ipi, valor_liquido_pedido, total_geral,
       comprador, observacao, tipo_pedido, codigo_status, status_pedido, status_entrega,
       deleted, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       id_empresa = VALUES(id_empresa), id_parceiro_fornecedor = VALUES(id_parceiro_fornecedor),
       data_pedido = VALUES(data_pedido), data_prev_entrega = VALUES(data_prev_entrega),
       valor_bruto = VALUES(valor_bruto), valor_desconto = VALUES(valor_desconto),
       valor_frete = VALUES(valor_frete), valor_ipi = VALUES(valor_ipi),
       valor_liquido_pedido = VALUES(valor_liquido_pedido), total_geral = VALUES(total_geral),
       comprador = VALUES(comprador), observacao = VALUES(observacao), tipo_pedido = VALUES(tipo_pedido),
       codigo_status = VALUES(codigo_status), status_pedido = VALUES(status_pedido),
       status_entrega = VALUES(status_entrega), deleted = FALSE, synced_at = CURRENT_TIMESTAMP`,
    [
      idRegistro,
      cabecalho.idEmpresa,
      cabecalho.idParceiroFornecedor,
      cabecalho.dataPedido,
      cabecalho.dataPrevEntrega,
      cabecalho.valorBruto,
      cabecalho.valorDesconto,
      cabecalho.valorFrete,
      cabecalho.valorIpi,
      cabecalho.valorLiquidoPedido,
      cabecalho.totalGeral,
      cabecalho.comprador,
      cabecalho.observacao,
      cabecalho.tipoPedido,
      cabecalho.codigoStatus,
      cabecalho.statusPedido,
      cabecalho.statusEntrega,
    ],
  );

  // Soft-delete de todos os itens antes do upsert, "revivendo" só os que
  // vêm na resposta atual — item que sumir fica deleted=true.
  await connection.query('UPDATE sysemp_pedido_compra_item SET deleted = TRUE WHERE id_pedcompra = ?', [idRegistro]);

  for (const item of extrairItensPedidoCompra(payload)) {
    await connection.query(
      `INSERT INTO sysemp_pedido_compra_item (
         id_pedcompra, item, id_produto, qtde_pedido, qtde_pendente, qtde_recebido, desconto,
         total_bruto, total_liquido, valor_unitario_bruto, valor_unitario_liquido,
         aliquota_ipi, aliquota_icms, data_prev_entrega, deleted, synced_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         id_produto = VALUES(id_produto), qtde_pedido = VALUES(qtde_pedido),
         qtde_pendente = VALUES(qtde_pendente), qtde_recebido = VALUES(qtde_recebido),
         desconto = VALUES(desconto), total_bruto = VALUES(total_bruto), total_liquido = VALUES(total_liquido),
         valor_unitario_bruto = VALUES(valor_unitario_bruto), valor_unitario_liquido = VALUES(valor_unitario_liquido),
         aliquota_ipi = VALUES(aliquota_ipi), aliquota_icms = VALUES(aliquota_icms),
         data_prev_entrega = VALUES(data_prev_entrega), deleted = FALSE, synced_at = CURRENT_TIMESTAMP`,
      [
        idRegistro,
        item.item,
        item.idProduto,
        item.qtdePedido,
        item.qtdePendente,
        item.qtdeRecebido,
        item.desconto,
        item.totalBruto,
        item.totalLiquido,
        item.valorUnitarioBruto,
        item.valorUnitarioLiquido,
        item.aliquotaIpi,
        item.aliquotaIcms,
        item.dataPrevEntrega,
      ],
    );
  }
}

registrarConsumidorFila({ tipoTabela: 5, gravar: gravarPedidoCompra });
