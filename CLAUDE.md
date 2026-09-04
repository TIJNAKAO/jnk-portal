# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

Código, comentários, commits, mensagens de erro e UI são em **português**. Assuntos de commit seguem o padrão do histórico: sem acentos, imperativo/descritivo, focados no efeito (`Relatorios passam a respeitar as empresas do ERP que o usuario pode ver`).

## Comandos

Monorepo npm workspaces (Node ≥ 20). Rodar da raiz:

```bash
npm install                       # instala todos os workspaces
npm run dev:api                   # API em :3001 (tsx watch)
npm run dev:portal                # portal em :5173 (vite)
npm run build                     # shared -> api -> portal, nesta ordem
npm run typecheck                 # tsc --noEmit em todos os workspaces
npm run db:migrate                # aplica db/*.sql pendentes
```

`packages/shared` precisa estar **compilado** (`npm run build:shared`) antes de api/portal — os dois importam `@jnk-portal/shared` pelo `dist`, não pelo fonte.

Testes (vitest, colocados ao lado do código como `*.test.ts`):

```bash
npm run test --workspace=apps/api
npm run test --workspace=apps/api -- src/services/faturamentoCalculos.test.ts   # um arquivo
npm run test --workspace=apps/api -- -t "nome do caso"                          # um caso
npm run test:watch --workspace=apps/portal
```

Scripts operacionais da API (`--workspace=apps/api`): `cron:sincronizar <chave-entidade>`, `backfill:nf`, `etl:fatcom:recarregar`.

`npm run lint` não faz nada — não há ESLint configurado. A verificação real é `typecheck` (TS strict + `noUncheckedIndexedAccess`).

## Specs são a fonte da verdade

`Specs/*.md` são **documentos vivos**: quando a implementação diverge do spec ou vai além dele, o spec é atualizado **no mesmo commit**. Antes de mexer num módulo, leia o spec dele — vários trazem decisões de produção (bugs encontrados, formatos reais das APIs externas) que não estão no código:

A numeração de seções começa em **1**, nunca em 0 — inclusive subtópicos (`1.1`). Referências cruzadas ("ver spec, seção 5.2") aparecem também em comentários de código e migrations: ao renumerar um spec, atualizar as duas pontas.

| Spec | Assunto |
|---|---|
| `spec_infra_portal_base_monorepo.md` | Base: auth, tenant, RBAC, Hub, força-atualização. Seção 1 tem o status de implementação item a item |
| `spec_modulo_ti.md` | Inventário de equipamentos + agente C# |
| `spec_modulo_integracao.md` | SysEmp (fila), Mercado Livre, ETLs |
| `spec_modulo_faturamento.md` / `spec_modulo_estoque.md` | Relatórios sobre `etl_fatcom` / curva ABC |
| `spec_config_filial.md` | Unificação `filiais` + `etl_empresa` → `config_filial` (planejado) |
| `deploy_digitalocean.md` | DigitalOcean App Platform; template do App Spec em `.do/app.yaml` |

## Arquitetura

**`apps/api`** — Express + `mysql2/promise`, ESM (imports com extensão `.js`), sem ORM: SQL parametrizado direto. Rotas em `src/routes/*` (montadas em `src/app.ts`), regra de negócio em `src/services/*`. Escritas em mais de uma tabela usam `withTransaction` de `src/config/database.ts`. O pool usa `timezone: 'Z'` porque API e banco ficam em regiões diferentes.

**`apps/portal`** — React 18 + Vite + Tailwind + react-router. Sem biblioteca de estado ou data-fetching: `useApi()`/`useApiDownload()` (`src/lib/useApi.ts`) injetam o token da sessão em `apiRequest`. Sessão em `localStorage` via `AuthProvider`. Só o `DashboardPage` é `lazy` (Recharts dobra o bundle). Ícones de módulo passam pelo mapa explícito em `src/lib/icons.ts` — importar o dicionário inteiro do lucide custaria ~600KB.

**`packages/shared`** — só tipos compartilhados entre api e portal.

**`agente-inventario-pc`** — agente C#/.NET que roda nas máquinas e posta inventário na API. O `.exe` publicado fica em `downloads/`, servido estaticamente e **sem autenticação** (`/downloads`), porque o instalador o baixa via `Invoke-WebRequest`.

