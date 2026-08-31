-- Alinha o schema de Notas Fiscais ao payload real de /listarNotasFiscais.
--
-- Contexto: ate 19/08/2026 o consumidor de fila gravava apenas 8 colunas do
-- item, descartando todo o bloco fiscal que a SysEmp ja enviava. As colunas
-- de destino existiam desde 010_integracao_schema.sql; o que faltava era a
-- gravacao (corrigida em services/sysemp/entidades/notasFiscais.ts) e alguns
-- campos que o payload traz e nao tinham coluna nenhuma - criados aqui.
--
-- Nomes do payload conferidos contra tres NFs reais de producao em 31/08/2026
-- (balcao, marketplace interestadual com DIFAL, marketplace com IPI). Os
-- nomes NAO seguem o padrao das colunas: `valoricms`, `icmsst`, `valorpis`,
-- `valorcofins`, `valoripi`, `valorcomissaoml`, `vr_item_liq`, `vfcpufdest`,
-- `vicmsufdest`, `vicmsufremet`, `vfcpst`, `datacancelamento_nfe`,
-- `protocolonfe`, `chavenfe`. O mapeamento vive no consumidor.
--
-- Aliases deliberadamente NAO duplicados em coluna nova (mesmo significado,
-- nome diferente no payload; resolvidos por COALESCE no consumidor):
--   item.valor_comissao   -> valor_comissao_ml   (identicos nas 3 amostras)
--   item.valor_frete      -> vr_frete            (identicos nas 3 amostras)
--   cabecalho.valor_total_nota -> valor_nota
--   cabecalho.codigo_empresa/codigo_cliente/codigo_vendedor/codigo_transportadora
--     -> id_empresa / id_cliente / id_vendedor / id_transportadora

-- ---- Item: campos do payload sem coluna correspondente ----
ALTER TABLE sysemp_nota_fiscal_item
    ADD COLUMN valor_unitario_liquido DECIMAL(14,4) NULL AFTER vr_item_liquido,
    ADD COLUMN quantidade_reservada   DECIMAL(14,4) NULL AFTER valor_unitario_liquido;

-- ---- Cabecalho: campos do payload sem coluna correspondente ----
ALTER TABLE sysemp_nota_fiscal
    ADD COLUMN tipo_documento            VARCHAR(10)  NULL AFTER entrada_saida,
    ADD COLUMN tipo_pedido               VARCHAR(30)  NULL AFTER tipo_documento,
    ADD COLUMN numero_pedido_marketplace VARCHAR(100) NULL AFTER marketplace_pedido,
    ADD COLUMN data_pedido               DATE         NULL AFTER nota_saida,
    ADD COLUMN data_venda                DATE         NULL AFTER data_pedido,
    ADD COLUMN data_entrega              DATE         NULL AFTER data_venda,
    ADD COLUMN mensagem_nota             VARCHAR(500) NULL AFTER observacao_nf;

-- Filtro de canal e o eixo principal do dashboard de Faturamento e nao tinha
-- indice; com ~30 mil notas ja pesa, e a tabela so cresce.
ALTER TABLE sysemp_nota_fiscal
    ADD INDEX idx_canal_venda (canal_venda);
