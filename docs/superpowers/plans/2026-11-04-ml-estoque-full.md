# Estoque FULL do Mercado Livre x SysEmp — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar a cada 2 horas o saldo do FULL do ML (foto diária por conta/SKU) e oferecer um relatório que o confronta com `sysemp_estoque_fisico.saldo_disponivel`.

**Architecture:** Nova entidade `ml_estoque_full` no `integracaoRegistry` (padrão `ml_pedidos`), gravando em tabela nova com `data_ref` (dia de Brasília). Tabela `ml_conta_empresa` liga conta ML → `sysemp_empresa`. O relatório é uma função pura de comparação (testada) alimentada por duas consultas, exposta em `/api/estoque/full-ml` e numa tela do módulo Estoque.

**Tech Stack:** Express + mysql2 (SQL direto), ExcelJS, vitest; React + Vite + Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-04-ml-estoque-full-design.md`

## Global Constraints

- Código, comentários, UI e mensagens em português; assunto de commit sem acento, no padrão do histórico; commits terminam com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Migrations em `apps/api/db/NNN_*.sql`, aditivas e imutáveis (próxima livre: `041`). Seed de `telas_modulo` só depois de a rota existir (por isso `042` separada, no último task).
- Saldo SysEmp comparado: `sysemp_estoque_fisico.saldo_disponivel` (com `deleted = FALSE`). Vínculo: SKU do ML = `sysemp_produto.codigo_auxiliar`.
- Quantidade ML comparada: `available_units`. Histórico: uma foto por dia (`data_ref`), cada rodada sobrescreve a do dia. Frequência do job: a cada 2 horas, `America/Sao_Paulo`.
- Data pura em código: `Date.UTC`/`getUTC*`, nunca construtor local nem `toLocaleDateString` sem `timeZone: 'UTC'`.
- Escopo de empresas: `buscarEmpresasPermitidas` + `condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', coluna)`; escopo vazio → `WHERE 1 = 0`.
- Specs atualizados no mesmo commit da mudança (`spec_modulo_integracao.md`, `spec_modulo_estoque.md`); numeração de seções começa em 1.
- Rodar da raiz: `npm run test --workspace=apps/api -- <arquivo>`; `npm run typecheck` ao fim de cada task.

## Review Focus

1. SKU do ML com espaço/caixa diferente de `codigo_auxiliar` → deve casar (trim + maiúsculas); coberto no Task 5.
2. Anúncio FULL com variações (SKU e `inventory_id` por variação) → uma linha por variação; Task 2.
3. SKU vazio no ML → linha "só ML" sem SKU, nunca descartada nem casada com `codigo_auxiliar` vazio; Task 5.
4. Dois produtos SysEmp com o mesmo `codigo_auxiliar` na mesma empresa → saldos somados, não linha duplicada; Task 5.
5. Rodada que falha no meio não pode apagar a foto do dia anterior da conta nem deixar a do dia pela metade → troca por conta dentro de transação só depois de coletar tudo; Task 3.
6. Conta ML sem de-para → ignorada com aviso no log, sem derrubar as outras; Task 3.
7. Relatório sem foto para a data pedida → resposta vazia com a última data disponível, sem erro; Task 5.

---

### Task 1: Migration de schema

**Files:**
- Create: `apps/api/db/041_ml_estoque_full_schema.sql`

**Interfaces:**
- Produces: tabelas `ml_estoque_full` e `ml_conta_empresa` (colunas abaixo), usadas pelos Tasks 3–5.

- [ ] **Step 1: Criar a migration** com `CREATE TABLE IF NOT EXISTS`, engine/charset iguais às de `010_integracao_schema.sql`:
  - `ml_estoque_full`: `id` INT AUTO_INCREMENT PK; `data_ref` DATE NOT NULL; `user_id_ml` BIGINT NOT NULL; `inventory_id` VARCHAR(30) NOT NULL; `item_id` VARCHAR(20) NOT NULL; `variacao_id` BIGINT NULL; `sku` VARCHAR(100) NOT NULL DEFAULT ''; `titulo` VARCHAR(255) NOT NULL DEFAULT ''; `total` INT NOT NULL DEFAULT 0; `disponivel` INT NOT NULL DEFAULT 0; `nao_disponivel` INT NOT NULL DEFAULT 0; `nao_disponivel_detalhe` JSON NULL; `atualizado_em` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP; `UNIQUE KEY uq_mlfull_dia_conta_inv (data_ref, user_id_ml, inventory_id)`; `INDEX idx_mlfull_dia_sku (data_ref, sku)`.
  - `ml_conta_empresa`: `ml_conta_id` INT PK, FK → `ml_conta(id)` ON DELETE CASCADE; `id_empresa` INT NOT NULL, FK → `sysemp_empresa(id_empresa)`.
  - Comentário no topo apontando para `spec_modulo_integracao.md`, seção 4.3.

