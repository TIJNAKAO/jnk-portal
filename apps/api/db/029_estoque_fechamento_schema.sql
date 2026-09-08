-- Fechamento de Custo: as cinco tabelas do modulo.
-- Ver Specs/spec_modulo_estoque.md, secao 3.3.
--
-- NENHUMA destas tabelas tem FK para sysemp_produto ou sysemp_empresa, e
-- isso e deliberado: linha de planilha que nao bate com o cadastro e
-- importada do mesmo jeito, so marcada com produto_encontrado = FALSE ou
-- empresa_encontrada = FALSE. A informacao contabil continua valida ainda
-- que o produto nao esteja sincronizado, e uma FK proibiria a gravacao.

-- ------------------------------------------------------------------
-- Fechamento Mensal: a planilha contabil, ja com custo proprio.
--
-- A planilha so traz a razao social em EMPRESA (texto livre). O
-- id_empresa e resolvido UMA VEZ, na importacao, e o texto original fica
-- como auditoria do que a planilha dizia. A chave unica continua sendo o
-- texto e nao o id, porque id_empresa pode ser NULL (razao social que nao
-- casou), e NULL nao deduplica em chave unica do MySQL.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estoque_fechamento_mensal (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    periodo            DATE NOT NULL,
    empresa            VARCHAR(100) NOT NULL,
    id_empresa         INT NULL,
    id_produto         INT UNSIGNED NOT NULL,
    codigo_auxiliar    VARCHAR(50) NULL,
    descricao          VARCHAR(255) NULL,
    ncm                VARCHAR(20) NULL,
    unidade            VARCHAR(10) NULL,
    marca              VARCHAR(100) NULL,
    estoque            DECIMAL(14,4) NULL,
    custo              DECIMAL(14,4) NULL,
    total              DECIMAL(14,4) NULL,
    cst_venda          VARCHAR(10) NULL,
    produto_encontrado BOOLEAN NOT NULL DEFAULT TRUE,
    empresa_encontrada BOOLEAN NOT NULL DEFAULT TRUE,
    importado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_fechamento_periodo_empresa_produto (periodo, empresa, id_produto),
    INDEX idx_fechamento_periodo (periodo),
    INDEX idx_fechamento_periodo_empresa (periodo, id_empresa),
    INDEX idx_fechamento_periodo_produto (periodo, id_produto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Estoque FULL: saldo por conta/canal (Amazon, Shopee, Axado, lojas).
--
-- conta e tipo_saldo entram na chave porque o mesmo produto aparece mais
-- de uma vez no mesmo periodo e empresa com classificacoes diferentes:
-- "Aptas para venda" e "Extraviadas" sao linhas distintas, nao uma
-- sobrescrevendo a outra.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estoque_full_importado (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    periodo            DATE NOT NULL,
    id_empresa         INT NOT NULL,
    conta              VARCHAR(50) NOT NULL,
    tipo_saldo         VARCHAR(50) NOT NULL,
    cd_produto         VARCHAR(50) NOT NULL,
    qtde               DECIMAL(14,4) NULL,
    produto_encontrado BOOLEAN NOT NULL DEFAULT TRUE,
    empresa_encontrada BOOLEAN NOT NULL DEFAULT TRUE,
    importado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_full_periodo_empresa_conta_tipo_produto (periodo, id_empresa, conta, tipo_saldo, cd_produto),
    INDEX idx_full_periodo (periodo),
    INDEX idx_full_periodo_empresa (periodo, id_empresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Inventario Fisico: contagem fisica, ate cinco rodadas mais a final.
--
-- almox entra na chave pela mesma razao do Estoque FULL: PRINCIPAL e
-- AVARIAS contam o mesmo produto separadamente. O Fechamento contabil
-- NAO distingue almoxarifado, e e isso que obriga o comparativo a somar
-- os almoxarifados antes de comparar.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estoque_inventario_fisico (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    periodo            DATE NOT NULL,
    id_empresa         INT NOT NULL,
    cd_produto         VARCHAR(50) NOT NULL,
    almox              VARCHAR(50) NOT NULL DEFAULT '',
    marca              VARCHAR(100) NULL,
    contagem_1         DECIMAL(14,4) NULL,
    contagem_2         DECIMAL(14,4) NULL,
    contagem_3         DECIMAL(14,4) NULL,
    contagem_4         DECIMAL(14,4) NULL,
    contagem_5         DECIMAL(14,4) NULL,
    contagem_final     DECIMAL(14,4) NULL,
    saldo_sysemp       DECIMAL(14,4) NULL,
    divergencia        DECIMAL(14,4) NULL,
    analise            VARCHAR(255) NULL,
    acao               VARCHAR(255) NULL,
    produto_encontrado BOOLEAN NOT NULL DEFAULT TRUE,
    empresa_encontrada BOOLEAN NOT NULL DEFAULT TRUE,
    importado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_inventario_periodo_empresa_produto_almox (periodo, id_empresa, cd_produto, almox),
    INDEX idx_inventario_periodo (periodo),
    INDEX idx_inventario_periodo_empresa (periodo, id_empresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Resultado do calculo, por periodo + grupo de empresa.
--
-- Sem chave unica de proposito: recalcular um par (periodo, grupo) apaga
-- o calculo anterior desse par e grava de novo. Nao acumula historico de
-- re-execucoes, so a data da ultima em data_calculo_custo.
--
-- O indice idx_custo_grupo_codigo_periodo nao serve a nenhuma tela desta
-- entrega. Serve a Visao de Margem (spec secao 3.13), que consulta o
-- "custo vigente" - o fechamento mais recente ate o fim de um periodo.
-- Custa uma linha agora e uma migration depois.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estoque_custo_fechamento (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    data_calculo_custo DATETIME DEFAULT CURRENT_TIMESTAMP,
    periodo            DATE NOT NULL,
    grupo_empresa      VARCHAR(5) NOT NULL,
    id_empresa         INT NULL,
    nome_empresa       VARCHAR(255) NULL,
    origem             VARCHAR(20) NOT NULL,
    id_produto         INT UNSIGNED NULL,
    codigo_auxiliar    VARCHAR(50) NULL,
    descricao_produto  VARCHAR(255) NULL,
    marca              VARCHAR(100) NULL,
    unidade            VARCHAR(10) NULL,
    ncm                VARCHAR(20) NULL,
    conta              VARCHAR(50) NULL,
    tipo_saldo         VARCHAR(50) NULL,
    qtde               DECIMAL(14,4) NULL,
    vu_custo_estoque   DECIMAL(14,4) NULL,
    vu_custo_venda     DECIMAL(14,4) NULL,
    vu_custo           DECIMAL(14,4) NULL,
    valor_custo_total  DECIMAL(16,4) NULL,
    INDEX idx_custo_periodo_grupo (periodo, grupo_empresa),
    INDEX idx_custo_origem (origem),
    INDEX idx_custo_grupo_codigo_periodo (grupo_empresa, codigo_auxiliar, periodo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Log de importacao: uma linha por execucao de upload de planilha.
--
-- Mesmo espirito do Painel de Integracao, mas para arquivo em vez de
-- chamada de API. Sem ele, uma importacao parcial so aparece semanas
-- depois, num total que nao fecha.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estoque_importacao_log (
    id                       INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tipo                     VARCHAR(40) NOT NULL,
    arquivo                  VARCHAR(255) NULL,
    periodo                  DATE NULL,
    total_linhas             INT UNSIGNED NOT NULL DEFAULT 0,
    inseridas                INT UNSIGNED NOT NULL DEFAULT 0,
    atualizadas              INT UNSIGNED NOT NULL DEFAULT 0,
    ignoradas                INT UNSIGNED NOT NULL DEFAULT 0,
    produtos_nao_encontrados INT UNSIGNED NOT NULL DEFAULT 0,
    empresas_nao_encontradas INT UNSIGNED NOT NULL DEFAULT 0,
    custo_total              DECIMAL(16,4) NULL,
    observacoes              TEXT NULL,
    usuario_id               INT NULL,
    executado_em             DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    INDEX idx_log_tipo (tipo),
    INDEX idx_log_executado_em (executado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
