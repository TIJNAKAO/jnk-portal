# NF de Compra — Fase 2a — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a nota fiscal de compra da SysEmp (`tipo_tabela=3`) chegar ao portal pela fila que já existe.

**Architecture:** Nenhuma tabela e nenhum mapeamento novo. A NF de Compra usa o mesmo endpoint e o mesmo formato de JSON da NF de Venda, então o consumidor existente é registrado também sob o tipo 3 e grava na mesma `sysemp_nota_fiscal`, distinguida por `entrada_saida`. O trabalho é uma linha de configuração, uma linha de registro, uma entidade e um cron.

**Tech Stack:** MySQL 8, Express + mysql2/promise (ESM, imports com `.js`), Vitest, DigitalOcean App Platform (`doctl`).

**Spec:** `docs/superpowers/specs/2026-09-14-nf-compra-sincronizacao-fase2a-design.md`

## Global Constraints

- Código, comentários, commits e UI em **português**. Assunto de commit **sem acento**, focado no efeito.
- Migrations em `apps/api/db/NNN_*.sql`, **imutáveis depois de aplicadas**. A próxima livre é a **038**.
- O job `migrate` (`PRE_DEPLOY`) roda as migrations **sozinho no deploy**, com a versão antiga ainda servindo — toda migration precisa ser aditiva.
- `master` tem `deploy_on_push`: todo commit publicado vai a produção.
- Verificação real é `npm run typecheck` (TS strict + `noUncheckedIndexedAccess`). `npm run lint` não faz nada.
- Testes são de **função pura**, ao lado do código como `*.test.ts`. Não existe teste de integração com banco.
- Consumidor de fila se registra por **side-effect do import** em `integracaoRegistry.ts`. Um consumidor não importado ali simplesmente não existe em runtime.
- Credenciais de sistemas externos ficam em `parametros_sistema`, criptografadas — nunca em env var, nunca no código.
- **Não alterar** `gravarNotaFiscal` nem o mapeamento de campos da NF de Venda. A spec põe isso fora do escopo.

---

### Task 1: Configuração da fila

**Files:**
- Create: `apps/api/db/038_nf_compra_fila_seed.sql`

**Interfaces:**
- Consumes: nada.
- Produces: linha em `sysemp_fila_config` com `chave='notas_compra'` e `tipo_tabela=3`. A Task 2 depende de a `chave` ser exatamente `notas_compra`.

- [ ] **Step 1: Conferir que a 038 está livre**

Run: `ls apps/api/db/*.sql | tail -3`
Expected: a última é `037_compras_custo_entrada_seed.sql`

- [ ] **Step 2: Escrever a migration**

```sql
-- NF de Compra: passa a ser sincronizada pela fila (tipo_tabela=3).
-- Ver docs/superpowers/specs/2026-09-14-nf-compra-sincronizacao-fase2a-design.md
--
-- Ate aqui a fila trazia os tipos 0, 2, 4, 5, 6, 7 e 9 - o 3 nunca foi
-- pedido. Medido em producao em 14/09/2026: das 892 notas de entrada no
-- portal, apenas 2 tinham CFOP de compra. O resto e devolucao de venda, que
-- entra de carona pelo tipo_tabela=2.
--
-- Mesmos endpoints da NF de Venda de proposito: a SysEmp serve os dois pelo
-- /listarNotasFiscais, com o mesmo formato de JSON. Por isso o consumidor
-- tambem e o mesmo (services/sysemp/entidades/notasFiscais.ts), registrado
-- sob o tipo 3 - nao ha mapeamento novo, e duplicar aquele mapeamento seria
-- criar um segundo lugar para o mesmo bug que ja custou o bloco fiscal
-- inteiro entre 19 e 31/08/2026.
--
-- Grava na mesma sysemp_nota_fiscal, distinguida por entrada_saida. Nao ha
-- colisao de chave: id_nota_saida e sequencia unica na SysEmp - medido, as
-- notas de entrada vao de 2.861 a 203.215 e as de saida de 186 a 210.675.

INSERT IGNORE INTO sysemp_fila_config (chave, nome, tipo_tabela, endpoint_detalhe, campo_id_detalhe, limite_pagina, observacoes)
VALUES (
    'notas_compra',
    'Notas Fiscais de Compra',
    3,
    '/listarNotasFiscais',
    'id_nota_saida',
    500,
    'Mesmo endpoint e mesmo consumidor da NF de Venda (tipo_tabela=2); o que separa e entrada_saida. Nao confundir com Pedido de Compra (tipo_tabela=5).'
);
```

