-- NF de Compra: passa a ser sincronizada pela fila (tipo_tabela=3).
-- Ver docs/superpowers/specs/2026-09-14-nf-compra-sincronizacao-fase2a-design.md
--
-- Ate aqui a fila trazia os tipos 0, 2, 4, 5, 6, 7 e 9 - o 3 nunca foi
-- pedido. Medido em producao em 14/09/2026: das 892 notas de entrada no
-- portal, apenas 2 tinham CFOP de compra. O resto e devolucao de venda, que
-- entra de carona pelo tipo_tabela=2.
--
-- Mesmos endpoints da NF de Venda de proposito: a SysEmp serve os dois pelo
-- /listarNotasFiscais, com o mesmo formato de JSON. Por isso o consumidor
-- tambem e o mesmo (services/sysemp/entidades/notasFiscais.ts), registrado
-- sob o tipo 3 - nao ha mapeamento novo, e duplicar aquele mapeamento seria
-- criar um segundo lugar para o mesmo bug que ja custou o bloco fiscal
-- inteiro entre 19 e 31/08/2026.
--
-- Grava na mesma sysemp_nota_fiscal, distinguida por entrada_saida. Nao ha
-- colisao de chave: id_nota_saida e sequencia unica na SysEmp - medido, as
-- notas de entrada vao de 2.861 a 203.215 e as de saida de 186 a 210.675.

INSERT IGNORE INTO sysemp_fila_config (chave, nome, tipo_tabela, endpoint_detalhe, campo_id_detalhe, limite_pagina, observacoes)
VALUES (
    'notas_compra',
    'Notas Fiscais de Compra',
    3,
    '/listarNotasFiscais',
    'id_nota_saida',
    500,
    'Mesmo endpoint e mesmo consumidor da NF de Venda (tipo_tabela=2); o que separa e entrada_saida. Nao confundir com Pedido de Compra (tipo_tabela=5).'
);
