-- Seed do módulo CONFIG (Configurador) e suas telas. Ver spec, seção 5.
-- Idempotente via INSERT IGNORE (chave_modulo/rota_tela são UNIQUE ou
-- checadas por combinação única abaixo).

INSERT IGNORE INTO modulos_sistema (nome, chave_modulo, icone, descricao)
VALUES ('Configurador', 'CONFIG', 'Settings', 'Administração de filiais, usuários, perfis de acesso e parâmetros do sistema.');

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Filiais' AS nome_tela, '/config/filiais' AS rota_tela
    UNION ALL SELECT 'Usuários', '/config/usuarios'
    UNION ALL SELECT 'Perfis de Acesso', '/config/perfis'
    UNION ALL SELECT 'Avisos', '/config/avisos'
    UNION ALL SELECT 'Log de Acessos', '/config/logs'
    UNION ALL SELECT 'Parâmetros do Sistema', '/config/parametros'
) t ON m.chave_modulo = 'CONFIG'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
