-- Custo da ultima entrada por periodo: porte da RDW.dbo.KPL_ULT_COMPRA.
-- Ver docs/superpowers/specs/2026-09-14-custo-ultima-entrada-fase1-design.md
--
-- DECIMAL e nao FLOAT: o original usa FLOAT em valor monetario, que e
-- binario e nao representa 0,01 exatamente. Em custo que vira margem o
-- erro acumula. Totais em DECIMAL(14,4); unitarios em DECIMAL(18,6),
-- porque vu_custo e resultado de divisao pela quantidade.
--
-- SEM FK para sysemp_produto ou sysemp_empresa, de proposito, pelo mesmo
-- motivo da 029: linha historica de 2017 cujo produto nao existe mais no
-- cadastro tem que entrar do mesmo jeito, marcada com
-- produto_encontrado = FALSE. Uma FK proibiria a gravacao.
--
-- A chave unica usa o TEXTO (empresa, cd_produto) e nao os ids porque
-- id_produto pode ser NULL, e NULL nao deduplica em chave unica do MySQL.
--
-- origem entra na chave por razao operacional: o recalculo da Fase 2
-- apaga e regrava so as linhas que ele mesmo produz. O historico
-- importado (origem='SQLSERVER') fica congelado e nunca e tocado.

CREATE TABLE IF NOT EXISTS compras_custo_ultima_entrada (
    id                  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    periodo             DATE NOT NULL,
    origem              VARCHAR(20) NOT NULL,
    empresa             VARCHAR(10) NOT NULL,
    id_empresa          INT NULL,
    empresa_encontrada  BOOLEAN NOT NULL DEFAULT TRUE,
    cd_produto          VARCHAR(50) NOT NULL,
    id_produto          INT NULL,
    produto_encontrado  BOOLEAN NOT NULL DEFAULT TRUE,
    descricao_produto   VARCHAR(200) NULL,
    marca               VARCHAR(200) NULL,
    ncm                 VARCHAR(10)  NULL,
    dt_movto            DATE NULL,
    dt_emissao          DATE NULL,
    documento           VARCHAR(30) NULL,
    serie               VARCHAR(10) NULL,
    cd_clifor           VARCHAR(100) NULL,
    dc_clifor           VARCHAR(100) NULL,
    mun_clifor          VARCHAR(100) NULL,
    uf_clifor           VARCHAR(2)   NULL,
    qtde                DECIMAL(14,4) NULL,
    vu_merc             DECIMAL(18,6) NULL,
    aliq_icms           DECIMAL(9,4)  NULL,
    aliq_red_icms       DECIMAL(9,4)  NULL,
    vb_icms             DECIMAL(14,4) NULL,
    vt_icms             DECIMAL(14,4) NULL,
    vt_icms_st          DECIMAL(14,4) NULL,
    vt_st_gnre          DECIMAL(14,4) NULL,
    aliq_ipi            DECIMAL(9,4)  NULL,
    vb_ipi              DECIMAL(14,4) NULL,
    vt_ipi              DECIMAL(14,4) NULL,
    aliq_pis            DECIMAL(9,4)  NULL,
    vb_pis              DECIMAL(14,4) NULL,
    vt_pis              DECIMAL(14,4) NULL,
    aliq_cofins         DECIMAL(9,4)  NULL,
    vb_cofins           DECIMAL(14,4) NULL,
    vt_cofins           DECIMAL(14,4) NULL,
    vt_nf               DECIMAL(14,4) NULL,
    vt_custo            DECIMAL(14,4) NULL,
    vu_custo            DECIMAL(18,6) NULL,
    vt_fob_euro         DECIMAL(14,4) NULL,
    cst                 VARCHAR(10) NULL,
    id_nota             INT NULL,
    item_nota           INT NULL,
    calculado_em        DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_custo_periodo_origem_empresa_produto (periodo, origem, empresa, cd_produto),
    INDEX idx_custo_periodo_empresa (periodo, id_empresa),
    INDEX idx_custo_produto (id_produto),
    INDEX idx_custo_origem (origem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