- [ ] **Step 3: Conferir a chave**

Run: `grep -c "'notas_compra'" apps/api/db/038_nf_compra_fila_seed.sql`
Expected: `1`

A `chave` tem que ser exatamente `notas_compra`: a Task 2 registra a entidade com essa string, e `sincronizarFila` usa ela para achar esta linha. Divergência de uma letra dá erro só em runtime.

- [ ] **Step 4: Commit**

```bash
git add apps/api/db/038_nf_compra_fila_seed.sql
git commit -m "Configura a fila para receber NF de Compra da SysEmp"
```

---

### Task 2: Consumidor e entidade

**Files:**
- Modify: `apps/api/src/services/sysemp/entidades/notasFiscais.ts` (última linha)
- Modify: `apps/api/src/services/integracaoRegistry.ts`
- Test: `apps/api/src/services/integracaoRegistry.test.ts`

**Interfaces:**
- Consumes: `gravarNotaFiscal` de `entidades/notasFiscais.js`; `registrarConsumidorFila` de `sysemp/fila.js`; `sincronizarFila(chave, idLog)`; a chave `notas_compra` da Task 1.
- Produces: entidade `notas_compra` no registro, acessível por `buscarEntidadeIntegracao('notas_compra')`.

- [ ] **Step 1: Escrever o teste que falha**

O teste fixa um contrato que atravessa dois arquivos de linguagens diferentes: a `chave` em TypeScript precisa casar com a `chave` gravada pela migration em SQL. Se divergirem, `sincronizarFila` não acha a configuração e falha só em runtime, no cron, de madrugada.

```ts
import { describe, expect, test } from 'vitest';
import { buscarEntidadeIntegracao } from './integracaoRegistry.js';

/**
 * A chave da entidade precisa ser identica a gravada em
 * sysemp_fila_config pela migration 038_nf_compra_fila_seed.sql.
 * sincronizarFila(chave) busca a configuracao por esse texto: divergencia
 * de uma letra so aparece em runtime, quando o cron roda.
 */
describe('entidade notas_compra', () => {
  test('esta registrada com a chave que a migration 038 grava', () => {
    const entidade = buscarEntidadeIntegracao('notas_compra');
    expect(entidade).toBeDefined();
    expect(entidade?.chave).toBe('notas_compra');
  });

  test('tem nome legivel, que e o que aparece no Painel de Integracao', () => {
    expect(buscarEntidadeIntegracao('notas_compra')?.nome).toBe('Notas Fiscais de Compra');
  });

  test('nao colide com a entidade de Pedido de Compra, que e outra coisa', () => {
    const compra = buscarEntidadeIntegracao('notas_compra');
    const pedido = buscarEntidadeIntegracao('pedidos_compra');
    expect(compra).toBeDefined();
    expect(pedido).toBeDefined();
    expect(compra?.chave).not.toBe(pedido?.chave);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test --workspace=apps/api -- src/services/integracaoRegistry.test.ts`
Expected: FAIL — `expected undefined to be defined`

- [ ] **Step 3: Registrar o consumidor sob o tipo 3**

Em `apps/api/src/services/sysemp/entidades/notasFiscais.ts`, a última linha hoje é:

```ts
registrarConsumidorFila({ tipoTabela: 2, gravar: gravarNotaFiscal });
```

Acrescente **logo abaixo**:

```ts
// NF de Compra (tipo 3): mesmo endpoint, mesmo formato de JSON e mesma
// tabela de destino da NF de Venda - o que separa as duas e entrada_saida.
// Por isso o consumidor e o MESMO, e nao uma copia: o mapeamento de ~46
// colunas deste arquivo foi conferido contra payload real, e duplica-lo
// seria criar um segundo lugar para o descompasso de nomes que ja custou o
// bloco fiscal inteiro entre 19 e 31/08/2026.
registrarConsumidorFila({ tipoTabela: 3, gravar: gravarNotaFiscal });
```

