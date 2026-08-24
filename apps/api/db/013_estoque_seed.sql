-- Seed do módulo Estoque e sua tela. Ver Specs/spec_modulo_estoque.md.

INSERT IGNORE INTO modulos_sistema (nome, chave_modulo, icone, descricao)
VALUES ('Estoque', 'ESTOQUE', 'Boxes', 'Relatórios e consultas sobre o estoque físico sincronizado da SysEmp.');

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Curva ABC' AS nome_tela, '/estoque/curva-abc' AS rota_tela
) t ON m.chave_modulo = 'ESTOQUE'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
