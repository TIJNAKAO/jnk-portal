-- Schema core: filiais, usuários, módulos/telas, permissões, avisos.
-- Ver Specs/spec_infra_portal_base_monorepo.md, seção 3.

CREATE TABLE IF NOT EXISTS filiais (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cnpj VARCHAR(18) NOT NULL UNIQUE,
    ativa BOOLEAN DEFAULT TRUE,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    foto_perfil_base64 LONGTEXT NULL,
    whatsapp VARCHAR(20) NULL,
    ativo BOOLEAN DEFAULT TRUE,
    ultimo_acesso_filial_id INT NULL,
    ultimo_acesso_modulo_id INT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ultimo_acesso_filial_id) REFERENCES filiais(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS usuarios_filiais (
    usuario_id INT NOT NULL,
    filial_id INT NOT NULL,
    PRIMARY KEY (usuario_id, filial_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (filial_id) REFERENCES filiais(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS preferencias_usuario (
    usuario_id INT PRIMARY KEY,
    tema_ui VARCHAR(10) DEFAULT 'LIGHT',
    estilo_botoes VARCHAR(15) DEFAULT 'SOLID',
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS modulos_sistema (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(50) NOT NULL,
    chave_modulo VARCHAR(30) UNIQUE NOT NULL,
    icone VARCHAR(50) NOT NULL,
    descricao VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS telas_modulo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    modulo_id INT NOT NULL,
    nome_tela VARCHAR(50) NOT NULL,
    rota_tela VARCHAR(100) NOT NULL,
    FOREIGN KEY (modulo_id) REFERENCES modulos_sistema(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS permissoes_usuario (
    usuario_id INT NOT NULL,
    tela_id INT NOT NULL,
    pode_visualizar BOOLEAN DEFAULT TRUE,
    pode_criar BOOLEAN DEFAULT FALSE,
    pode_editar BOOLEAN DEFAULT FALSE,
    pode_deletar BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (usuario_id, tela_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (tela_id) REFERENCES telas_modulo(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS avisos_plataforma (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filial_id INT NULL,
    titulo VARCHAR(100) NOT NULL,
    mensagem TEXT NOT NULL,
    data_expiracao DATETIME NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (filial_id) REFERENCES filiais(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