- [ ] **Step 4: Registrar a entidade**

Em `apps/api/src/services/integracaoRegistry.ts`, na lista de entidades, **logo abaixo** da linha de `notas_fiscais`:

```ts
  { chave: 'notas_compra', nome: 'Notas Fiscais de Compra', sincronizar: (idLog) => sincronizarFila('notas_compra', idLog) },
```

- [ ] **Step 5: Rodar o teste**

Run: `npm run test --workspace=apps/api -- src/services/integracaoRegistry.test.ts`
Expected: PASS, 3 testes

- [ ] **Step 6: Suíte completa e typecheck**

Run: `npm run test --workspace=apps/api`
Expected: todos passando, sem regressão

Run: `npm run typecheck`
Expected: sem saída de erro

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/sysemp/entidades/notasFiscais.ts apps/api/src/services/integracaoRegistry.ts apps/api/src/services/integracaoRegistry.test.ts
git commit -m "NF de Compra passa a ser consumida pelo motor de sincronizacao"
```

---

### Task 3: Job agendado no template

**Files:**
- Modify: `.do/app.yaml`

**Interfaces:**
- Consumes: a chave `notas_compra` da Task 2 (vai no `run_command`).
- Produces: bloco `cron-notas-compra` no template. A Task 4 aplica em produção.

- [ ] **Step 1: Escolher o minuto e conferir que está livre**

Run: `grep -E 'cron: ' .do/app.yaml | sort | uniq -c`

Hoje: `:00` tem um job, `:15` tem três, `:30` tem três, `:45` tem dois, `:50` tem um, mais dois diários às 6h. **`:20` está livre** — e importa, porque cada job abre pool de 10 conexões contra um cluster `db-s-1vcpu-1gb`.

- [ ] **Step 2: Acrescentar o job**

Copie o bloco `cron-pedidos-compra` inteiro (ele está no fim da lista de jobs), cole em seguida e altere **três** linhas — nome, comando e horário. Todo o bloco `envs` fica igual, com os `ALTERAR-AQUI` como estão: este arquivo é template, e segredo real só existe no painel da DO.

```yaml
  - name: cron-notas-compra
    kind: SCHEDULED
    github:
      repo: TIJNAKAO/jnk-portal
      branch: master
      deploy_on_push: true
    source_dir: /
    build_command: npm install && npm run build:shared
    run_command: npm run cron:sincronizar --workspace=apps/api -- notas_compra
    instance_size_slug: basic-xxs
    instance_count: 1
    schedule:
      cron: "20 * * * *"
      time_zone: America/Sao_Paulo
    envs:
      - key: DB_HOST
        value: ALTERAR-AQUI
      - key: DB_PORT
        value: "25060"
      - key: DB_USER
        value: doadmin
      - key: DB_PASSWORD
        type: SECRET
        value: ALTERAR-AQUI
      - key: DB_NAME
        value: jnk_portal_base
      - key: DB_CA_CERT
        type: SECRET
        value: ALTERAR-AQUI
      - key: PARAMETROS_ENCRYPTION_KEY
        type: SECRET
        value: ALTERAR-AQUI
