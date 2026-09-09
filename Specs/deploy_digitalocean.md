# Deploy no DigitalOcean — portal.jnakao.com.br

Guia passo a passo pra publicar o jnk-portal num ambiente **totalmente
separado** do que já existe hoje na conta DO (o projeto
`jnakao-digital-ocean`/`rdw.jnakao.com.br`) — banco novo, app novo,
subdomínio novo. Nenhum recurso é compartilhado; só o domínio-pai
`jnakao.com.br` é o mesmo.

Existe um template pronto do App Spec em [`.do/app.yaml`](../.do/app.yaml)
(seção 6 usa ele) — sem nenhum segredo real, só placeholders
`ALTERAR-AQUI`.

---

## 1. Visão geral do que vamos criar

| Recurso | O que é |
|---|---|
| 1 Project novo no DO | Agrupamento lógico — isola visualmente os recursos do jnk-portal dos do projeto existente |
| 1 MySQL Managed Database novo | Cluster próprio, banco `jnk_portal_base` — não é um banco a mais dentro do cluster que já existe |
| 1 App Platform app novo | 2 componentes: `api` (Web Service, Node/Express) + `portal` (Static Site, o build do Vite), mais os jobs: `migrate` (PRE_DEPLOY, seção 7.1) e um SCHEDULED por entidade sincronizada |
| 1 subdomínio novo | `portal.jnakao.com.br`, apontando só pro app novo |

**Front e back ficam sob o mesmo domínio**, em rotas diferentes
(`portal.jnakao.com.br/` pro site, `portal.jnakao.com.br/api/*` pra API) —
evita CORS de propósito e é assim que o App Spec (seção 6) já vem
configurado.

---

## 2. Pré-requisitos

- Acesso à conta DO com permissão de criar recursos.
- Acesso à zona DNS de `jnakao.com.br` (painel da DO, se o domínio já
  estiver delegado pra lá; senão, o provedor onde o domínio está
  registrado/hospedado).
- O repositório `jnk-portal` publicado no GitHub (App Platform faz deploy
  via integração com git — se ainda não tem remote, criar o repo no GitHub
  e dar push antes de continuar).

---

## 3. Criar um Project novo (isolamento lógico)

1. Painel DO → **Projects** → **New Project**.
2. Nome: `jnk-portal` (ou `JNK Portal`).
3. Não mover nenhum recurso existente pra dentro — os recursos criados nas
   seções 4 e 5 já nascem dentro dele se você criar com este Project
   selecionado como destino.

---

## 4. Banco de dados — MySQL Managed Database novo

1. Painel DO → **Databases** → **Create Database Cluster**.
2. Engine: **MySQL** (versão 8).
3. Região: escolha a **mesma região** que vai usar no App Platform (seção
   6) — reduz latência entre API e banco, e é pré-requisito pra usar o
   endpoint **privado** (VPC) em vez do público.
4. Plano: o menor (`Basic`, 1 nó) serve pra começar — dá pra redimensionar
   depois sem downtime.
5. Nome do cluster: `jnk-portal-db` (ou similar).
6. Depois de criado (leva alguns minutos):
   - **Connection Details** → anote `host`, `port` (normalmente `25060`),
     `user` (`doadmin`), `password`.
   - **Download CA Certificate** → baixa `ca-certificate.crt`. Abra o
     arquivo num editor de texto — vai precisar colar o conteúdo inteiro
     como uma env var (seção 6), não como arquivo.
   - Dentro do cluster, criar o banco: aba **Databases** do cluster →
     **Add new database** → nome `jnk_portal_base`. (Alternativa via linha
     de comando, se tiver o cliente `mysql` instalado:
     `mysql -h <host> -P <port> -u doadmin -p --ssl-ca=ca-certificate.crt -e "CREATE DATABASE jnk_portal_base CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"`)
7. **Trusted Sources**: por enquanto, deixe liberado geral ou adicione seu
   IP pra conseguir rodar as migrations (seção 7) antes do App Platform
   existir. Depois de criar o app (seção 6), volte aqui e adicione o app
   `jnk-portal` como trusted source — restringe o acesso ao banco só pro
   app, mais seguro que deixar público.

---

## 5. Código no GitHub

```
git remote add origin https://github.com/SEU-USUARIO/jnk-portal.git
git add -A
git commit -m "Setup inicial do jnk-portal"
git push -u origin main
```

(Ajuste `SEU-USUARIO` e o nome do repositório. Se já tem remote configurado,
só `git push`.)

---

## 6. App Platform — criar o app com 2 componentes

**Caminho rápido — usando o template pronto:**

1. Abra [`.do/app.yaml`](../.do/app.yaml) e preencha os `ALTERAR-AQUI`:
   - `repo` (nas duas seções, `services` e `static_sites`): `seu-usuario/jnk-portal`.
   - `DB_HOST`, `DB_PASSWORD`: os dados anotados na seção 4.
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
3. Confirme o Project criado na seção 3 como destino.
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

## 7. Rodar as migrations contra o banco de produção

### 7.1. No dia a dia: o job `migrate` (PRE_DEPLOY)

