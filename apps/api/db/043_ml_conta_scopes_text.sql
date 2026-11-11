-- Alarga ml_conta.scopes de VARCHAR(255) para TEXT.
--
-- A conexao da conta falhava no callback do OAuth com "Data too long for
-- column 'scopes'": a troca do codigo por token dava certo, mas o texto de
-- permissoes devolvido pelo Mercado Livre nao cabia em 255 caracteres, e a
-- conta nao era gravada (ver routes/mercadoLivre.ts, /callback).
--
-- Aditiva e compativel com o codigo anterior: TEXT aceita tudo que o
-- VARCHAR(255) aceitava, entao o PRE_DEPLOY pode rodar com a versao antiga
-- ainda servindo. O DEFAULT '' do VARCHAR some porque TEXT nao aceita
-- default literal no MySQL 8 sem parenteses; o codigo sempre informa scopes
-- no INSERT (services/mercadoLivre/client.ts, salvarConta).

ALTER TABLE ml_conta MODIFY COLUMN scopes TEXT NOT NULL;
