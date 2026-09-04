-- Módulo TI — Inventário de Equipamentos. Ver Specs/spec_modulo_ti.md.

CREATE TABLE IF NOT EXISTS ti_departamento (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    ativo       BOOLEAN DEFAULT TRUE,
    criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_catalogo_programa (
    id                        INT AUTO_INCREMENT PRIMARY KEY,
    nome                      VARCHAR(150) NOT NULL,
    winget_id                 VARCHAR(150) NOT NULL,
    ativo                     BOOLEAN DEFAULT TRUE,
    configurar_acesso_remoto  BOOLEAN DEFAULT FALSE,
    criado_em                 DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_winget_id (winget_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- filial_id é NULL-ável de propósito (desvio documentado na spec, seção 3.1):
-- o agente pode rodar numa máquina antes de um admin classificar a filial.
CREATE TABLE IF NOT EXISTS ti_equipamento (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    nome_computador         VARCHAR(100) NOT NULL,
    apelido                 VARCHAR(150) NULL,
    patrimonio              VARCHAR(100) NULL,
    id_departamento         INT NULL,
    filial_id               INT NULL,
    id_usuario_responsavel  INT NULL,
    serial_bios             VARCHAR(100) NULL,
    serial_placa_mae        VARCHAR(100) NULL,
    observacoes             VARCHAR(255) NULL,
    ativo                   BOOLEAN DEFAULT TRUE,
    primeira_coleta_em      DATETIME NULL,
    ultima_coleta_em        DATETIME NULL,
    criado_em               DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_nome_computador (nome_computador),
    INDEX idx_filial_id (filial_id),
    INDEX idx_id_departamento (id_departamento),
    INDEX idx_serial_bios (serial_bios),
    FOREIGN KEY (id_departamento) REFERENCES ti_departamento(id) ON DELETE SET NULL,
    FOREIGN KEY (filial_id) REFERENCES filiais(id) ON DELETE SET NULL,
    FOREIGN KEY (id_usuario_responsavel) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_equipamento_foto (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    id_equipamento  INT NOT NULL,
    nome_arquivo    VARCHAR(255) NULL,
    tipo_mime       VARCHAR(100) NULL,
    tamanho_bytes   INT UNSIGNED NULL,
    conteudo        LONGBLOB NOT NULL,
    enviado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_equipamento) REFERENCES ti_equipamento(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_inventario_coleta (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    id_equipamento  INT NOT NULL,
    coletado_em     DATETIME NOT NULL,
    recebido_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
    usuario_windows VARCHAR(100) NULL,
    ip_local        VARCHAR(45) NULL,
    versao_agente   VARCHAR(20) NULL,
    anydesk_id      VARCHAR(20) NULL,
    hash_dados      CHAR(64) NULL,
    FOREIGN KEY (id_equipamento) REFERENCES ti_equipamento(id),
    INDEX idx_equipamento_data (id_equipamento, coletado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_sistema_operacional (
    id_coleta           INT PRIMARY KEY,
    caption              VARCHAR(150) NULL,
    versao               VARCHAR(50)  NULL,
    build_number         VARCHAR(20)  NULL,
    arquitetura          VARCHAR(20)  NULL,
    data_instalacao      DATETIME NULL,
    ultimo_boot          DATETIME NULL,
    usuario_registrado   VARCHAR(100) NULL,
    numero_serie         VARCHAR(100) NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_processador (
    id_coleta                     INT PRIMARY KEY,
    nome                          VARCHAR(150) NULL,
    fabricante                    VARCHAR(100) NULL,
    processor_id                  VARCHAR(50)  NULL,
    velocidade_atual_mhz          INT UNSIGNED NULL,
    velocidade_maxima_mhz         INT UNSIGNED NULL,
    cache_l2_kb                   INT UNSIGNED NULL,
    cache_l3_kb                   INT UNSIGNED NULL,
    numero_nucleos                SMALLINT UNSIGNED NULL,
    numero_nucleos_habilitados    SMALLINT UNSIGNED NULL,
    numero_processadores_logicos  SMALLINT UNSIGNED NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_placa_mae (
    id_coleta     INT PRIMARY KEY,
    nome          VARCHAR(150) NULL,
    fabricante    VARCHAR(100) NULL,
    modelo        VARCHAR(100) NULL,
    produto       VARCHAR(100) NULL,
    numero_serie  VARCHAR(100) NULL,
    versao        VARCHAR(50)  NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_bios (
    id_coleta     INT PRIMARY KEY,
    fabricante    VARCHAR(100) NULL,
    numero_serie  VARCHAR(100) NULL,
    versao        VARCHAR(100) NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_memoria_ram (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta         INT NOT NULL,
    nome              VARCHAR(100) NULL,
    fabricante        VARCHAR(100) NULL,
    banco             VARCHAR(50)  NULL,
    slot              VARCHAR(50)  NULL,
    capacidade_bytes  BIGINT UNSIGNED NULL,
    velocidade_mhz    INT UNSIGNED NULL,
    part_number       VARCHAR(100) NULL,
    numero_serie      VARCHAR(100) NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_disco (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta          INT NOT NULL,
    nome               VARCHAR(150) NULL,
    modelo             VARCHAR(150) NULL,
    fabricante         VARCHAR(100) NULL,
    interface          VARCHAR(30)  NULL,
    firmware           VARCHAR(50)  NULL,
    numero_serie       VARCHAR(100) NULL,
    tamanho_bytes      BIGINT UNSIGNED NULL,
    numero_particoes   SMALLINT UNSIGNED NULL,
    tipo_midia         VARCHAR(20)  NULL,
    barramento         VARCHAR(20)  NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_rede (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta       INT NOT NULL,
    nome            VARCHAR(150) NULL,
    tipo_adaptador  VARCHAR(50)  NULL,
    mac_address     VARCHAR(20)  NULL,
    velocidade_bps  BIGINT UNSIGNED NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_periferico (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta   INT NOT NULL,
    tipo        VARCHAR(20)  NOT NULL,
    nome        VARCHAR(150) NULL,
    descricao   VARCHAR(255) NULL,
    fabricante  VARCHAR(100) NULL,
    device_id   VARCHAR(150) NULL,
    status      VARCHAR(50)  NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta_tipo (id_coleta, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_software (
    id                     INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta              INT NOT NULL,
    nome                   VARCHAR(255) NULL,
    versao                 VARCHAR(100) NULL,
    fabricante             VARCHAR(150) NULL,
    data_instalacao        VARCHAR(20)  NULL,
    local_instalacao       VARCHAR(500) NULL,
    tamanho_estimado_kb    BIGINT UNSIGNED NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta),
    INDEX idx_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_dispositivo_usb (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta         INT NOT NULL,
    fabricante        VARCHAR(150) NULL,
    modelo            VARCHAR(150) NULL,
    revisao           VARCHAR(50)  NULL,
    numero_serie      VARCHAR(150) NULL,
    nome_amigavel     VARCHAR(255) NULL,
    ultima_vez_visto  DATETIME NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_software_aprovado (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    nome             VARCHAR(255) NOT NULL,
    aprovado         BOOLEAN DEFAULT FALSE,
    versao_aprovada  VARCHAR(100) NULL,
    observacoes      VARCHAR(255) NULL,
    atualizado_em    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ti_api_token (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    token          VARCHAR(100) NOT NULL,
    descricao      VARCHAR(150) NULL,
    ativo          BOOLEAN DEFAULT TRUE,
    criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultimo_uso_em  DATETIME NULL,
    UNIQUE KEY uq_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
