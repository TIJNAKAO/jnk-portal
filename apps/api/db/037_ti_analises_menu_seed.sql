-- Grupo de menu "Analises TI" (Specs/spec_modulo_ti.md, secao 10.5):
-- reagrupa Equipamentos e Auditoria de Coleta (ja existentes) e semeia as
-- tres telas novas (Dashboard TI, Programas Desatualizados, Drivers
-- Desatualizados).
--
-- Isto NAO concede permissao a ninguem, nem a administrador: a tela fica
-- invisivel ate alguem marca-la em Configurador -> Perfis -> Salvar.

UPDATE telas_modulo
   SET grupo_menu = 'Análises TI'
 WHERE rota_tela IN ('/ti/equipamentos', '/ti/auditoria-coleta');

INSERT INTO telas_modulo (modulo_id, nome_tela, grupo_menu, rota_tela)
SELECT m.id, t.nome_tela, 'Análises TI', t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Dashboard TI' AS nome_tela, '/ti/dashboard' AS rota_tela
    UNION ALL SELECT 'Programas Desatualizados', '/ti/programas-desatualizados'
    UNION ALL SELECT 'Drivers Desatualizados', '/ti/drivers-desatualizados'
) t ON m.chave_modulo = 'TI'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
