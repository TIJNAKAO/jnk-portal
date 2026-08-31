-- Unifica o cadastro de filiais: usuarios_filiais, logs_acesso, ti_equipamento,
-- avisos_plataforma, usuarios.ultimo_acesso_filial_id e sysemp_empresa.filial_id
-- passam a referenciar config_filial(recno). As tabelas filiais e
-- usuarios_empresas deixam de existir.
-- Ver Specs/spec_config_filial.md, secao 5.
--
-- ORDEM OBRIGATORIA: as FKs impedem qualquer outra. Remover as constraints,
-- remapear os valores, so entao recriar apontando para config_filial.

-- ---- 1. Remover as FKs que apontam para filiais ----
ALTER TABLE usuarios_filiais    DROP FOREIGN KEY usuarios_filiais_ibfk_2;
ALTER TABLE usuarios            DROP FOREIGN KEY usuarios_ibfk_1;
ALTER TABLE avisos_plataforma   DROP FOREIGN KEY avisos_plataforma_ibfk_1;
ALTER TABLE logs_acesso         DROP FOREIGN KEY logs_acesso_ibfk_2;
ALTER TABLE ti_equipamento      DROP FOREIGN KEY ti_equipamento_ibfk_2;
ALTER TABLE sysemp_empresa      DROP FOREIGN KEY sysemp_empresa_ibfk_1;

-- ---- 2. Remapear logs_acesso (unica tabela com dado) ----
-- 1.079 linhas apontam para as filiais 1/2/3. O de-para sai do CNPJ; como o
-- CNPJ de "JNakao" corresponde a cinco empresas SysEmp, o criterio e o MENOR
-- codigo. O historico de acesso e informativo: nao alimenta relatorio.
UPDATE logs_acesso l
JOIN filiais f ON f.id = l.filial_id
JOIN (
    SELECT REGEXP_REPLACE(cnpj, '[^0-9]', '') AS cnpj_num, MIN(recno) AS recno
    FROM config_filial
    WHERE origem_dados = 'SYSEMP'
    GROUP BY REGEXP_REPLACE(cnpj, '[^0-9]', '')
) alvo ON alvo.cnpj_num = REGEXP_REPLACE(f.cnpj, '[^0-9]', '')
SET l.filial_id = alvo.recno;

-- Sobrou algum log cujo CNPJ nao casou? Vira NULL em vez de apontar para
-- linha inexistente, que impediria recriar a FK.
UPDATE logs_acesso
SET filial_id = NULL
WHERE filial_id IS NOT NULL
  AND filial_id NOT IN (SELECT recno FROM config_filial);

-- ---- 3. Migrar os vinculos de usuario ----
-- Os vinculos atuais sao por grupo (a filial "JNakao" == grupo JNK). Cada
-- usuario passa a ter todas as filiais do grupo que ja tinha, preservando
-- exatamente o acesso de hoje.
CREATE TEMPORARY TABLE tmp_vinculos AS
SELECT DISTINCT uf.usuario_id, cf.recno AS filial_id
FROM usuarios_filiais uf
JOIN filiais f ON f.id = uf.filial_id
JOIN config_filial cf
  ON cf.grupo = CASE f.nome WHEN 'JNakao' THEN 'JNK' ELSE f.nome END;

DELETE FROM usuarios_filiais;
INSERT INTO usuarios_filiais (usuario_id, filial_id)
SELECT usuario_id, filial_id FROM tmp_vinculos;
DROP TEMPORARY TABLE tmp_vinculos;

-- ---- 4. Zerar as colunas sem dado, que apontavam para ids de filiais ----
UPDATE usuarios SET ultimo_acesso_filial_id = NULL;
UPDATE avisos_plataforma SET filial_id = NULL WHERE filial_id IS NOT NULL;
UPDATE ti_equipamento SET filial_id = NULL WHERE filial_id IS NOT NULL;
UPDATE sysemp_empresa SET filial_id = NULL WHERE filial_id IS NOT NULL;

-- ---- 5. Recriar as FKs apontando para config_filial ----
ALTER TABLE usuarios_filiais
    ADD CONSTRAINT fk_usuarios_filiais_filial
    FOREIGN KEY (filial_id) REFERENCES config_filial(recno) ON DELETE CASCADE;

ALTER TABLE usuarios
    ADD CONSTRAINT fk_usuarios_ultima_filial
    FOREIGN KEY (ultimo_acesso_filial_id) REFERENCES config_filial(recno) ON DELETE SET NULL;

ALTER TABLE avisos_plataforma
    ADD CONSTRAINT fk_avisos_filial
    FOREIGN KEY (filial_id) REFERENCES config_filial(recno) ON DELETE CASCADE;

ALTER TABLE logs_acesso
    ADD CONSTRAINT fk_logs_filial
    FOREIGN KEY (filial_id) REFERENCES config_filial(recno);

ALTER TABLE ti_equipamento
    ADD CONSTRAINT fk_ti_equip_filial
    FOREIGN KEY (filial_id) REFERENCES config_filial(recno) ON DELETE SET NULL;

ALTER TABLE sysemp_empresa
    ADD CONSTRAINT fk_sysemp_empresa_filial
    FOREIGN KEY (filial_id) REFERENCES config_filial(recno) ON DELETE SET NULL;

-- ---- 6. Remover as tabelas que deixaram de existir ----
DROP TABLE usuarios_empresas;
DROP TABLE filiais;
