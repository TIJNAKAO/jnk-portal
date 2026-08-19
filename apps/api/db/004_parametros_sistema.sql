-- Parâmetros do Sistema (SMTP, WhatsApp, Telegram). Ver spec, seção 8.

CREATE TABLE IF NOT EXISTS parametros_sistema (
    id INT AUTO_INCREMENT PRIMARY KEY,
    categoria VARCHAR(30) NOT NULL,
    chave VARCHAR(50) NOT NULL,
    valor TEXT NULL,
    sensivel BOOLEAN DEFAULT FALSE,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_parametros_categoria_chave UNIQUE (categoria, chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
