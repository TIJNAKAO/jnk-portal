-- Converte Preco de varredura por faixa de id_produto (/listarPrecos, de
-- 1000 em 1000 sobre sysemp_produto) pra fila, mesmo conceito de Notas
-- Fiscais/Estoque/Pedidos/Parceiros: lista a fila, busca o detalhe por
-- evento, confirma consumido. tipo_tabela 6.
--
-- Duas colunas novas: o endpoint da fila (/listarPrecoVenda) traz
-- id_empresa e id_condpagto, que /listarPrecos nao trazia. Sem os dois, as
-- 11 linhas que um unico produto devolve ficam indistinguiveis entre si
-- (mesmo id_produto, mesma tabela de preco, precos diferentes por canal).
--
-- Diferente de 015_parceiros_fila.sql, campo_id_detalhe aqui esta
-- CONFIRMADO contra a API real (id_produto) - por isso a linha ja nasce
-- ativa.

ALTER TABLE sysemp_preco
    ADD COLUMN id_empresa   INT NULL AFTER id_produto,
    ADD COLUMN id_condpagto INT NULL AFTER id_tb_preco;

-- As linhas gravadas pela varredura antiga nao tem id_empresa/id_condpagto
-- e nao ha de onde deduzi-los: seriam linhas ambiguas convivendo com as
-- novas. O consumidor de fila reescreve o conjunto de cada produto assim
-- que o primeiro evento dele chega, entao limpar aqui so antecipa isso.
DELETE FROM sysemp_preco;

INSERT IGNORE INTO sysemp_fila_config (chave, nome, tipo_tabela, endpoint_detalhe, campo_id_detalhe, limite_pagina, observacoes)
VALUES (
    'precos',
    'Precos',
    6,
    '/listarPrecoVenda',
    'id_produto',
    50,
    'Um evento devolve N linhas (produto x empresa x tabela de preco x condicao de pagamento) - o consumidor sobrescreve buscarDetalhe e faz delete+insert do conjunto do produto.'
);