- [ ] **Step 2: Aplicar** — Run: `npm run db:migrate` (banco de dev). Expected: `041_ml_estoque_full_schema.sql` aplicada, sem erro.

- [ ] **Step 3: Commit** — `Tabelas de estoque FULL do Mercado Livre e de-para conta x empresa`.

---

### Task 2: Cliente ML de estoque FULL e parsers puros

**Files:**
- Modify: `apps/api/src/services/mercadoLivre/client.ts` (adicionar funções, sem mexer nas existentes)
- Create: `apps/api/src/services/mercadoLivre/estoqueFullParse.ts`
- Test: `apps/api/src/services/mercadoLivre/estoqueFullParse.test.ts`

**Interfaces:**
- Produces em `client.ts`:
  - `listarIdsItensFull(accessToken: string, userIdMl: number): Promise<string[]>` — `GET /users/{id}/items/search?logistic_type=fulfillment&search_type=scan&limit=100`, seguindo `scroll_id` até acabar.
  - `buscarItensMl(accessToken: string, ids: string[]): Promise<ItemMl[]>` — `GET /items?ids=...` em blocos de 20, atributos `id,title,inventory_id,seller_custom_field,attributes,variations`; descarta entradas com `code !== 200`.
  - `buscarEstoqueFulfillment(accessToken: string, inventoryId: string): Promise<EstoqueFulfillmentMl>` — `GET /inventories/{id}/stock/fulfillment`.
  - tipos exportados `ItemMl` e `EstoqueFulfillmentMl { inventory_id: string; total: number; available_units: number; not_available_units: number; not_available_detail?: { status: string; quantity: number }[] }`.
- Produces em `estoqueFullParse.ts`:
  - `interface InventarioItem { itemId: string; variacaoId: number | null; inventoryId: string; sku: string; titulo: string }`
  - `extrairInventarios(item: ItemMl): InventarioItem[]` — item com `variations[]` gera uma entrada por variação com `inventory_id` (SKU da variação: `seller_custom_field` ou atributo `SELLER_SKU`); item sem variação gera uma entrada se tiver `inventory_id`; sem `inventory_id` não gera nada; SKU sempre `trim()`.
  - `dataRefBrasilia(agora: Date): string` — `YYYY-MM-DD` do dia em Brasília (UTC-3), via `Date.UTC`/`toISOString`, sem depender do fuso do processo.

- [ ] **Step 1: Escrever os testes** (`estoqueFullParse.test.ts`), com estes casos:
  - `extrairInventarios` item simples: `{id:'MLB1', title:'Furadeira', inventory_id:'INV1', seller_custom_field:' ABC-1 '}` → `[{itemId:'MLB1', variacaoId:null, inventoryId:'INV1', sku:'ABC-1', titulo:'Furadeira'}]`.
  - item com 2 variações (`id` 11 e 12, `inventory_id` `INV2`/`INV3`, SKUs `X-1`/`X-2`) → 2 entradas com `variacaoId` 11 e 12.
  - SKU só no atributo `{id:'SELLER_SKU', value_name:'Z-9'}` → `sku:'Z-9'`.
  - item sem `inventory_id` → `[]`.
  - `dataRefBrasilia(new Date('2026-11-05T02:30:00Z'))` → `'2026-11-04'`; `dataRefBrasilia(new Date('2026-11-05T03:00:00Z'))` → `'2026-11-05'`.

- [ ] **Step 2: Rodar e ver falhar** — Run: `npm run test --workspace=apps/api -- src/services/mercadoLivre/estoqueFullParse.test.ts`. Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar** `estoqueFullParse.ts` e as funções do client (reusar o `request` interno com retry de 429; a assinatura do header é `Authorization: Bearer`). Os endpoints e formatos acima são a melhor hipótese: **confirmar contra a API real** (inclusive anúncios por User Product) e anotar o formato real no spec, seção 4.3.

- [ ] **Step 4: Rodar e ver passar** — mesmo comando. Expected: PASS.

