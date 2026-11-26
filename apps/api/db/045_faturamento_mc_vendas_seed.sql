-- Tela MC Vendas (margem de contribuicao venda a venda) no modulo Faturamento.
-- Ver Specs/spec_modulo_faturamento.md, secao 12.
--
-- So seed de menu: a tela le etl_fatcom e estoque_custo_fechamento, que ja
-- existem. Nenhuma tabela nova.
--
-- A linha em telas_modulo ja aparece no menu, entao so pode ser seedada
-- depois que a rota existir no App.tsx e o router em app.ts. As duas
-- pontas sobem no mesmo commit/deploy, entao a ordem esta garantida.
--
-- Isto NAO concede permissao a ninguem, nem a administrador: a tela fica
-- invisivel ate alguem marca-la em Configurador -> Perfis -> Salvar. E a
-- tela mais sensivel do modulo (custo liquido e margem por venda).

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'MC Vendas' AS nome_tela, '/faturamento/mc-vendas' AS rota_tela
) t ON m.chave_modulo = 'FATURAMENTO'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