### Três camadas de autorização, que não se confundem

1. **`authTenant`** (JWT) — popula `req.usuario = { id, filialAtivaId }`. `filialAtivaId` vem do token, nunca de parâmetro do cliente. Aceita o token por query string também, porque `EventSource` (SSE das execuções) não manda header.
2. **`requirePermissao(rotaTela, acao)`** — gate por tela + ação, resolvido por `buscarPermissoesEfetivas()` em `services/permissoes.ts`, que é a **fonte única** (união OR entre `permissoes_usuario` e os perfis ativos). Não duplicar essa query. Toda rota autenticada declara sua `ROTA` e usa a factory.
3. **`escopoEmpresas.ts`** — quais **empresas do ERP** o usuário vê nos relatórios. **Empresa ≠ filial**: filial é unidade organizacional (TI, avisos, seletor da sidebar); empresa é entidade do ERP, e cinco das nove empresas SysEmp compartilham CNPJ (contas de fulfillment de marketplace). Escopo vazio gera `WHERE 1 = 0` — falha fechada, ausência de configuração nunca vira acesso total. Filtros sempre em pares `(origem, cd_filial)`: o código 1 é uma empresa na SysEmp e outra no KPL.

`apiKeyAgente` (header `X-Api-Key` contra `ti_api_token`) é a via separada do agente de inventário — máquina, não usuário.

### Módulo novo não aparece sozinho

Seedar `modulos_sistema` + `telas_modulo` **não concede permissão a ninguém**, e não há exceção para administrador: o módulo fica invisível para todos, inclusive para quem o instalou. Liberar é passo manual em **Configurador → Perfis → marcar as telas → Salvar**. Nenhuma migration do projeto concede permissão — é decisão de negócio.

Ao adicionar uma tela: rota em `App.tsx` + router em `app.ts` + migration de seed da linha em `telas_modulo`. A linha em `telas_modulo` já aparece no menu, então só pode ser seedada depois que a rota existir (por isso `019_` e `020_` do Faturamento são separadas).

### Migrations

`apps/api/db/NNN_*.sql`, aplicadas em ordem alfabética pelo runner `db/migrate.ts`, que registra em `schema_migrations`. São **imutáveis depois de aplicadas** — corrigir significa criar a próxima. Deleção de entidade referenciada por FK é soft delete.

### Integração: fila SysEmp e ETL

`services/integracaoRegistry.ts` é o registro central das entidades sincronizáveis, usado tanto pelo botão manual do Painel quanto pelos jobs `SCHEDULED` (`cronSincronizar.ts`, que checa execução em andamento antes de disparar).

Entidades baseadas em fila (`notas_fiscais`, `estoque`, `pedidos`, `parceiros`) passam por `services/sysemp/fila.ts` — importar fila → buscar detalhe → gravar → confirmar. Cada consumidor se registra por **side-effect do import** em `integracaoRegistry.ts` (`registrarConsumidorFila` com seu `tipo_tabela`); um consumidor não importado ali simplesmente não existe em runtime. `etl_fatcom` é a tabela-fato de faturamento que consolida os dois ERPs (SysEmp atual e KPL legado), distinguidos por `origem_dados`.

Credenciais de sistemas externos **não são env vars**: ficam em `parametros_sistema`, criptografadas com AES-256-GCM (`PARAMETROS_ENCRYPTION_KEY`), lidas por `obterParametro()` e editáveis em Configurador → Parâmetros.

### Versão e força-atualização

O `vite.config.ts` deriva a versão do hash do commit, embute no bundle e emite `version.json` no mesmo build; `ForceUpdateGuard` compara os dois e recarrega a aba quando divergem, com trava contra loop. Não voltar a comparar `VITE_APP_VERSION` com `APP_VERSION` — são fixas e nunca divergem.

## Deploy

DigitalOcean App Platform, `deploy_on_push` em `master`: static site (portal) + web service (api) + um job SCHEDULED por entidade sincronizada. `.do/app.yaml` é template com placeholders `ALTERAR-AQUI` — segredos reais só no painel da DO, nunca no arquivo. `catchall_document: index.html` no static site é obrigatório (SPA); sem ele, F5 em qualquer rota devolve 404.
