-- Parametros do Calculo de Custo de Fechamento.
-- Ver Specs/spec_modulo_estoque.md, secao 3.7.
--
-- Os valores abaixo sao os que o portal PHP anterior tinha fixos no
-- codigo: metade do preco de venda, tabela LUCRO REAL. Semear preserva o
-- comportamento validado em producao; a partir daqui, quem muda a regra e
-- Configurador -> Parametros, nao um deploy.
--
-- INSERT IGNORE, e nao REPLACE: se alguem ja ajustou o valor, reaplicar a
-- migration nao pode desfazer o ajuste.

INSERT IGNORE INTO parametros_sistema (categoria, chave, valor, sensivel)
VALUES
    ('ESTOQUE', 'FECHAMENTO_PERCENTUAL_CUSTO_VENDA', '50', FALSE),
    ('ESTOQUE', 'FECHAMENTO_ID_TABELA_PRECO', '1', FALSE);