- [ ] **Step 5: Commit** — `Cliente ML para estoque FULL e parsers de inventario`.

---

### Task 3: Sincronização `ml_estoque_full` + registro + cron

**Files:**
- Create: `apps/api/src/services/mercadoLivre/estoqueFull.ts`
- Modify: `apps/api/src/services/integracaoRegistry.ts` (import + entrada `{ chave: 'ml_estoque_full', nome: 'Estoque FULL Mercado Livre', sincronizar: sincronizarMlEstoqueFull }`)
- Modify: `.do/app.yaml` (novo job `cron-ml-estoque-full`, copiando a estrutura de `cron-etl-fatcom`, `run_command` com `ml_estoque_full`, `schedule.cron: "0 */2 * * *"`, `time_zone: America/Sao_Paulo`)
- Test: `apps/api/src/services/mercadoLivre/estoqueFull.test.ts`

**Interfaces:**
- Consumes: Task 2 (`listarIdsItensFull`, `buscarItensMl`, `buscarEstoqueFulfillment`, `extrairInventarios`, `dataRefBrasilia`), `listarContas`/`accessTokenValido` (client), `integracaoLog`, `withTransaction`.
- Produces: `sincronizarMlEstoqueFull(idLog: number): Promise<ResultadoSincronizacao>` (qtde = linhas gravadas); `linhaParaGravacao(inv: InventarioItem, estoque: EstoqueFulfillmentMl): LinhaEstoqueFull` (pura, exportada para teste), onde `LinhaEstoqueFull` tem `inventoryId, itemId, variacaoId, sku, titulo, total, disponivel, naoDisponivel, naoDisponivelDetalhe: string | null` (JSON.stringify do detalhe).

- [ ] **Step 1: Teste** de `linhaParaGravacao`: estoque `{total:10, available_units:7, not_available_units:3, not_available_detail:[{status:'damaged',quantity:2},{status:'lost',quantity:1}]}` → `disponivel:7, naoDisponivel:3, total:10` e `naoDisponivelDetalhe` com o JSON do detalhe; sem `not_available_detail` → `null`.