```

Confira o bloco `envs` do `cron-pedidos-compra` no arquivo e replique-o exatamente; se ele tiver variável que não está acima, inclua também.

- [ ] **Step 3: Conferir que o YAML continua válido**

Não use `python -c "import yaml"`: **pyyaml não está instalado nesta máquina**, conferido. Use grep:

```bash
grep -c "^  - name: cron-" .do/app.yaml          # quantos jobs agendados
grep -n "cron-notas-compra" .do/app.yaml          # o bloco novo existe?
grep -A 12 "name: cron-notas-compra" .do/app.yaml | grep -E "run_command|cron:"
```
Expected: a contagem de `- name: cron-` subiu de 12 para 13; o bloco aparece; `run_command` termina em `notas_compra` e o `cron:` é `"20 * * * *"`.

Confira também a indentação: o bloco novo tem que começar na mesma coluna do `- name: cron-pedidos-compra`. YAML mal indentado só falha quando a DO recusa o spec, na Task 4.

- [ ] **Step 4: Commit**

```bash
git add .do/app.yaml
git commit -m "Template do App Spec ganha o cron da NF de Compra"
```

---

### Task 4: Aplicar em produção e conferir uma nota real

Esta task não produz código. É execução e validação, e é onde a spec põe o peso: o mecanismo é pequeno, o risco está no payload.

**Files:** nenhum.

- [ ] **Step 1: Publicar as tasks anteriores**

```bash
git push origin master
```

O `deploy_on_push` dispara o deploy, e o job `PRE_DEPLOY` aplica a migration 038.

- [ ] **Step 2: Esperar o deploy ficar ACTIVE**

```bash
APP=338d0727-ad64-4493-9af7-981e14f22b0b
until doctl apps list-deployments $APP --format Phase --no-header | head -1 | grep -qE "^ACTIVE|^ERROR|^CANCELED"; do sleep 25; done
doctl apps list-deployments $APP --format Phase,Cause --no-header | head -1
```
Expected: `ACTIVE`

- [ ] **Step 3: Guardar o App Spec atual, antes de alterar**

```bash
APP=338d0727-ad64-4493-9af7-981e14f22b0b
doctl apps get $APP -o json > /tmp/spec-antes.json
python -c "
import json; d=json.load(open('/tmp/spec-antes.json'))[0]
s=(d.get('active_deployment') or {}).get('spec') or d['spec']
json.dump(s, open('/tmp/spec-atual.json','w'), indent=2)
print('jobs hoje:', len(s['jobs']))
"
```

Este passo não é cerimônia: o próximo reescreve o App Spec inteiro, e sem a cópia não há como voltar.

- [ ] **Step 4: Acrescentar o job ao spec de produção**

Os segredos voltam da DO no formato `EV[1:...]`, que **pode ser reenviado** — copiar o bloco `envs` de um cron existente preserva senha e certificado sem nunca expô-los.

```bash
python -c "
import json, copy
s = json.load(open('/tmp/spec-atual.json'))
base = [j for j in s['jobs'] if j['name'] == 'cron-pedidos-compra'][0]
if any(j['name'] == 'cron-notas-compra' for j in s['jobs']):
    print('ja existe, nada a fazer')
else:
    novo = copy.deepcopy(base)
    novo['name'] = 'cron-notas-compra'
    novo['run_command'] = 'npm run cron:sincronizar --workspace=apps/api -- notas_compra'
    novo['schedule'] = {'cron': '20 * * * *', 'time_zone': 'America/Sao_Paulo'}
    s['jobs'].append(novo)
    json.dump(s, open('/tmp/spec-novo.json','w'), indent=2)
    print('jobs depois:', len(s['jobs']))
"
```

- [ ] **Step 5: Aplicar**

```bash
doctl apps update 338d0727-ad64-4493-9af7-981e14f22b0b --spec /tmp/spec-novo.json
```

Se falhar, o App Spec não mudou e `/tmp/spec-atual.json` é o estado bom. **Não tente de novo sem ler o erro** — um spec malformado aplicado derruba produção.

- [ ] **Step 6: Conferir que o job existe e que a API sobreviveu**

```bash
doctl apps get 338d0727-ad64-4493-9af7-981e14f22b0b -o json | python -c "
import json,sys
d=json.load(sys.stdin)[0]
s=(d.get('active_deployment') or {}).get('spec') or d['spec']
for j in s['jobs']:
    print(' ', j['name'], (j.get('schedule') or {}).get('cron','-'))
"
curl -sS -m 25 -w ' (http %{http_code})\n' https://portal.jnakao.com.br/api/health
```
Expected: `cron-notas-compra` com `20 * * * *`, e a API respondendo `{"status":"ok","database":"ok"}`

- [ ] **Step 7: Rodar a sincronização pela primeira vez**

Pelo portal: **Integração → Painel → Notas Fiscais de Compra → Sincronizar**. A entidade aparece lá porque está no registro.

Acompanhe pelo próprio Painel: ele mostra o log da execução, quantidade de registros e erro, se houver.

- [ ] **Step 8: Medir o que chegou**

```sql
SELECT COUNT(*) AS notas_de_compra
FROM sysemp_nota_fiscal
WHERE entrada_saida = 'E'
  AND (nota_cfop LIKE '1.1%' OR nota_cfop LIKE '2.1%' OR nota_cfop LIKE '3.1%');
