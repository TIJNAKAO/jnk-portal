-- Modulo DASH JULINHO: aplicativo separado para as visoes gerenciais novas.
-- Ver Specs/spec_modulo_dash.md.
--
-- Separado dos outros modulos de proposito: as visoes daqui so LEEM o que
-- Faturamento, Estoque, Compras e Integracao ja sincronizam e calculam.
-- Esta migration nao cria nem altera tabela de dados, so menu.
--
-- Primeira tela: MC Vendas (margem de contribuicao venda a venda). A linha
-- em telas_modulo ja aparece no menu, entao so pode ser seedada depois que
-- a rota existir no App.tsx e o router em app.ts. As duas pontas sobem no
-- mesmo commit/deploy, entao a ordem esta garantida.
--
-- Isto NAO concede permissao a ninguem, nem a administrador: o modulo fica
-- invisivel ate alguem marcar as telas em Configurador -> Perfis -> Salvar.

INSERT IGNORE INTO modulos_sistema (nome, chave_modulo, icone, descricao)
VALUES ('DASH JULINHO', 'DASH', 'TrendingUp', 'Visoes gerenciais da diretoria: margem de contribuicao por venda e analises sobre os dados dos demais modulos.');

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'MC Vendas' AS nome_tela, '/dash/mc-vendas' AS rota_tela
) t ON m.chave_modulo = 'DASH'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