**Todo deploy roda as migrations sozinho.** O job `migrate` do App Spec é
`kind: PRE_DEPLOY`: sobe com o código novo, roda `npm run migrate` e só
então a versão nova recebe tráfego. Falha nele **aborta o deploy** — o app
nunca fica rodando contra um schema que ele não espera.

Reexecutar é inofensivo: o runner registra em `schema_migrations` e pula o
que já foi aplicado.

**Isso impõe uma regra às migrations.** O PRE_DEPLOY roda enquanto a versão
**antiga** ainda atende requisição, então toda migration precisa ser
**aditiva e compatível com o código antigo**. Criar tabela, criar coluna
anulável, criar índice: seguro. Remover ou renomear coluna que a versão
antiga lê: derruba produção durante a janela do deploy. Mudança destrutiva
se faz em dois deploys — primeiro o código para de usar a coluna, depois
outra migration a remove.

Por que o job existe: antes dele, aplicar migration era passo manual no
Console, e esquecer dele subia código sem tabela. Foi exatamente o que
aconteceu na entrega do Fechamento de Custo — o deploy passou, as seis
telas não existiam no banco, e nada apareceu no portal.

O job só recebe as `DB_*`. `JWT_SECRET` e `PARAMETROS_ENCRYPTION_KEY` são
lazy em `src/config/env.ts` e o runner não os toca: segredo que o job não
precisa é segredo que ele não deve receber.

### 7.2. Manualmente, quando necessário

Ainda é preciso rodar à mão em duas situações: no **primeiro deploy** (o
app ainda não existe para ter job), e quando for preciso aplicar uma
migration **sem** fazer deploy. Duas opções:

**Opção A — Console do App Platform (mais simples, já usa as env vars de produção):**

1. App → componente `api` → aba **Console**.
2. Rodar:
   ```
   npm run migrate --workspace=apps/api
   ```

**Opção B — da sua máquina**, apontando pro banco novo (não pro local):

1. Copie `apps/api/.env.example` pra `apps/api/.env.producao` (não
   commitar) e preencha com os dados reais do cluster (seção 4) — use
   `DB_CA_CERT_PATH` apontando pro `ca-certificate.crt` baixado.
2. `cd apps/api && npx dotenv -e .env.producao -- tsx db/migrate.ts`
   (ou exporte as variáveis no shell e rode `npm run migrate --workspace=apps/api` a partir da raiz).

---

## 8. Seed inicial (primeiro usuário admin)

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

## 9. Domínio — `portal.jnakao.com.br`

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

## 10. Testar

1. `https://portal.jnakao.com.br/api/health` → deve responder
   `{"status":"ok","database":"ok"}`.
2. `https://portal.jnakao.com.br` → tela de login do Portal.
3. Login com o usuário criado na seção 8.
4. **Recarregue (F5) já dentro do portal, numa rota interna como `/modules`.**
   Tem que continuar funcionando. Se voltar 404, falta `catchall_document:
   index.html` no componente estático do App Spec.

> **Por que o passo 4 existe.** O portal é uma SPA: o roteamento acontece no
> navegador. Sem `catchall_document`, o servidor estático só conhece o arquivo
> `/index.html` — qualquer pedido direto a `/modules`, `/login` ou
> `/faturamento/notas-fiscais` procura um arquivo naquele caminho, não acha, e
> devolve 404. Navegar a partir da raiz esconde o problema por completo, porque
> aí nenhuma rota interna chega ao servidor. Isso passou despercebido até
> 31/08/2026, quando um Ctrl+Shift+R numa tela interna expôs a falha: a
> aplicação inteira funcionava, mas nenhum link direto ou F5 funcionava.

---

## 11. O que muda em relação ao ambiente local

- **`AGENTE_API_URL`** (Parâmetros → TI): trocar de `http://localhost:3001/api/ti/inventario` pra `https://portal.jnakao.com.br/api/ti/inventario` antes de gerar o script "Configurar Agente de Inventário" (spec do módulo TI, seção 5.7).
- **`AGENTE_DOWNLOAD_URL`**: `https://portal.jnakao.com.br/downloads/AgenteInventarioPC.exe` — o `.exe` publicado (`dotnet publish -c Release`, autocontido, ~65MB) fica versionado em [`downloads/`](../downloads) na raiz do monorepo, servido publicamente (sem login) pelo próprio componente `api` (rota `/downloads`, `express.static`). Ao atualizar o agente, republicar (`dotnet publish -c Release` dentro de `agente-inventario-pc/AgenteInventarioPC`) e substituir o arquivo em `downloads/`.
- **Redirect URI do Mercado Livre** (Parâmetros → Mercado Livre, campo `REDIRECT_URI`): precisa ser `https://portal.jnakao.com.br/api/integracao/mercado-livre/callback`, e essa mesma URL precisa estar cadastrada no DevCenter do Mercado Livre pro app usado.
- **`FRONTEND_URL`** (env var do componente `api`): já vem `https://portal.jnakao.com.br` no template — usado no link do e-mail de "Esqueci minha senha".

---

## 12. Isolamento confirmado

