-- Analises TI (Specs/spec_modulo_ti.md, secao 10): volumes logicos,
-- drivers instalados e Numero de Ativo (Asset Tag) da BIOS.

-- Volumes logicos (C:, D:...) -- diferente de ti_disco, que e o disco
-- FISICO. Um disco fisico pode ter varios volumes; o agente filtra
-- DriveType=3 (fixo) na coleta.
CREATE TABLE IF NOT EXISTS ti_volume (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta          INT NOT NULL,
    letra_unidade      VARCHAR(5)   NULL,
    rotulo             VARCHAR(100) NULL,
    sistema_arquivos   VARCHAR(20)  NULL,
    tamanho_bytes      BIGINT UNSIGNED NULL,
    espaco_livre_bytes BIGINT UNSIGNED NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Drivers assinados instalados (Win32_PnPSignedDriver). hardware_id e a
-- chave de comparacao entre maquinas para achar "desatualizado" -- nome do
-- dispositivo pode variar um pouco por instancia/fabricante do mesmo chip,
-- hardware_id identifica o componente real.
CREATE TABLE IF NOT EXISTS ti_driver (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta      INT NOT NULL,
    nome           VARCHAR(255) NULL,
    fabricante     VARCHAR(150) NULL,
    versao         VARCHAR(100) NULL,
    data_versao    DATETIME NULL,
    hardware_id    VARCHAR(255) NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta),
    INDEX idx_hardware_id (hardware_id(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Numero de Ativo: mesmo tratamento de serial_bios/serial_placa_mae (ver
-- Specs/spec_modulo_ti.md, secao 4) -- capturado por coleta em ti_bios,
-- copiado pra ti_equipamento no upsert da ingestao.
ALTER TABLE ti_bios ADD COLUMN asset_tag VARCHAR(100) NULL AFTER numero_serie;
ALTER TABLE ti_equipamento ADD COLUMN asset_tag VARCHAR(100) NULL AFTER patrimonio;
