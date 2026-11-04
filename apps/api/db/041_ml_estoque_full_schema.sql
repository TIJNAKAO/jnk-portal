-- Estoque FULL do Mercado Livre (foto diaria por conta/inventario) e de-para
-- conta ML -> empresa do ERP. Ver Specs/spec_modulo_integracao.md, secao 4.3.
--
-- data_ref e o dia de Brasilia. Cada rodada da sincronizacao (a cada 2 horas)
-- substitui a foto do dia da conta, entao o dia guarda o ultimo saldo lido.

CREATE TABLE IF NOT EXISTS ml_estoque_full (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    data_ref                DATE NOT NULL,
    user_id_ml              BIGINT NOT NULL,
    inventory_id            VARCHAR(30) NOT NULL,
    item_id                 VARCHAR(20) NOT NULL,
    variacao_id             BIGINT NULL,
    sku                     VARCHAR(100) NOT NULL DEFAULT '',
    titulo                  VARCHAR(255) NOT NULL DEFAULT '',
    total                   INT NOT NULL DEFAULT 0,
    disponivel              INT NOT NULL DEFAULT 0,
    nao_disponivel          INT NOT NULL DEFAULT 0,
    nao_disponivel_detalhe  JSON NULL,
    atualizado_em           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_mlfull_dia_conta_inv (data_ref, user_id_ml, inventory_id),
    INDEX idx_mlfull_dia_sku (data_ref, sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ml_conta_empresa (
    ml_conta_id  INT NOT NULL PRIMARY KEY,
    id_empresa   INT NOT NULL,
    FOREIGN KEY (ml_conta_id) REFERENCES ml_conta(id) ON DELETE CASCADE,
    FOREIGN KEY (id_empresa) REFERENCES sysemp_empresa(id_empresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