- Banco: cluster novo, sem relação com o cluster do `jnakao-digital-ocean`.
- App: app novo no App Platform, sem relação com o app existente.
- Domínio: subdomínio novo (`portal.jnakao.com.br`) — o domínio raiz
  `jnakao.com.br` e o subdomínio existente (`rdw.jnakao.com.br`, se ainda
  ativo) continuam intocados.
- Único ponto em comum: a mesma conta DO e o mesmo domínio-pai — nenhum
  recurso é compartilhado entre os dois ambientes.

---

## 13. Alternativa — Droplet em vez de App Platform

Se preferir uma VM tradicional (mais controle, mais manutenção manual —
nginx, PM2, certbot) em vez de App Platform, os passos 3, 4, 6-9 continuam
os mesmos; a seção 6 muda para: criar um Droplet Ubuntu, instalar Node 20+
e Nginx, clonar o repo, `npm install && npm run build` na raiz, rodar a API
com PM2 (`pm2 start apps/api/dist/index.js --name jnk-portal-api`), servir
o `apps/portal/dist` como estático via Nginx com proxy reverso de `/api`
pra `localhost:3001`, e usar `certbot --nginx` pro TLS. Recomendo App
Platform pra começar — menos operação manual, e é o que o
`jnakao-digital-ocean` já usa hoje (familiaridade).

---

## 14. Falhas de deploy já vistas em produção

Modos de falha reais, com o sintoma que aparece antes do diagnóstico. Cada
um custou tempo na primeira vez.

### 14.1. `error cloning repo: authentication required` (08/09/2026)

**Sintoma:** o deploy falha no build de **um** componente qualquer (foi o
`cron-precos`), e a mensagem do topo culpa esse componente — o que sugere
problema nele. O build log tem quatro linhas e morre na primeira etapa:

```
git repo clone
› fetching app source code
⇒ Selecting branch "master"
! error cloning repo: authentication required
```

**O que NÃO é:** não é código, não é `npm install`, não é falta de recurso
e não é o componente citado. O build nem chegou a baixar o repositório.

Dois detalhes despistam:

- **O tempo de build parece de esgotamento de recurso.** No incidente,
  "81m 14s total • 1m 46s billable". Os 81 minutos são fila e retentativa,
  não trabalho — o billable de menos de 2 minutos é que diz a verdade.
- **O repositório ser público não ajuda.** O App Platform configurado com
  fonte `github:` nunca faz clone anônimo: usa sempre a instalação do
  GitHub App da DigitalOcean. Instalação sem acesso ao repo falha mesmo em
  repo público.

**Causa:** a autorização DigitalOcean ↔ GitHub perdeu acesso ao
repositório — revogada, expirada, ou o repo saiu da lista de repositórios
permitidos na instalação do GitHub App.

**Correção:**

1. GitHub → `github.com/settings/installations` (ou
   `github.com/organizations/TIJNAKAO/settings/installations`, se for
   organização) → **DigitalOcean** → em *Repository access*, incluir
   `jnk-portal` (ou *All repositories*).
2. Se persistir: DO → App → **Settings** → componente `api` → **Source** →
   reconectar o GitHub.
3. **Actions → Force Rebuild and Deploy.**

**Enquanto durar:** a versão anterior continua servindo normalmente. Só a
capacidade de fazer deploy fica bloqueada — nenhum deploy passa até a
autorização voltar, então não adianta empurrar commit "para tentar de
novo".

### 14.2. Erro 500 e depois 504 durante um deploy que falha

**Sintoma:** login devolve "Erro interno do servidor"; minutos depois,
`/api/*` devolve 504 com página HTML enquanto o site estático responde 200.

**Causa:** janela do deploy. É transitório e se resolve sozinho quando o
deploy termina (ou falha e a versão anterior volta a servir sozinha).

**Como não confundir com bug de código**, na ordem:

1. `curl -s https://portal.jnakao.com.br/api/health` — voltando
   `{"status":"ok","database":"ok"}`, a API está sã.
2. Descobrir **qual versão** está no ar batendo numa rota que só existe na
   versão nova, sem token: **401** significa que a rota existe (código
   novo), **404** que não existe (código antigo). Bater também numa rota
   inventada, para provar que o teste discrimina — sem esse controle, 404
   não prova nada.
3. Só então olhar Activity e Runtime Logs.

### 14.3. Código no ar, tela invisível no portal

**Sintoma:** o deploy passou, a rota da API responde 401, e a tela não
aparece no menu — nem para administrador. Em Configurador → Perfis ela
também não está na lista para ser marcada.

**Causa:** as migrations não rodaram no banco de produção. `deploy_on_push`
reconstrói os componentes, mas o runner de migration não faz parte do build
— antes do job `migrate` (seção 7.1) isso era passo manual e fácil de
esquecer. Sem a linha em `telas_modulo`, não há o que permissionar.

**Distinção que economiza tempo:** tela que **aparece desmarcada** em
Perfis é falta de permissão (passo manual, seção 7.1 do
`spec_infra_portal_base_monorepo.md`). Tela que **não aparece na lista** é
falta de migration. São problemas diferentes com o mesmo sintoma no menu.
