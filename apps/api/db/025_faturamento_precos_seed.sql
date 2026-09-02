-- Tela de consulta da tabela de precos sincronizada da SysEmp.
--
-- A linha em telas_modulo ja aparece no menu, entao so pode ser seedada
-- depois que a rota existir no App.tsx e o router em app.ts - mesma razao
-- pela qual 019_ e 020_ do Faturamento foram separadas. Aqui as duas
-- pontas sobem no mesmo commit/deploy, entao a ordem esta garantida.
--
-- Isto NAO concede permissao a ninguem, nem a administrador: a tela fica
-- invisivel ate alguem marca-la em Configurador -> Perfis -> Salvar.

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Precos' AS nome_tela, '/faturamento/precos' AS rota_tela
) t ON m.chave_modulo = 'FATURAMENTO'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
