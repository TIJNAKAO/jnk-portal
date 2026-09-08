-- As seis telas do Fechamento de Custo no modulo Estoque.
-- Ver Specs/spec_modulo_estoque.md, secao 3.2.
--
-- A linha em telas_modulo ja aparece no menu, entao so pode ser seedada
-- depois que a rota existir no App.tsx e o router em app.ts - as duas
-- pontas sobem no mesmo commit/deploy.
--
-- Isto NAO concede permissao a ninguem, nem a administrador: as telas
-- ficam invisiveis ate alguem marca-las em Configurador -> Perfis ->
-- Salvar. Nenhuma migration do projeto concede permissao - e decisao de
-- negocio, nao de deploy.

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Importar Fechamento Mensal' AS nome_tela, '/estoque/fechamento/importar' AS rota_tela
    UNION ALL SELECT 'Importar Estoque FULL', '/estoque/fechamento/estoque-full'
    UNION ALL SELECT 'Importar Inventario Fisico', '/estoque/fechamento/inventario'
    UNION ALL SELECT 'Calculo de Custo de Fechamento', '/estoque/fechamento/custo'
    UNION ALL SELECT 'Comparar Inventario x Fechamento', '/estoque/fechamento/comparativo'
    UNION ALL SELECT 'Logs de Importacao', '/estoque/fechamento/logs'
) t ON m.chave_modulo = 'ESTOQUE'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
