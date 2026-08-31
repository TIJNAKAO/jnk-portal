-- Renomeia etl_empresa para config_filial: a tabela deixa de ser uma dimensao
-- de ETL e passa a ser o cadastro unico de filiais do portal.
-- Ver Specs/spec_config_filial.md, secao 4.
--
-- O RENAME preserva as 13 linhas e os recno atuais, que passam a ser
-- referenciados por usuarios_filiais, logs_acesso, ti_equipamento e
-- avisos_plataforma na migration seguinte.

RENAME TABLE etl_empresa TO config_filial;

ALTER TABLE config_filial
    -- Agrupamento livre, paralelo ao `grupo` (JNK/NK2/CNK2), sem hierarquia
    -- definida entre os dois. Preenchido a mao na tela de Filiais.
    ADD COLUMN empresa VARCHAR(50) NULL AFTER grupo,
    -- Permite desativar sem excluir. filiais tinha; etl_empresa nao.
    ADD COLUMN ativa BOOLEAN NOT NULL DEFAULT TRUE AFTER ie,
    -- Era 25 e truncava: "FULL ML CNK2 COM, IMP E E".
    MODIFY dc_fantasia VARCHAR(100) NOT NULL,
    -- 'MANUAL' entra como terceira origem, para filiais que nao existem em ERP
    -- nenhum. VARCHAR(6) ja acomoda.
    MODIFY origem_dados VARCHAR(6) NOT NULL;
