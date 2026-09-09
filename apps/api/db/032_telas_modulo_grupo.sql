-- Submenu na barra lateral: telas_modulo ganha grupo_menu.
-- Ver Specs/spec_infra_portal_base_monorepo.md, secao do menu.
--
-- Anulavel de proposito: tela sem grupo continua solta no primeiro nivel,
-- que e o comportamento de todas as telas ate aqui. So quem tem grupo
-- preenchido entra num submenu.
--
-- O grupo mora aqui, e nao num mapa no frontend, porque o menu do portal
-- e dirigido por dados desde sempre: quem adiciona uma tela seeda uma
-- linha em telas_modulo e ela aparece. Um mapa no codigo criaria uma
-- segunda fonte de verdade sobre a mesma coisa.

ALTER TABLE telas_modulo ADD COLUMN grupo_menu VARCHAR(60) NULL AFTER nome_tela;

-- As seis telas do Fechamento de Custo viram o submenu "Fechamento
-- Mensal", como no portal PHP anterior (src/Telas.php). As outras duas do
-- modulo Estoque (Curva ABC e Saldo de Estoque) continuam soltas.
UPDATE telas_modulo
   SET grupo_menu = 'Fechamento Mensal'
 WHERE rota_tela LIKE '/estoque/fechamento/%';
