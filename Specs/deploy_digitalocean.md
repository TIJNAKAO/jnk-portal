# Deploy no DigitalOcean — portal.jnakao.com.br

Guia passo a passo pra publicar o jnk-portal num ambiente **totalmente
separado** do que já existe hoje na conta DO (o projeto
`jnakao-digital-ocean`/`rdw.jnakao.com.br`) — banco novo, app novo,
subdomínio novo. Nenhum recurso é compartilhado; só o domínio-pai
`jnakao.com.br` é o mesmo.

Existe um template pronto do App Spec em [`.do/app.yaml`](../.do/app.yaml)
(seção 5 usa ele) — sem nenhum segredo real, só placeholders
`ALTERAR-AQUI`.

---

## 0. Visão geral do que vamos criar

| Recurso | O que é |
|---|---|
| 1 Project novo no DO | Agrupamento lógico — isola visualmente os recursos do jnk-portal dos do projeto existente |
| 1 MySQL Managed Database novo | Cluster próprio, banco `jnk_portal_base` — não é um banco a mais dentro do cluster que já existe |
| 1 App Platform app novo | 2 componentes: `api` (Web Service, Node/Express) + `portal` (Static Site, o build do Vite) |
| 1 subdomínio novo | `portal.jnakao.com.br`, apontando só pro app novo |

**Front e back ficam sob o mesmo domínio**, em rotas diferentes
(`portal.jnakao.com.br/` pro site, `portal.jnakao.com.br/api/*` pra API) —
evita CORS de propósito e é assim que o App Spec (seção 5) já vem
configurado.

---

## 1. Pré-requisitos

- Acesso à conta DO com permissão de criar recursos.
- Acesso à zona DNS de `jnakao.com.br` (painel da DO, se o domínio já
  estiver delegado pra lá; senão, o provedor onde o domínio está
  registrado/hospedado).
- O repositório `jnk-portal` publicado no GitHub (App Platform faz deploy
  via integração com git — se ainda não tem remote, criar o repo no GitHub
  e dar push antes de continuar).

---

## 2. Criar um Project novo (isolamento lógico)

1. Painel DO → **Projects** → **New Project**.
2. Nome: `jnk-portal` (ou `JNK Portal`).
3. Não mover nenhum recurso existente pra dentro — os recursos criados nas
   seções 3 e 5 já nascem dentro dele se você criar com este Project
   selecionado como destino.

---

## 3. Banco de dados — MySQL Managed Database novo

1. Painel DO → **Databases** → **Create Database Cluster**.
2. Engine: **MySQL** (versão 8).
3. Região: escolha a **mesma região** que vai usar no App Platform (seção
   5) — reduz latência entre API e banco, e é pré-requisito pra usar o
   endpoint **privado** (VPC) em vez do público.
4. Plano: o menor (`Basic`, 1 nó) serve pra começar — dá pra redimensionar
   depois sem downtime.
5. Nome do cluster: `jnk-portal-db` (ou similar).
6. Depois de criado (leva alguns minutos):
   - **Connection Details** → anote `host`, `port` (normalmente `25060`),
     `user` (`doadmin`), `password`.
   - **Download CA Certificate** → baixa `ca-certificate.crt`. Abra o
     arquivo num editor de texto — vai precisar colar o conteúdo inteiro
     como uma env var (seção 5), não como arquivo.
   - Dentro do cluster, criar o banco: aba **Databases** do cluster →
     **Add new database** → nome `jnk_portal_base`. (Alternativa via linha
     de comando, se tiver o cliente `mysql` instalado:
     `mysql -h <host> -P <port> -u doadmin -p --ssl-ca=ca-certificate.crt -e "CREATE DATABASE jnk_portal_base CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"`)
7. **Trusted Sources**: por enquanto, deixe liberado geral ou adicione seu
   IP pra conseguir rodar as migrations (seção 6) antes do App Platform
   existir. Depois de criar o app (seção 5), volte aqui e adicione o app
   `jnk-portal` como trusted source — restringe o acesso ao banco só pro
   app, mais seguro que deixar público.

---

## 4. Código no GitHub

```
git remote add origin https://github.com/SEU-USUARIO/jnk-portal.git
git add -A
git commit -m "Setup inicial do jnk-portal"
git push -u origin main
```

(Ajuste `SEU-USUARIO` e o nome do repositório. Se já tem remote configurado,
só `git push`.)

---

## 5. App Platform — criar o app com 2 componentes

**Caminho rápido — usando o template pronto:**

