-- Converte Produto de lote por offset (/listarProdutos paginado) pra
-- fila, mesmo conceito das demais entidades: lista a fila, busca o
-- detalhe por evento, confirma consumido. tipo_tabela 0.
--
-- tipo_tabela ZERO e o unico do sistema. O motor busca o consumidor num
-- Map e os filtros de tela comparam string ("0" e truthy), entao nao ha
-- problema - mas checagem futura sobre esse numero tem que ser
-- "!== undefined", nunca teste de veracidade.
--
-- /listarProdutos aceita {id_produto} e devolve uma linha, entao o fetch
-- generico do motor serve: endpoint_detalhe e campo_id_detalhe abaixo sao
-- de fato usados (diferente de precos e pedidos, onde sao documentais).
--
-- Sem DDL: o consumidor novo grava nas mesmas tabelas. O que muda e que
-- ele passa a preencher tres coisas que o lote nunca preencheu - ver o
-- comentario no topo de services/sysemp/entidades/produtos.ts.

INSERT IGNORE INTO sysemp_fila_config (chave, nome, tipo_tabela, endpoint_detalhe, campo_id_detalhe, limite_pagina, observacoes)
VALUES (
    'produtos',
    'Produtos',
    0,
    '/listarProdutos',
    'id_produto',
    300,
    'tipo_tabela 0. O consumidor corrige tres bugs do lote anterior: sub-listas origens/estoques sao PLURAL na resposta (o lote lia origem/estoque e gravava zero linha), qtde_embalagem real vem em produto_quantidade_embalagem, e ativo vinha fixo em true.'
);
