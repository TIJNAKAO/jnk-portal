-- Converte Pedidos de Venda de sync por janela de data pra fila (mesmo
-- conceito de Notas Fiscais/Estoque): lista a fila, busca detalhe por
-- evento, confirma consumido. tipo_tabela 7.

ALTER TABLE sysemp_pedido ADD COLUMN deleted BOOLEAN DEFAULT FALSE AFTER mensagem_nota;
ALTER TABLE sysemp_pedido_item ADD COLUMN deleted BOOLEAN DEFAULT FALSE AFTER quantidade_reservada;

INSERT IGNORE INTO sysemp_fila_config (chave, nome, tipo_tabela, endpoint_detalhe, campo_id_detalhe, limite_pagina, observacoes)
VALUES (
    'pedidos',
    'Pedidos de Venda',
    7,
    '/listarPedidos',
    'id_nota_saida',
    50,
    'Itens vem de endpoint separado (/listarPedidosItens), buscado dentro do proprio consumidor de fila (services/sysemp/entidades/pedidos.ts), nao pelo motor generico.'
);