```
Expected: mais que **2** (o número medido antes desta fase).

Se vier 0, **pare e reporte**: significa que a SysEmp não enfileirou nada do tipo 3, e a Fase 2b precisa saber disso antes de ser desenhada.

- [ ] **Step 9: Conferir uma nota real campo a campo**

Este é o passo que a spec chama de indispensável. O consumidor foi calibrado contra NF de **venda**; ninguém nunca viu o payload de uma NF de **compra**.

```sql
SELECT n.id_nota_saida, n.nota_numero, n.nota_cfop, n.id_cliente, n.valor_nota,
       i.item, i.id_produto, i.qtde, i.vr_total_bruto,
       i.valor_ipi, i.icms_st, i.valor_pis, i.valor_cofins, i.valor_icms,
       i.base_pis, i.base_cofins, i.item_cfop, i.cst, i.gera_financeiro
FROM sysemp_nota_fiscal n
JOIN sysemp_nota_fiscal_item i ON i.id_nota_saida = n.id_nota_saida
WHERE n.entrada_saida = 'E'
  AND (n.nota_cfop LIKE '1.1%' OR n.nota_cfop LIKE '2.1%')
ORDER BY n.id_nota_saida DESC
LIMIT 5;
```

Compare com a mesma nota na SysEmp. **O bloco fiscal é o que importa** — `valor_ipi`, `icms_st`, `valor_pis`, `valor_cofins`, `valor_icms`, `base_pis`, `base_cofins`, `item_cfop` — porque é exatamente ele que a Fase 2b consome para calcular o custo.

Três coisas para olhar com atenção, porque são onde compra difere de venda:
- **`id_cliente` guarda o fornecedor?** O nome da coluna vem da venda. Se o fornecedor chegar em outro campo, registre qual.
- **Algum valor fiscal veio zerado ou nulo** quando a nota na origem tem valor? É o sintoma do descompasso de nomes que já aconteceu neste consumidor.
- **Campo do payload que não tem coluna?** Anote; a decisão de criar coluna é da Fase 2b, que sabe do que precisa.

- [ ] **Step 10: Registrar o achado**

Acrescente à seção 5 da spec (`Riscos e pontos em aberto`) o que a conferência mostrou: quantas notas vieram, de qual período, se o fornecedor chega em `id_cliente`, e qualquer campo divergente.

```bash
git add docs/superpowers/specs/2026-09-14-nf-compra-sincronizacao-fase2a-design.md
git commit -m "Registra na spec o que a primeira sincronizacao de NF de Compra trouxe"
git push origin master
```

---

## Self-Review

**Cobertura da spec:**

| Seção da spec | Task |
|---|---|
| 3.1 Grava em `sysemp_nota_fiscal` | Task 1 (config) + Task 2 (consumidor) |
| 3.2 As quatro peças | Tasks 1, 2, 3 |
| 3.3 Conferir nota real campo a campo | Task 4, steps 9 e 10 |
| 6 Como validar | Task 4, steps 6 a 9 |

Sem lacunas. O que a spec exclui (cálculo, lacuna de mai–ago, tela) não tem task.

**Placeholders:** nenhum. Todo passo tem comando ou código real.

**Consistência:** a string `notas_compra` aparece em quatro lugares — migration (Task 1), registro e teste (Task 2), `run_command` do job (Tasks 3 e 4) — e é idêntica nos quatro. O teste da Task 2 existe justamente para prender esse contrato entre TypeScript e SQL.

**Limitação assumida:** não há teste unitário do consumidor. `notasFiscais.ts` exporta só `gravarNotaFiscal`, que escreve no banco; não há função pura para testar, e refatorá-lo está fora do escopo pela spec. Por isso o peso da validação recai sobre o step 9 da Task 4, a conferência campo a campo — e é por isso que a spec o trata como indispensável, e não como cerimônia.
