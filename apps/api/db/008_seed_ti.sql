-- Seed do módulo TI e suas telas. Ver Specs/spec_modulo_ti.md, seção 2.
-- Idempotente via INSERT IGNORE / NOT EXISTS, igual 006_seed_config.sql.

INSERT IGNORE INTO modulos_sistema (nome, chave_modulo, icone, descricao)
VALUES ('TI', 'TI', 'Laptop', 'Inventário de hardware/software, gestão de equipamentos e automação de setup de máquinas Windows.');

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Equipamentos' AS nome_tela, '/ti/equipamentos' AS rota_tela
    UNION ALL SELECT 'Departamentos', '/ti/departamentos'
    UNION ALL SELECT 'Atribuir Responsáveis', '/ti/responsaveis'
    UNION ALL SELECT 'Catálogo de Programas', '/ti/catalogo-programas'
    UNION ALL SELECT 'Instalar Programas', '/ti/instalar-programas'
    UNION ALL SELECT 'Atualizar Programas', '/ti/atualizar-programas'
    UNION ALL SELECT 'Softwares Aprovados', '/ti/softwares-aprovados'
    UNION ALL SELECT 'Auditoria de Coleta', '/ti/auditoria-coleta'
) t ON m.chave_modulo = 'TI'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
