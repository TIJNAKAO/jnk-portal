-- Config de fila para Pedido de Compra (tipo_tabela=5).
-- Ver Specs/spec_modulo_integracao.md, secao 3.3.
--
-- endpoint_detalhe usa o parametro "id_compra" na busca, mas o campo
-- homonimo na RESPOSTA e "id_pedcompra" - os dois nomes nao sao o mesmo
-- texto. O motor generico so precisa do nome do PARAMETRO de busca aqui.

INSERT IGNORE INTO sysemp_fila_config (chave, nome, tipo_tabela, endpoint_detalhe, campo_id_detalhe, limite_pagina, observacoes)
VALUES (
    'pedidos_compra',
    'Pedidos de Compra',
    5,
    '/listarPedidosCompra',
    'id_compra',
    50,
    'Cabecalho e itens vem juntos no mesmo JSON de detalhe, como Nota Fiscal. Nao confundir com NF Compra (tipo_tabela=3).'
);
