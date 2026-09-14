-- Retifica a justificativa gravada em 038_nf_compra_fila_seed.sql sobre
-- ausencia de colisao de id_nota_saida entre NF de Venda (tipo_tabela=2) e
-- NF de Compra (tipo_tabela=3). Nao altera dado nenhum - so o texto de
-- observacoes.
--
-- O raciocinio da 038 estava errado em tres pontos:
-- 1. Faixas que se intercalam (entrada: 2.861-203.215; saida: 186-210.675)
--    sao a condicao para COLISAO, nao prova contra ela - faixas disjuntas
--    e que dariam garantia.
-- 2. A medicao foi feita dentro de sysemp_nota_fiscal, onde id_nota_saida
--    e a propria PRIMARY KEY - toda linha e distinta ali por construcao.
--    Medir unicidade numa coluna que e PK nao informa nada sobre o espaco
--    de id na ORIGEM (SysEmp).
-- 3. As 892 notas de entrada medidas chegaram todas pelo tipo_tabela=2
--    (sao devolucao de venda, que entra de carona nesse tipo) - nenhuma
--    delas passou pelo tipo_tabela=3, entao a medicao nao diz nada sobre
--    o espaco de id que o tipo 3 realmente usa.
--
-- A DECISAO de reusar sysemp_nota_fiscal continua certa, mas pelo outro
-- motivo, que e forte por si: o mapeamento de ~46 colunas em
-- services/sysemp/entidades/notasFiscais.ts foi conferido contra payload
-- real, e duplica-lo pra uma tabela separada criaria um segundo lugar para
-- o mesmo descompasso de nomes que ja custou o bloco fiscal inteiro entre
-- 19 e 31/08/2026. Enquanto o espaco de id do tipo 3 na origem nao for
-- observado (nenhum evento tipo_tabela=3 chegou a producao ate esta
-- migration - sysemp_fila nao tem nenhuma linha com tipo_tabela=3), o
-- consumidor roda atras de uma guarda que confere entrada_saida antes de
-- gravar e falha alto em vez de sobrescrever/apagar uma nota de venda em
-- silencio (ver services/sysemp/entidades/notasFiscais.ts).
--
-- Aproveita e registra que limite_pagina, como toda config de
-- sysemp_fila_config, e editavel pela tela 5.4 e diverge do seed conforme
-- uso real - a 038 seedou 500 (mesmo valor de NF Venda) sem medicao
-- propria, por nao existir ainda volume de producao pra medir.

UPDATE sysemp_fila_config
SET observacoes = CONCAT(
    observacoes,
    ' RETIFICACAO (039): a justificativa de "sem colisao de chave" acima e um non sequitur - foi medida dentro de sysemp_nota_fiscal, onde id_nota_saida e a propria PK (logo unico por construcao), e as notas de entrada medidas vieram todas pelo tipo_tabela=2, nao pelo tipo_tabela=3. Ninguem mediu o espaco de id do tipo 3 na origem. A decisao de reusar a tabela continua valendo pelo motivo do mapeamento de colunas ja conferido (ver notasFiscais.ts); o consumidor tipo 3 roda atras de guarda que confere entrada_saida e falha alto em caso de colisao. limite_pagina (500) foi seedado por analogia a NF Venda, sem medicao propria, e e editavel pela tela sem deploy.'
)
WHERE chave = 'notas_compra';
