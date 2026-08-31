-- Destrava e prepara o etl_fatcom para ser a base do modulo Faturamento.
--
-- Contexto: o ETL Fatcom falhou em 94 de 94 execucoes com
-- "Data too long for column 'cst' at row 300". A origem
-- (sysemp_nota_fiscal_item.cst) tem 8 registros com CST de 4 caracteres
-- ("0102") contra uma coluna de destino CHAR(3). Oito linhas em 30.389
-- derrubavam a carga inteira, de hora em hora, desde 19/08/2026 - deixando
-- a tabela congelada com 70% de cobertura e ninguem percebeu, porque o erro
-- so aparecia numa coluna de log que nada monitora.
--
-- Larguras conferidas contra o maximo real da origem em 31/08/2026. Alem do
-- cst, dc_filial (25) truncava silenciosamente razoes sociais de ate 60
-- caracteres - "Empresa" e a primeira coluna do relatorio de faturamento.
-- As demais colunas descritivas passam a acompanhar a largura da origem,
-- para que crescimento de dado nao volte a virar truncamento ou erro fatal.

-- ---- Larguras ----
ALTER TABLE etl_fatcom
    MODIFY cst        VARCHAR(4)   NOT NULL,   -- era CHAR(3): causa das 94 falhas
    MODIFY dc_filial  VARCHAR(100) NOT NULL,   -- era VARCHAR(25): truncava razao social
    MODIFY dc_clifor  VARCHAR(255) NOT NULL,   -- acompanha sysemp_parceiro.razao_social
    MODIFY dc_produto VARCHAR(255) NOT NULL,   -- acompanha sysemp_produto.nome_produto
    MODIFY um         VARCHAR(10)  NOT NULL;   -- era CHAR(2): acompanha unidade da origem

-- ---- Campos que o relatorio de Faturamento exige e nao existiam ----
ALTER TABLE etl_fatcom
    -- FECP por item: 440 itens usam. Nao havia coluna nenhuma.
    ADD COLUMN vt_fecp   FLOAT          NOT NULL DEFAULT 0 AFTER vt_icms_st,
    -- Custo unitario. vt_custo (total) ja existia mas era gravado fixo em 0.
    -- NULL de proposito: distingue "custo desconhecido" de "custo zero" -
    -- so 77% dos itens vendidos tem custo, e margem sobre custo ausente deve
    -- sair vazia, nunca zerada.
    ADD COLUMN vu_custo  DECIMAL(14,4)  NULL     AFTER vt_custo,
    -- Marca a linha cujo cliente/produto ainda nao sincronizou. O ETL passa a
    -- usar LEFT JOIN: o item entra sempre, e o que falta fica visivel em vez
    -- de sumir da soma (o INNER JOIN anterior descartava em silencio).
    ADD COLUMN ref_pendente VARCHAR(20) NULL     AFTER dc_produto;

-- ---- Indices dos filtros do dashboard ----
ALTER TABLE etl_fatcom
    ADD INDEX idx_origem_dados (origem_dados),
    ADD INDEX idx_cd_filial (cd_filial),
    ADD INDEX idx_canal (canal),
    ADD INDEX idx_marca (marca);