- [ ] **Step 2: Rodar e ver falhar** — `npm run test --workspace=apps/api -- src/services/mercadoLivre/estoqueFull.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar** `estoqueFull.ts`, no padrão de `pedidos.ts`:
  - Por conta: pular (log `status:'ok'`, mensagem "Conta X sem empresa vinculada") se não houver linha em `ml_conta_empresa`; checar `foiCancelado` antes de cada conta.
  - Coletar **tudo em memória** (ids → itens → inventários → estoque, consultando no máximo 5 `inventory_id` em paralelo) e só então, numa `withTransaction`, `DELETE FROM ml_estoque_full WHERE data_ref = ? AND user_id_ml = ?` + inserts. Falha na coleta propaga o erro (com `integracaoLog.detalhe` de erro) e **não** toca nas linhas existentes.
  - `data_ref = dataRefBrasilia(new Date())`.

- [ ] **Step 4: Registrar** no `integracaoRegistry.ts` e adicionar o job no `.do/app.yaml` (placeholders `ALTERAR-AQUI` mantidos).

- [ ] **Step 5: Rodar testes e typecheck** — `npm run test --workspace=apps/api -- src/services/mercadoLivre` e `npm run typecheck`. Expected: PASS, sem erro.

- [ ] **Step 6: Commit** — `Sincronizacao do estoque FULL do Mercado Livre a cada 2 horas`.

---

### Task 4: De-para conta ML → empresa (API + tela)

**Files:**
- Modify: `apps/api/src/routes/mercadoLivre.ts`
- Modify: `apps/portal/src/pages/integracao/MercadoLivrePage.tsx`

**Interfaces:**
- Produces: `GET /api/integracao/mercado-livre/contas` passa a devolver também `idEmpresa: number | null` por conta; `PUT /contas/:id/empresa` com body `{ idEmpresa: number | null }` (`podeEditar`), que faz upsert em `ml_conta_empresa` (ou apaga a linha quando `null`); `GET /empresas` (`podeVisualizar`) com `[{ idEmpresa, fantasia }]` de `sysemp_empresa`.

- [ ] **Step 1: Implementar** os três endpoints (SQL parametrizado; 404 se a conta não existe; 400 se `idEmpresa` não é inteiro nem `null`).
- [ ] **Step 2: Tela** — em cada conta conectada, um `<select>` "Empresa do ERP" que chama o `PUT`; mostrar aviso "sem empresa vinculada — esta conta não entra na sincronização do FULL" quando `null`.
- [ ] **Step 3: Verificar** — `npm run typecheck`; subir `npm run dev:api` e `npm run dev:portal`, vincular uma conta e recarregar a página: o vínculo persiste.
- [ ] **Step 4: Commit** — `Vinculo entre conta do Mercado Livre e empresa do ERP`.

---

### Task 5: Serviço e rota do comparativo

**Files:**
- Create: `apps/api/src/services/estoqueFullMl.ts`
- Create: `apps/api/src/routes/estoqueFullMl.ts`
- Modify: `apps/api/src/app.ts` (import + `app.use('/api/estoque/full-ml', estoqueFullMlRouter)`, junto dos outros de estoque)
- Test: `apps/api/src/services/estoqueFullMl.test.ts`

**Interfaces:**
- Produces em `estoqueFullMl.ts`:
  - `type SituacaoFull = 'OK' | 'DIVERGENTE' | 'SO_ML' | 'SO_SYSEMP'`
  - `interface SaldoMl { idEmpresa: number; sku: string; titulo: string; disponivel: number; total: number; naoDisponivel: number }`
  - `interface SaldoSysemp { idEmpresa: number; codigoAuxiliar: string | null; descricao: string | null; marca: string | null; saldo: number | null }`
  - `interface LinhaComparativoFull { idEmpresa: number; empresa: string; codigo: string; descricao: string; marca: string | null; qtdeMl: number; totalMl: number; naoDisponivelMl: number; qtdeSysemp: number; diferenca: number; situacao: SituacaoFull }`
  - `compararSaldosFull(ml: SaldoMl[], sysemp: SaldoSysemp[], nomesEmpresa: Map<number, string>): LinhaComparativoFull[]` — puro. Chave `(idEmpresa, sku normalizado)`, normalizado = `trim().toUpperCase()`; SKU vazio no ML gera linha própria `SO_ML` com `codigo: ''`; `codigoAuxiliar` nulo/vazio no SysEmp é ignorado; várias linhas da mesma chave são somadas; `saldo` nulo conta 0; `diferenca = qtdeMl - qtdeSysemp`; `SO_SYSEMP` só quando `qtdeSysemp !== 0` e não há ML; `OK` quando a diferença é 0. Ordenação: divergentes primeiro (maior |diferença| antes), depois por empresa e código.
  - `buscarComparativoFull(filtro: FiltroFullMl, escopo: EmpresaPermitida[]): Promise<{ linhas: LinhaComparativoFull[]; dataRef: string | null; atualizadoEm: string | null }>` onde `FiltroFullMl { data?: string; empresas?: number[]; marcas?: string[]; busca?: string; soDivergencias?: boolean }`; usa a última `data_ref` quando `data` não vem; restringe empresas pelo escopo com `condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', ...)` **nos dois lados** (ML via `ml_conta_empresa.id_empresa`); sem foto na data → `{ linhas: [], dataRef: <última disponível ou null>, atualizadoEm: null }`.
  - `buscarFiltrosFullMl(escopo)`: `{ empresas: OpcaoFiltro[]; marcas: OpcaoFiltro[]; datas: string[] }` (últimas 60 datas com foto).
- Rotas (`ROTA = '/estoque/full-ml'`, `authTenant`, `requirePermissao(ROTA, 'podeVisualizar')`): `GET /filtros`, `GET /` (devolve o objeto de `buscarComparativoFull`; paginação feita no front, o volume é de SKUs FULL), `GET /exportar` (Excel `estoque-full-ml.xlsx`, mesmas colunas da tela, números via `numeroXlsx`, escopo igual ao da tela — padrão de `routes/estoqueSaldos.ts`).

