-- Guarda a resposta bruta de /inventories/{id}/stock/fulfillment em cada linha.
--
-- O formato real da API do ML (campos alem de available/not_available, como
-- unidades em transito ou em transferencia) ainda nao foi validado contra a
-- conta de producao. Com o payload gravado, a primeira rodada real mostra
-- quais campos existem e as colunas dedicadas saem do dado real, sem
-- adivinhar e sem precisar sincronizar de novo.
--
-- Aditiva: coluna nullable, compativel com o codigo anterior.

ALTER TABLE ml_estoque_full ADD COLUMN payload_ml JSON NULL AFTER nao_disponivel_detalhe;
