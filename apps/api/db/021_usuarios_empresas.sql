-- Escopo de empresas do ERP por usuario.
--
-- Distinto de `usuarios_filiais`, e de proposito. FILIAL e unidade
-- organizacional: e o que o modulo TI usa para localizar um equipamento, o que
-- os Avisos e o Log de Acesso filtram, e o que o seletor da barra lateral
-- troca. EMPRESA e entidade do ERP - e cinco das nove empresas da SysEmp
-- compartilham o mesmo CNPJ, sendo apenas contas de fulfillment de marketplace
-- (FULL SHOPEE, FULL AMAZON, FULL ML...). Colapsar os dois conceitos quebraria
-- o TI, onde "FULL SHOPEE CASA J NAKAO" nao e um lugar onde existem
-- computadores.
--
-- A chave e (origem_dados, cd_filial), a mesma de etl_empresa, entao ja nasce
-- cobrindo as 4 empresas do KPL alem das 9 da SysEmp.
--
-- Ausencia de vinculo significa NAO VER NADA, nunca "ver tudo" - a regra de
-- falha fechada vive em services/escopoEmpresas.ts e e coberta por teste.
-- Por isso a semeadura abaixo nao pode ser esquecida: sem ela, ligar o filtro
-- deixaria todos os usuarios sem nenhum dado.

CREATE TABLE IF NOT EXISTS usuarios_empresas (
    usuario_id    INT NOT NULL,
    origem_dados  VARCHAR(6) NOT NULL,
    cd_filial     INT NOT NULL,
    criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (usuario_id, origem_dados, cd_filial),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Semeadura a partir do vinculo de filial que ja existe, casando pelo GRUPO.
--
-- Por que grupo e nao CNPJ: o CNPJ cadastrado na filial "JNakao" e
-- 53.794.996/0003-82 (Pinheiros), que casa com as empresas 2, 5, 6, 7 e 8 -
-- mas deixa de fora a empresa 1 (Barueri, 53.794.996/0001-10), que tambem e
-- JNakao. So `grupo_empresa` (JNK/NK2/CNK2) cobre as nove corretamente, e os
-- nomes das tres filiais coincidem com os tres grupos.
INSERT IGNORE INTO usuarios_empresas (usuario_id, origem_dados, cd_filial)
SELECT uf.usuario_id, e.origem_dados, e.cd_filial
FROM usuarios_filiais uf
JOIN filiais f ON f.id = uf.filial_id
JOIN etl_empresa e
  ON e.grupo = CASE f.nome WHEN 'JNakao' THEN 'JNK' ELSE f.nome END;
