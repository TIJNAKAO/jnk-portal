-- Tela de Dashboard do modulo Faturamento.
--
-- Entra separada da 019 porque uma linha em telas_modulo aparece no menu: so
-- pode existir depois que a rota que ela aponta existir de fato.
--
-- Inserida antes de "Notas Fiscais" na ordem do menu? Nao - telas_modulo nao
-- tem coluna de ordem, e a listagem sai por id. Como o Dashboard e a porta de
-- entrada natural do modulo, se a ordem do menu passar a incomodar, o ajuste e
-- adicionar uma coluna de ordenacao em telas_modulo, nao renumerar ids.

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Dashboard' AS nome_tela, '/faturamento/dashboard' AS rota_tela
) t ON m.chave_modulo = 'FATURAMENTO'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
