import type { PoolConnection } from '../../config/database.js';
import { withTransaction } from '../../config/database.js';
import * as integracaoLog from '../integracaoLog.js';
import type { ResultadoSincronizacao } from '../integracaoLog.js';
import { accessTokenValido, buscarPedidosMl, listarContas } from './client.js';

const DIAS_PADRAO = 7;
const LIMITE_PAGINA = 50;

interface OrderMlItem {
  item: { id: string; title?: string; category_id?: string; seller_sku?: string; seller_custom_field?: string };
  variation_id?: number;
  quantity: number;
  unit_price: number;
  full_unit_price?: number;
  sale_fee?: number;
  currency_id?: string;
}

interface OrderMlPayment {
  shipping_cost?: number;
  transaction_amount_refunded?: number;
}

interface OrderMl {
  id: number;
  pack_id?: number;
  status: string;
  status_detail?: string | null;
  date_created: string;
  date_closed?: string | null;
  last_updated?: string | null;
  total_amount: number;
  paid_amount: number;
  currency_id?: string;
  buyer?: { id?: number; nickname?: string };
  shipping?: { id?: number };
  tags?: string[];
  order_items?: OrderMlItem[];
  payments?: OrderMlPayment[];
}

async function gravarPedido(connection: PoolConnection, userIdMl: number, pedido: OrderMl): Promise<void> {
  const frete = (pedido.payments ?? []).reduce((soma, p) => soma + (p.shipping_cost ?? 0), 0);
  const valorDevolvido = (pedido.payments ?? []).reduce((soma, p) => soma + (p.transaction_amount_refunded ?? 0), 0);
  const canal = (pedido.tags ?? []).includes('mshops') ? 'mshops' : 'marketplace';

  await connection.query(
    `INSERT INTO ml_pedido (
       id_pedido, user_id_ml, pack_id, status, status_detalhe, canal, data_criacao, data_fechamento,
       data_ultima_atualizacao, valor_total, valor_pago, frete, valor_devolvido, moeda, comprador_id,
       comprador_nickname, shipping_id, tags
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status), status_detalhe = VALUES(status_detalhe), data_fechamento = VALUES(data_fechamento),
       data_ultima_atualizacao = VALUES(data_ultima_atualizacao), valor_total = VALUES(valor_total),
       valor_pago = VALUES(valor_pago), frete = VALUES(frete), valor_devolvido = VALUES(valor_devolvido),
       tags = VALUES(tags)`,
    [
      pedido.id,
      userIdMl,
      pedido.pack_id ?? null,
      pedido.status,
      pedido.status_detail ?? null,
      canal,
      new Date(pedido.date_created),
      pedido.date_closed ? new Date(pedido.date_closed) : null,
      pedido.last_updated ? new Date(pedido.last_updated) : null,
      pedido.total_amount,
      pedido.paid_amount,
      frete,
      valorDevolvido,
      pedido.currency_id ?? 'BRL',
      pedido.buyer?.id ?? null,
      pedido.buyer?.nickname ?? '',
      pedido.shipping?.id ?? null,
      (pedido.tags ?? []).join(','),
    ],
  );

  // Sem chave natural por item — delete + insert por pedido, mesmo padrão de sysemp_preco.
  await connection.query('DELETE FROM ml_pedido_item WHERE id_pedido = ?', [pedido.id]);

  for (const item of pedido.order_items ?? []) {
    await connection.query(
      `INSERT INTO ml_pedido_item (id_pedido, item_id, variacao_id, titulo, sku, categoria, qtde, preco_unitario, preco_cheio, taxa_venda, moeda)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pedido.id,
        item.item.id,
        item.variation_id ?? null,
        item.item.title ?? '',
        item.item.seller_sku ?? item.item.seller_custom_field ?? '',
        item.item.category_id ?? '',
        item.quantity,
        item.unit_price,
        item.full_unit_price ?? null,
        item.sale_fee ?? null,
        item.currency_id ?? 'BRL',
      ],
    );
  }
}

/**
 * Busca pedidos de todas as contas conectadas, últimos `DIAS_PADRAO` dias.
 * Ver Specs/spec_modulo_integracao.md, seção 3.3 — frete detalhado
 * (`/shipments/{id}`) fica pra fase futura.
 */
export async function sincronizarMlPedidos(idLog: number): Promise<ResultadoSincronizacao> {
  const contas = await listarContas();
  if (contas.length === 0) {
    await integracaoLog.detalhe(idLog, { status: 'ok', qtdeRegistros: 0, mensagem: 'Nenhuma conta do Mercado Livre conectada.' });
    return { qtde: 0 };
  }

  const dataDe = new Date();
  dataDe.setDate(dataDe.getDate() - DIAS_PADRAO);
  const dataAte = new Date();

  let total = 0;

  for (const conta of contas) {
    if (await integracaoLog.foiCancelado(idLog)) return { qtde: total, cancelado: true };

    let offset = 0;
    for (;;) {
      const inicio = Date.now();
      try {
        const accessToken = await accessTokenValido(conta);
        const resposta = await buscarPedidosMl<{ results: OrderMl[]; paging: { total: number } }>(accessToken, {
          seller: String(conta.user_id_ml),
          'order.date_created.from': dataDe.toISOString(),
          'order.date_created.to': dataAte.toISOString(),
          sort: 'date_desc',
          offset: String(offset),
          limit: String(LIMITE_PAGINA),
        });
        const pedidos = resposta.results ?? [];
        if (pedidos.length === 0) break;

        await withTransaction(async (connection) => {
          for (const pedido of pedidos) {
            await gravarPedido(connection, conta.user_id_ml, pedido);
          }
        });

        total += pedidos.length;
        await integracaoLog.detalhe(idLog, {
          pagina: offset,
          status: 'ok',
          qtdeRegistros: pedidos.length,
          duracaoMs: Date.now() - inicio,
          mensagem: `Conta ${conta.nickname}.`,
        });

        offset += pedidos.length;
        if (offset >= resposta.paging.total) break;
      } catch (error) {
        await integracaoLog.detalhe(idLog, {
          status: 'erro',
          mensagem: `Conta ${conta.nickname}: ${(error as Error).message}`,
          duracaoMs: Date.now() - inicio,
        });
        throw error;
      }
    }
  }

  return { qtde: total };
}
