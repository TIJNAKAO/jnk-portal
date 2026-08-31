-- Carrega as empresas do ERP legado KPL em etl_empresa, completando a
-- consolidacao das duas origens na dimensao de empresa.
--
-- Ate aqui etl_empresa tinha so as 9 linhas de origem SYSEMP, geradas por
-- services/etl/empresa.ts a partir de sysemp_empresa. As do KPL entram como
-- SEED e nao como ETL de proposito: o vinculo entre codigo de unidade de
-- negocio e CNPJ nao existe em nenhuma tabela bkpkpl_* - e conhecimento de
-- negocio, fornecido pelo cliente. Como o KPL esta congelado (ultima nota em
-- 04/03/2026), esses dados nao mudam mais.
--
-- A chave de etl_empresa e (origem_dados, cd_filial), entao o CNPJ aparece
-- repetido entre origens de proposito: o join a partir de etl_fatcom e sempre
-- por origem + filial, nunca por CNPJ. O CNPJ fica como atributo, util para
-- agrupar a mesma pessoa juridica entre os dois ERPs quando o relatorio
-- quiser essa visao.
--
-- ATENCAO ao carregar os fatos do KPL no futuro: em bkpkpl_nf_saida, a coluna
-- nf_cod_interno_da_unidade_de_negocio NAO e confiavel como chave. O codigo 3
-- aponta para "CASA J NAKAO LT - FBM" em quase todo o historico, mas para
-- "CASA J NAKAO LT - PDV" em 3.093 notas de 2020, e 926 notas vem sem codigo
-- algum. A identidade correta e o NOME da unidade de negocio:
--
--   'J NAKAO LTDA'                                   -> cd_filial 1 (JNK Barueri)
--   'NK2 IMPORTACAO E EXPORTACAO DE FERRAMENTAS LTDA'-> cd_filial 2 (NK2 Barueri)
--   'CASA J NAKAO LT - FBM'                          -> cd_filial 3 (JNK Louveira)
--   'CASA J NAKAO LT - PDV'                          -> cd_filial 4 (JNK Pinheiro)
--
-- CNPJ gravado no mesmo formato mascarado que a SysEmp usa, para que a
-- comparacao entre origens funcione sem normalizacao.
--
-- Correspondencia de CNPJ entre os dois ERPs (apurada em 31/08/2026):
--   53.794.996/0001-10  KPL 1 JNK Barueri   = SysEmp 1 (BARUERI CASA J NAKAO)
--   19.933.110/0001-34  KPL 2 NK2 Barueri   = SysEmp 3 (NK2 IMP E EXP)
--   53.794.996/0004-63  KPL 3 JNK Louveira  = sem correspondente na SysEmp
--   53.794.996/0003-82  KPL 4 JNK Pinheiro  = SysEmp 2, 5, 6, 7 e 8
-- (na SysEmp, um mesmo CNPJ aparece como varias "empresas" - uma por conta de
-- fulfillment de marketplace.)

INSERT INTO etl_empresa (origem_dados, grupo, cd_filial, dc_filial, dc_fantasia, cnpj, ie, atualizado_em)
VALUES
    ('KPL', 'JNK', 1, 'JNK Barueri',  'JNK Barueri',  '53.794.996/0001-10', '', CURRENT_TIMESTAMP),
    ('KPL', 'NK2', 2, 'NK2 Barueri',  'NK2 Barueri',  '19.933.110/0001-34', '', CURRENT_TIMESTAMP),
    ('KPL', 'JNK', 3, 'JNK Louveira', 'JNK Louveira', '53.794.996/0004-63', '', CURRENT_TIMESTAMP),
    ('KPL', 'JNK', 4, 'JNK Pinheiro', 'JNK Pinheiro', '53.794.996/0003-82', '', CURRENT_TIMESTAMP)
ON DUPLICATE KEY UPDATE
    grupo = VALUES(grupo),
    dc_filial = VALUES(dc_filial),
    dc_fantasia = VALUES(dc_fantasia),
    cnpj = VALUES(cnpj),
    atualizado_em = CURRENT_TIMESTAMP;
