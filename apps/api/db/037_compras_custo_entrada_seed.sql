-- Tela de consulta do Custo da Ultima Entrada, no modulo Compras.
-- Ver docs/superpowers/specs/2026-09-14-custo-ultima-entrada-fase1-design.md
--
-- A linha em telas_modulo ja aparece no menu, entao so pode ser seedada
-- depois que a rota existir no App.tsx e o router em app.ts - as duas
-- pontas sobem no mesmo commit/deploy.
--
-- Isto NAO concede permissao a ninguem, nem a administrador: a tela fica
-- invisivel ate alguem marca-la em Configurador -> Perfis -> Salvar.

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Custo da Ultima Entrada' AS nome_tela, '/compras/custo-ultima-entrada' AS rota_tela
) t ON m.chave_modulo = 'COMPRAS'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