1. Abra [`.do/app.yaml`](../.do/app.yaml) e preencha os `ALTERAR-AQUI`:
   - `repo` (nas duas seções, `services` e `static_sites`): `seu-usuario/jnk-portal`.
   - `DB_HOST`, `DB_PASSWORD`: os dados anotados na seção 3.
   - `DB_CA_CERT`: cole o conteúdo inteiro do `ca-certificate.crt` (das
     linhas `-----BEGIN CERTIFICATE-----` até `-----END CERTIFICATE-----`).
   - `JWT_SECRET`: gere um valor novo — **não reaproveite o de
     desenvolvimento local**:
     ```
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - `PARAMETROS_ENCRYPTION_KEY`: gere outro valor novo (32 bytes em hex):
     ```
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
2. Painel DO → **Apps** → **Create App** → escolha **GitHub** como fonte,
   autorize o repo `jnk-portal` → na tela de configuração dos recursos,
   clique em **Edit Your App Spec** (canto superior) e cole o YAML já
   preenchido.
3. Confirme o Project criado na seção 2 como destino.
4. **Review** → **Create Resources**. O primeiro deploy roda automaticamente
   (build do `api` + build do `portal`) — acompanhe em **Activity**.

**Se preferir pela UI manual** (sem colar YAML), configure dois
componentes com estes valores — os mesmos do template acima:

| Campo | `api` (Web Service) | `portal` (Static Site) |
|---|---|---|
| Source Directory | `/` | `/` |
| Build Command | `npm install && npm run build:shared && npm run build:api` | `npm install && npm run build:shared && npm run build:portal` |
| Run Command | `npm run start --workspace=apps/api` | — |
| Output Directory | — | `apps/portal/dist` |
| HTTP Port | `3001` | — |
| Route | `/api` | `/` |
| Env vars | ver `.do/app.yaml` | `VITE_API_URL`, `VITE_APP_VERSION` |

**Por que `Source Directory: /` nos dois** (não `apps/api` nem
`apps/portal`): o jnk-portal usa npm workspaces — `npm install` precisa
rodar na raiz do monorepo pra resolver a dependência local
`@jnk-portal/shared` corretamente. Rodar a partir da subpasta quebraria
essa resolução.

---

## 6. Rodar as migrations contra o banco de produção

Depois que o componente `api` estiver com deploy bem-sucedido (Connection
Details do banco já configuradas), rode as migrations. Duas opções:

**Opção A — Console do App Platform (mais simples, já usa as env vars de produção):**

1. App → componente `api` → aba **Console**.
2. Rodar:
   ```
   npm run migrate --workspace=apps/api
   ```

**Opção B — da sua máquina**, apontando pro banco novo (não pro local):

1. Copie `apps/api/.env.example` pra `apps/api/.env.producao` (não
   commitar) e preencha com os dados reais do cluster (seção 3) — use
   `DB_CA_CERT_PATH` apontando pro `ca-certificate.crt` baixado.
2. `cd apps/api && npx dotenv -e .env.producao -- tsx db/migrate.ts`
   (ou exporte as variáveis no shell e rode `npm run migrate --workspace=apps/api` a partir da raiz).

---

## 7. Seed inicial (primeiro usuário admin)

`apps/api/db/seeds/dev.sql` cria um usuário com senha de teste
(`Admin@123`) — **não rodar esse arquivo em produção**. Em vez disso, gere
um hash de senha forte e insira manualmente (Console do App Platform, ou
`mysql` da sua máquina apontando pro cluster):

```
node -e "require('bcryptjs').hash('SUA-SENHA-FORTE-AQUI', 10).then(console.log)"
```

```sql
INSERT INTO filiais (nome, cnpj) VALUES ('Matriz', 'CNPJ-REAL-AQUI');

INSERT INTO usuarios (nome, email, senha_hash)
VALUES ('Nome do Admin', 'email@jnakao.com.br', '<hash gerado acima>');

INSERT INTO preferencias_usuario (usuario_id) SELECT id FROM usuarios WHERE email = 'email@jnakao.com.br';

INSERT INTO usuarios_filiais (usuario_id, filial_id)
SELECT u.id, f.id FROM usuarios u, filiais f
WHERE u.email = 'email@jnakao.com.br' AND f.cnpj = 'CNPJ-REAL-AQUI';

INSERT INTO perfis (nome, descricao) VALUES ('Administrador', 'Acesso total');

INSERT INTO perfis_telas (perfil_id, tela_id, pode_visualizar, pode_criar, pode_editar, pode_deletar)
SELECT p.id, t.id, TRUE, TRUE, TRUE, TRUE FROM perfis p, telas_modulo t WHERE p.nome = 'Administrador';

INSERT INTO usuarios_perfis (usuario_id, perfil_id)
SELECT u.id, p.id FROM usuarios u, perfis p
WHERE u.email = 'email@jnakao.com.br' AND p.nome = 'Administrador';
```

