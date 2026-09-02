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

-- As ~249 mil linhas gravadas pela varredura antiga ficam onde estao, com
-- id_empresa/id_condpagto NULL - e esse NULL que as identifica como
-- pre-migracao. Cada uma e substituida quando o produto dela passar pela
-- fila (o consumidor faz delete+insert do conjunto do produto). Apagar
-- tudo aqui deixaria sem preco, por tempo indefinido, todo produto que
-- nao mudar de preco.

INSERT IGNORE INTO sysemp_fila_config (chave, nome, tipo_tabela, endpoint_detalhe, campo_id_detalhe, limite_pagina, observacoes)
VALUES (
    'precos',
    'Precos',
    6,
    '/listarPrecoVenda',
    'id_produto',
    300,
    'Um evento devolve N linhas (produto x empresa x tabela de preco x condicao de pagamento). ATENCAO: endpoint_detalhe e campo_id_detalhe aqui sao documentais - o consumidor sobrescreve buscarDetalhe e chama /listarPrecoVenda fixo no codigo (mesma situacao de pedidos). Editar esses dois campos na tela nao muda o comportamento; ativo e limite_pagina sim.'
);