- [ ] **Step 1: Escrever os testes de `compararSaldosFull`** (nomes e asserções):
  - `iguais viram OK`: ML 5 / SysEmp 5 → `situacao 'OK'`, `diferenca 0`.
  - `diferente vira DIVERGENTE`: ML 8 / SysEmp 5 → `diferenca 3`; ML 2 / SysEmp 5 → `diferenca -3`.
  - `casa SKU ignorando espaço e caixa`: ML `' abc-1 '` x SysEmp `'ABC-1'` → uma linha só.
  - `SKU só no ML`: sem SysEmp → `SO_ML`, `qtdeSysemp 0`.
  - `SKU vazio no ML não casa com codigo_auxiliar vazio`: ML `''` e SysEmp `null` → `SO_ML` com `codigo ''`, e o SysEmp nulo não gera linha.
  - `só no SysEmp com saldo` → `SO_SYSEMP`; `só no SysEmp com saldo 0` → sem linha.
  - `soma duplicados do SysEmp`: dois produtos `ABC-1` (3 e 4) na empresa 7 → `qtdeSysemp 7`.
  - `saldo nulo conta zero`; `saldo SysEmp negativo` (−2 x ML 0) → `DIVERGENTE`, `diferenca 2`.
  - `empresas diferentes não se misturam`: mesmo SKU nas empresas 7 e 9 → 2 linhas.
  - `divergentes vêm primeiro`, ordenadas por |diferença| decrescente.

- [ ] **Step 2: Rodar e ver falhar** — `npm run test --workspace=apps/api -- src/services/estoqueFullMl.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar** `compararSaldosFull`.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando. Expected: PASS.
- [ ] **Step 5: Implementar** `buscarComparativoFull`, `buscarFiltrosFullMl` e as rotas (SysEmp lido de `sysemp_estoque_fisico ef JOIN sysemp_produto pr`, `ef.deleted = FALSE`; ML de `ml_estoque_full m JOIN ml_conta_empresa ce ON ce.ml_conta_id = (SELECT id FROM ml_conta WHERE user_id_ml = m.user_id_ml)`; filtros de marca/busca aplicados sobre o resultado já comparado, pois o lado "só ML" não tem marca).
- [ ] **Step 6: Typecheck** — `npm run typecheck`. Expected: sem erro.
- [ ] **Step 7: Commit** — `Comparativo de estoque FULL do Mercado Livre contra o SysEmp`.

---

### Task 6: Tela do relatório, seed e specs

**Files:**
- Create: `apps/portal/src/pages/estoque/FullMlPage.tsx` (modelo: `SaldosPage.tsx`)
- Modify: `apps/portal/src/App.tsx` (import + `<Route path="/estoque/full-ml" element={<FullMlPage />} />`)
- Create: `apps/api/db/042_estoque_full_ml_seed.sql` (mesmo molde de `026_estoque_saldos_seed.sql`; `nome_tela` = `'Estoque FULL ML x SysEmp'`, `rota_tela` = `'/estoque/full-ml'`, módulo `ESTOQUE`)
- Modify: `Specs/spec_modulo_integracao.md` (seção 4.3: tabelas novas, endpoints reais do ML confirmados no Task 2, entidade `ml_estoque_full`, job de 2 h), `Specs/spec_modulo_estoque.md` (nova seção da tela: regras de comparação e situações)

**Interfaces:**
- Consumes: rotas do Task 5.

- [ ] **Step 1: Tela** com: seletor de data (padrão a última), filtros de empresa/marca/busca, checkbox "só divergências", tabela paginada no front (50 por página) com as colunas de `LinhaComparativoFull`, destaque de cor por situação, texto "Atualizado em dd/mm/aaaa hh:mm" (`atualizadoEm`), botão Exportar Excel via `useApiDownload`, mensagem clara quando não há foto na data.
- [ ] **Step 2: Rota e seed** — rota em `App.tsx`; migration `042` só entra junto do deploy que já tem a rota.
- [ ] **Step 3: Specs** atualizados.
- [ ] **Step 4: Verificação ponta a ponta** — `npm run typecheck && npm run test --workspace=apps/api`; subir api e portal, conectar/vincular uma conta, disparar `ml_estoque_full` pelo Painel de Integração, abrir a tela (após marcar a permissão em Configurador → Perfis) e conferir 3 SKUs à mão contra o painel do ML e o SysEmp. Expected: testes verdes, valores batendo.
- [ ] **Step 5: Commit** — `Tela de comparativo de estoque FULL ML x SysEmp`.

---

## Autorrevisão

- Cobertura do spec: sincronização/registro/cron (Task 3), tabelas e `data_ref` (1–2), de-para (4), relatório com filtros, divergências, Excel, escopo e carimbo de hora (5–6), specs (6).
- Consistência de nomes: `InventarioItem`, `EstoqueFulfillmentMl`, `LinhaEstoqueFull`, `SaldoMl`/`SaldoSysemp`/`LinhaComparativoFull` usados igual entre tasks.
- Risco aberto: endpoints do ML (Task 2, passo 3) precisam de confirmação contra a API real antes de fechar o Task 3.
