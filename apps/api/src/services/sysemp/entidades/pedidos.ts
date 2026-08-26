import type { PoolConnection } from '../../../config/database.js';
import { inteiro, valor } from '../dbUtil.js';
import { registrarConsumidorFila, type LinhaFilaPendente } from '../fila.js';
import { sysempPost } from '../client.js';

/**
 * Consumidor de fila pra Pedidos de Venda (tipo_tabela 7).
 *
 * Duas diferenças em relação a Nota Fiscal:
 * 1. `/listarPedidos` NÃO aceita busca por id sozinho — exige
 *    `data_inicial`/`data_final` (devolve HTTP 400 "Undefined property:
 *    stdClass::$data_inicial" sem eles, confirmado em produção). Por isso
 *    usa `buscarDetalhe` pra sobrescrever o fetch genérico da fila: monta
 *    uma janela de +-2 dias em volta de quando o evento foi criado na
 *    SysEmp (`datahora_criacao_sysemp`) e filtra pelo id_nota_saida certo
 *    na resposta.
 * 2. Cabeçalho e itens vêm de DOIS endpoints separados (não aninhados) —
 *    os itens são buscados dentro de `gravarPedido`, num segundo request
 *    pra '/listarPedidosItens' filtrado pelo mesmo id_nota_saida.
 */

const JANELA_DIAS = 2;

async function buscarDetalhePedido(idRegistro: number, linhaFila: LinhaFilaPendente): Promise<Record<string, unknown> | null> {
  const dataBase = linhaFila.datahora_criacao_sysemp ?? new Date();
  const inicio = new Date(dataBase);
  inicio.setDate(inicio.getDate() - JANELA_DIAS);
  const fim = new Date(dataBase);
  fim.setDate(fim.getDate() + JANELA_DIAS);

  const resposta = await sysempPost<{ retorno: Record<string, unknown>[] }>('/listarPedidos', {
    data_inicial: inicio.toISOString().slice(0, 10),
    data_final: fim.toISOString().slice(0, 10),
  });
  const lista = resposta.retorno ?? [];
  return lista.find((p) => inteiro(p, 'id_nota_saida') === idRegistro) ?? null;
}

interface PedidoPayload {
  codigo_empresa?: number;
  numero_pedido_sysemp?: string;
  numero_pedido_marketplace?: string;
  data_pedido?: string;
  tipo_pedido?: string;
  codigo_cliente?: number;
  codigo_vendedor?: number;
  codigo_transportadora?: number;
  valor_total_nota?: number;
  valor_frete?: number;
  valor_comissao?: number;
  valor_desconto?: number;
  data_venda?: string;
  canal_venda?: string;
  data_entrega?: string;
  mensagem_nota?: string;
  [chave: string]: unknown;
}