---

## 8. Domínio — `portal.jnakao.com.br`

1. App Platform → app `jnk-portal` → **Settings** → **Domains** → **Add Domain**.
2. Digite `portal.jnakao.com.br` → tipo **Primary**. A DO mostra um
   registro CNAME pra criar (algo como apontar pra
   `<nome-do-app>.ondigitalocean.app`).
3. Criar o registro DNS:
   - **Se `jnakao.com.br` já está com DNS gerenciado na DO**: Painel →
     **Networking** → **Domains** → `jnakao.com.br` → **Create Record** →
     tipo `CNAME`, nome `portal`, target o hostname que a DO mostrou no
     passo 2, TTL padrão.
   - **Se o DNS está em outro provedor** (registro.br, Cloudflare, etc.):
     entrar lá e criar o mesmo registro CNAME (`portal` → hostname da DO).
4. Propagação de DNS pode levar de minutos a algumas horas. TLS/HTTPS é
   automático (a DO emite certificado Let's Encrypt assim que o CNAME
   propaga) — não precisa configurar certbot nem nada manual.

---

## 9. Testar

1. `https://portal.jnakao.com.br/api/health` → deve responder
   `{"status":"ok","database":"ok"}`.
2. `https://portal.jnakao.com.br` → tela de login do Portal.
3. Login com o usuário criado na seção 7.

---

## 10. O que muda em relação ao ambiente local

- **`AGENTE_API_URL`** (Parâmetros → TI): trocar de `http://localhost:3001/api/ti/inventario` pra `https://portal.jnakao.com.br/api/ti/inventario` antes de gerar o script "Configurar Agente de Inventário" (spec do módulo TI, seção 4.7).
- **`AGENTE_DOWNLOAD_URL`**: `https://portal.jnakao.com.br/downloads/AgenteInventarioPC.exe` — o `.exe` publicado (`dotnet publish -c Release`, autocontido, ~65MB) fica versionado em [`downloads/`](../downloads) na raiz do monorepo, servido publicamente (sem login) pelo próprio componente `api` (rota `/downloads`, `express.static`). Ao atualizar o agente, republicar (`dotnet publish -c Release` dentro de `agente-inventario-pc/AgenteInventarioPC`) e substituir o arquivo em `downloads/`.
- **Redirect URI do Mercado Livre** (Parâmetros → Mercado Livre, campo `REDIRECT_URI`): precisa ser `https://portal.jnakao.com.br/api/integracao/mercado-livre/callback`, e essa mesma URL precisa estar cadastrada no DevCenter do Mercado Livre pro app usado.
- **`FRONTEND_URL`** (env var do componente `api`): já vem `https://portal.jnakao.com.br` no template — usado no link do e-mail de "Esqueci minha senha".

---

## 11. Isolamento confirmado

- Banco: cluster novo, sem relação com o cluster do `jnakao-digital-ocean`.
- App: app novo no App Platform, sem relação com o app existente.
- Domínio: subdomínio novo (`portal.jnakao.com.br`) — o domínio raiz
  `jnakao.com.br` e o subdomínio existente (`rdw.jnakao.com.br`, se ainda
  ativo) continuam intocados.
- Único ponto em comum: a mesma conta DO e o mesmo domínio-pai — nenhum
  recurso é compartilhado entre os dois ambientes.

---

## 12. Alternativa — Droplet em vez de App Platform

Se preferir uma VM tradicional (mais controle, mais manutenção manual —
nginx, PM2, certbot) em vez de App Platform, os passos 3, 4, 6-9 continuam
os mesmos; a seção 5 muda para: criar um Droplet Ubuntu, instalar Node 20+
e Nginx, clonar o repo, `npm install && npm run build` na raiz, rodar a API
com PM2 (`pm2 start apps/api/dist/index.js --name jnk-portal-api`), servir
o `apps/portal/dist` como estático via Nginx com proxy reverso de `/api`
pra `localhost:3001`, e usar `certbot --nginx` pro TLS. Recomendo App
Platform pra começar — menos operação manual, e é o que o
`jnakao-digital-ocean` já usa hoje (familiaridade).
