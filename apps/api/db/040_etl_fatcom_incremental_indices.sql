-- Indices da carga incremental do etl_fatcom.
-- Ver Specs/spec_modulo_faturamento.md, secao 3.7.
--
-- O ETL relia o historico inteiro de hora em hora, e a limpeza de canceladas
-- cruzava todas as notas com todo o fato por expressao calculada - a CPU do
-- banco (1 vCPU) chegava ao alerta da DigitalOcean. A carga passa a partir
-- das notas alteradas desde a ultima execucao, o que exige achar por
-- atualizado_em sem varrer as tabelas.
--
-- So aditiva: o codigo anterior, ainda servindo durante o PRE_DEPLOY, nao
-- depende destes indices e nao e afetado por eles.

ALTER TABLE sysemp_nota_fiscal ADD INDEX idx_atualizado_em (atualizado_em);
ALTER TABLE sysemp_parceiro    ADD INDEX idx_atualizado_em (atualizado_em);
ALTER TABLE sysemp_produto     ADD INDEX idx_atualizado_em (atualizado_em);

-- A limpeza parte de cada nota cancelada e procura as linhas dela no fato.
-- uq_fatcom nao serve: grupo_empresa vem antes de cd_filial na chave.
ALTER TABLE etl_fatcom ADD INDEX idx_fatcom_nf (cd_filial, nf, serie);
