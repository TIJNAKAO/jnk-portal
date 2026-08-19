-- Seed de dados de TESTE local — NÃO faz parte das migrations numeradas
-- (schema), não deve rodar contra o cluster real da DigitalOcean.
-- Cria: 1 filial, 1 usuário admin, 1 perfil "Administrador" com acesso
-- total às telas do CONFIG, TI e Integração, e os vínculos entre eles.

-- `nome` fica só "Matriz": o prefixo "01 - " é adicionado automaticamente
-- por `formatarNomeFilial()` (apps/api/src/services/sessao.ts) ao montar
-- `nomeFormatado` para a sessão — não duplicar aqui.
INSERT INTO filiais (nome, cnpj)
SELECT 'Matriz', '12345678000199'
WHERE NOT EXISTS (SELECT 1 FROM filiais WHERE cnpj = '12345678000199');

-- Senha: Admin@123 (hash bcrypt já gerado)
INSERT INTO usuarios (nome, email, senha_hash)
SELECT 'Administrador', 'admin@jnkportal.com.br', '$2a$10$59SQwrcw14Wgxi8RsYzjouRCeIKNU7Ny9EFSEr8wGqTknSe7Bujfa'
WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE email = 'admin@jnkportal.com.br');

INSERT INTO preferencias_usuario (usuario_id)
SELECT u.id FROM usuarios u
WHERE u.email = 'admin@jnkportal.com.br'
  AND NOT EXISTS (SELECT 1 FROM preferencias_usuario p WHERE p.usuario_id = u.id);

INSERT INTO usuarios_filiais (usuario_id, filial_id)
SELECT u.id, f.id
FROM usuarios u, filiais f
WHERE u.email = 'admin@jnkportal.com.br' AND f.cnpj = '12345678000199'
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_filiais uf WHERE uf.usuario_id = u.id AND uf.filial_id = f.id
  );

INSERT INTO perfis (nome, descricao)
SELECT 'Administrador', 'Acesso total ao Configurador, TI e Integração'
WHERE NOT EXISTS (SELECT 1 FROM perfis WHERE nome = 'Administrador');

INSERT INTO perfis_telas (perfil_id, tela_id, pode_visualizar, pode_criar, pode_editar, pode_deletar)
SELECT p.id, t.id, TRUE, TRUE, TRUE, TRUE
FROM perfis p
JOIN telas_modulo t ON (t.rota_tela LIKE '/config/%' OR t.rota_tela LIKE '/ti/%' OR t.rota_tela LIKE '/integracao/%')
WHERE p.nome = 'Administrador'
  AND NOT EXISTS (SELECT 1 FROM perfis_telas pt WHERE pt.perfil_id = p.id AND pt.tela_id = t.id);

INSERT INTO usuarios_perfis (usuario_id, perfil_id)
SELECT u.id, p.id
FROM usuarios u, perfis p
WHERE u.email = 'admin@jnkportal.com.br' AND p.nome = 'Administrador'
  AND NOT EXISTS (
    SELECT 1 FROM usuarios_perfis up WHERE up.usuario_id = u.id AND up.perfil_id = p.id
  );