async function gravarPedido(connection: PoolConnection, payload: Record<string, unknown> | null, acao: 'I' | 'U' | 'D', idRegistro: number): Promise<void> {
  if (acao === 'D') {
    await connection.query('UPDATE sysemp_pedido SET deleted = TRUE WHERE id_nota_saida = ?', [idRegistro]);
    await connection.query('UPDATE sysemp_pedido_item SET deleted = TRUE WHERE id_nota_saida = ?', [idRegistro]);
    return;
  }

  const pedido = payload as PedidoPayload | null;
  if (!pedido) return;

  await connection.query(
    `INSERT INTO sysemp_pedido (
       id_nota_saida, id_empresa, numero_pedido_sysemp, numero_pedido_marketplace, data_pedido, tipo_pedido,
       id_parceiro_cliente, id_parceiro_vendedor, id_parceiro_transportadora, valor_total_nota, valor_frete,
       valor_comissao, valor_desconto, data_venda, canal_venda, data_entrega, mensagem_nota, deleted, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       id_empresa = VALUES(id_empresa), numero_pedido_sysemp = VALUES(numero_pedido_sysemp),
       numero_pedido_marketplace = VALUES(numero_pedido_marketplace), data_pedido = VALUES(data_pedido),
       tipo_pedido = VALUES(tipo_pedido), id_parceiro_cliente = VALUES(id_parceiro_cliente),
       id_parceiro_vendedor = VALUES(id_parceiro_vendedor), id_parceiro_transportadora = VALUES(id_parceiro_transportadora),
       valor_total_nota = VALUES(valor_total_nota), valor_frete = VALUES(valor_frete),
       valor_comissao = VALUES(valor_comissao), valor_desconto = VALUES(valor_desconto),
       data_venda = VALUES(data_venda), canal_venda = VALUES(canal_venda), data_entrega = VALUES(data_entrega),
       mensagem_nota = VALUES(mensagem_nota), deleted = FALSE, synced_at = CURRENT_TIMESTAMP`,
    [
      idRegistro,
      inteiro(pedido, 'codigo_empresa'),
      valor(pedido, 'numero_pedido_sysemp'),
      valor(pedido, 'numero_pedido_marketplace'),
      valor(pedido, 'data_pedido'),
      valor(pedido, 'tipo_pedido'),
      inteiro(pedido, 'codigo_cliente'),
      inteiro(pedido, 'codigo_vendedor'),
      inteiro(pedido, 'codigo_transportadora'),
      valor(pedido, 'valor_total_nota'),
      valor(pedido, 'valor_frete'),
      valor(pedido, 'valor_comissao'),
      valor(pedido, 'valor_desconto'),
      valor(pedido, 'data_venda'),
      valor(pedido, 'canal_venda'),
      valor(pedido, 'data_entrega'),
      valor(pedido, 'mensagem_nota'),
    ],
  );

  // /listarPedidosItens provavelmente tem a mesma limitação de
  // /listarPedidos (só aceita data_inicial/data_final, não id sozinho) --
  // usa a data do próprio cabeçalho que acabou de ser buscado como âncora
  // da janela, e filtra pelo id_nota_saida certo na resposta.
  const dataAncora = valor(pedido, 'data_pedido') ?? valor(pedido, 'data_venda');
  const dataBase = dataAncora ? new Date(String(dataAncora)) : new Date();
  const inicioItens = new Date(dataBase);
  inicioItens.setDate(inicioItens.getDate() - JANELA_DIAS);
  const fimItens = new Date(dataBase);
  fimItens.setDate(fimItens.getDate() + JANELA_DIAS);

  const respostaItens = await sysempPost<{ retorno: Record<string, unknown>[] }>('/listarPedidosItens', {
    data_inicial: inicioItens.toISOString().slice(0, 10),
    data_final: fimItens.toISOString().slice(0, 10),
  });
  const itens = (respostaItens.retorno ?? []).filter((item) => inteiro(item, 'id_nota_saida') === idRegistro);

  // Sem chave natural por item (só id auto_increment) — delete + insert
  // evita duplicar item ao reprocessar o mesmo evento de fila.
  await connection.query('DELETE FROM sysemp_pedido_item WHERE id_nota_saida = ?', [idRegistro]);

  for (const item of itens) {
    await connection.query(
      `INSERT INTO sysemp_pedido_item (
         id_nota_saida, id_empresa, numero_pedido_sysemp, id_produto, quantidade, valor_unitario_liquido,
         valor_unitario_bruto, valor_frete, valor_comissao, quantidade_reservada, deleted, synced_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)`,
      [
        idRegistro,
        inteiro(item, 'codigo_empresa'),
        valor(item, 'numero_pedido_sysemp'),
        inteiro(item, 'codigo_produto'),
        valor(item, 'quantidade'),
        valor(item, 'valor_unitario_liquido'),
        valor(item, 'valor_unitario_bruto'),
        valor(item, 'valor_frete'),
        valor(item, 'valor_comissao'),
        valor(item, 'quantidade_reservada'),
      ],
    );
  }
}

registrarConsumidorFila({ tipoTabela: 7, gravar: gravarPedido, buscarDetalhe: buscarDetalhePedido });
