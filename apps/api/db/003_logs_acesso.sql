-- Log de Acessos. Ver spec, seção 7. Sem ON DELETE CASCADE: é trilha de auditoria.

CREATE TABLE IF NOT EXISTS logs_acesso (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    filial_id INT NULL,
    tela_id INT NULL,
    tipo_evento VARCHAR(20) NOT NULL,
    ip_origem VARCHAR(45) NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (filial_id) REFERENCES filiais(id),
    FOREIGN KEY (tela_id) REFERENCES telas_modulo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
