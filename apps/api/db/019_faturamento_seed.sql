-- Seed do modulo Faturamento e da tela de Notas Fiscais.
-- Ver Specs/spec_modulo_faturamento.md.
--
-- A tela de Dashboard entra numa migration propria, junto com a rota que ela
-- aponta: uma linha em telas_modulo apontando para rota inexistente aparece no
-- menu e leva a lugar nenhum.

INSERT IGNORE INTO modulos_sistema (nome, chave_modulo, icone, descricao)
VALUES ('Faturamento', 'FATURAMENTO', 'Receipt', 'Relatorios e analise de faturamento, impostos e margem, consolidando os ERPs SysEmp e KPL.');

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Notas Fiscais' AS nome_tela, '/faturamento/notas-fiscais' AS rota_tela
) t ON m.chave_modulo = 'FATURAMENTO'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
