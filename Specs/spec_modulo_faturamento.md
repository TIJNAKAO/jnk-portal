# Especificação Técnica: Módulo Faturamento

## 0. Contexto

Adotando o conceito de HUB de Aplicativos, criar o aplicativo **Faturamento**
com duas telas: um **Dashboard** filtrável (empresa, marca, canal, datas) e um
**Relatório de Notas Fiscais** exportável para Excel, no grão de item de NF,
com apuração de impostos, taxa de marketplace, custo e margem.

O módulo consome o dado que o módulo Integração já sincroniza da SysEmp
(`Specs/spec_modulo_integracao.md`), que deixou explicitamente pendente o
"Relatório de Margem" (seção 6.7 daquele spec).

### 0.1. Diagnóstico do dado real (31/08/2026)

Antes de desenhar qualquer tela, o banco de produção foi consultado (somente
leitura). Os números abaixo fundamentam todas as decisões deste spec.

| Medida | Valor |
|---|---|
| Notas fiscais | 30.752 (29.903 saídas, 849 entradas) |
| Itens de NF | 34.813 |
| Período coberto | 12/01/2026 a 31/08/2026 |
| Volume corrente | ~6.000 itens/mês |
| Empresas | 9 (grupos JNK, NK2, CNK2) |
| Canais de venda | 19 (marketplaces + BALCAO) |
| Marcas | 262 (com padding de espaços — exige `TRIM`) |
| Notas canceladas | 819 (`status_nota = '101'`) |
| Devoluções | ~150/mês, `valor_nota` negativo |
| Histórico legado `bkpkpl_*` | 838.974 notas / 1.047.585 itens |

**Impostos efetivamente usados** (dos itens com bloco fiscal): PIS/COFINS
33.413 · ICMS 21.428 · DIFAL 15.411 · IPI 4.388 · FECP 440 · ICMS-ST 219.

**Cobertura de custo** sobre os itens vendidos: `custo_formacao` 77%,
`custo_medio` 64%. Nenhum dos dois cobre tudo.

**`etl_fatcom` está defasado** — 24.305 linhas, parando em 06/08. Por isso o
módulo lê direto de `sysemp_nota_fiscal` + `sysemp_nota_fiscal_item`, que são
a fonte viva e completa, e **não** da camada ETL.

### 0.2. A regressão fiscal encontrada

O diagnóstico revelou um bug de produção anterior a este módulo:

| Grupo | Itens | Emissão | `synced_at` | `id_nota_saida` |
|---|---|---|---|---|
| Com bloco fiscal | 33.492 | 12/01 → 19/08 | desde 29/07 | 186 → 109.157 |
| **Sem** bloco fiscal | 1.321 | 18/08 → 31/08 | desde **19/08 17:30** | 109.161 → 153.861 |

O corte coincide com o commit `dfee4df` (19/08/2026), que criou o consumidor
de fila atual. Esse consumidor gravava apenas 8 colunas do item e descartava
ICMS, ICMS-ST, DIFAL, IPI, PIS, COFINS, FECP, frete seller, comissão e valor
líquido — colunas que **já existiam** no schema e **já vinham** no payload da
SysEmp. Os 33.492 itens completos vieram da carga do projeto anterior.

**Causa raiz:** os nomes dos campos no payload não seguem o padrão das colunas
de destino, e a versão anterior foi escrita por inferência, sem validação
contra uma resposta real. A correção está na seção 2.

---

## 1. Decisões validadas

Decisões tomadas com o cliente, com a justificativa que as sustenta.

1. **Fonte de dados: tabelas `sysemp_nota_fiscal` e `sysemp_nota_fiscal_item`
   diretamente**, não `etl_fatcom` — a camada ETL está defasada e incompleta.
2. **A regressão fiscal é corrigida primeiro**, antes de qualquer tela. Sem
   isso o relatório nasceria correto até 19/08 e vazio dali em diante.
3. **Custo:** `custo_formacao` com fallback para `custo_medio`
   (`sysemp_estoque_fisico`, por produto **e** empresa). Cobre o máximo
   possível; quando não há custo, a margem sai **vazia**, nunca zero — zero
   seria lido como "margem nula" em vez de "custo desconhecido".
4. **Canceladas nunca entram**; devoluções ficam sob um filtro "Tipo de
   operação" (só saídas por padrão).
5. **Líquido e margem são calculados no portal**, com dedução explícita —
   não se usa o `vr_item_liq` da SysEmp (ver 3.2).
6. **Histórico legado fica de fora**, mas a camada de consulta é desenhada
   para aceitar uma segunda origem sem reescrita.
7. **Dashboard cobre:** KPIs + evolução mensal, ranking por canal e marca,
   análise de margem, e distribuição por UF.

---

## 2. Fase 1 — Correção da gravação de Notas Fiscais

**Status: implementada e aplicada em produção em 31/08/2026.**

### 2.1. Validação contra o payload real

Primeiro passo obrigatório, e exatamente o que faltou na versão anterior: três
NFs reais de produção foram consultadas via `/listarNotasFiscais` — uma de
balcão sem imposto, uma de marketplace interestadual com DIFAL, e uma de
marketplace com IPI.

Os nomes confirmados **não** seguem o padrão das colunas:

| Coluna de destino | Campo no payload |
|---|---|
| `valor_icms` | `valoricms` |
| `icms_st` | `icmsst` |
| `valor_ipi` / `valor_pis` / `valor_cofins` | `valoripi` / `valorpis` / `valorcofins` |
| `valor_comissao_ml` | `valorcomissaoml` (e `valor_comissao`) |
| `vr_item_liquido` | `vr_item_liq` |
| `v_fcp_uf_dest` / `v_icms_uf_dest` / `v_icms_uf_remet` / `v_fcp_st` | `vfcpufdest` / `vicmsufdest` / `vicmsufremet` / `vfcpst` |
| `data_cancelamento_nfe` | `datacancelamento_nfe` |
| `chave_nfe` / `protocolo_nfe` | `chavenfe` / `protocolonfe` |

Particularidades de formato tratadas: `gera_financeiro` chega como `"S"`/`"N"`
(coluna é `BOOLEAN`); datas de cancelamento chegam como
`"2026-08-30 22:41:55.99543"`, que `DATETIME` não aceita; ids sem vínculo
chegam como `0`/`"0"` em vez de nulo.

### 2.2. Alterações de schema — `016_nf_campos_fiscais.sql`

As colunas fiscais já existiam. Foram criadas apenas as que o payload traz e
não tinham destino:

- **Item:** `valor_unitario_liquido`, `quantidade_reservada`
- **Cabeçalho:** `tipo_documento`, `tipo_pedido`,
  `numero_pedido_marketplace`, `data_pedido`, `data_venda`, `data_entrega`,
  `mensagem_nota`
- **Índice:** `idx_canal_venda` — canal é o eixo principal do dashboard e não
  tinha índice

Aliases deliberadamente **não** duplicados em coluna nova (mesmo significado,
nome diferente no payload; resolvidos por `COALESCE` no consumidor):
`item.valor_comissao` → `valor_comissao_ml`; `item.valor_frete` → `vr_frete`;
`valor_total_nota` → `valor_nota`; `codigo_empresa`/`codigo_cliente`/
`codigo_vendedor`/`codigo_transportadora` → seus respectivos `id_*`.

### 2.3. Reescrita do consumidor

`apps/api/src/services/sysemp/entidades/notasFiscais.ts` passa a persistir o
payload inteiro: **46 colunas no item** e **62 no cabeçalho**.

O `INSERT ... ON DUPLICATE KEY UPDATE` é montado a partir de um mapa
coluna→valor (`montarUpsert`), em vez de duas listas SQL escritas à mão. Foi
justamente o descompasso entre essas duas listas que permitiu ao bug anterior
passar despercebido: agora elas não podem divergir.

Helpers acrescentados em `dbUtil.ts`: `simNao` (`"S"`/`"N"` → boolean),
`dataHoraSysemp` (normaliza fração de segundo e timezone) e `inteiroNaoZero`
(trata `0` como ausência de vínculo).

### 2.4. Backfill

`apps/api/src/scripts/backfillNotasFiscais.ts` (`npm run backfill:nf`)
rebusca e regrava as notas afetadas. Não passa pela fila de propósito: os
eventos dessas notas já foram consumidos e confirmados na SysEmp, então não
voltariam sozinhos.

Critério de seleção: `valor_icms IS NULL`. Distingue com precisão o que a
versão antiga não gravou (`NULL`) de imposto zero legítimo (`0.0000`) — uma
nota de balcão com ICMS zero tem a coluna preenchida com zero, não nula.

É idempotente e aceita `--dry-run` e `--limite N`.

---

## 3. Fase 2 — Camada de consulta

`apps/api/src/services/faturamento.ts`. Uma consulta base única, compartilhada
pelas duas telas, unindo cabeçalho + item + empresa + parceiro + produto +
custo.

### 3.1. Filtros e regras fixas

**Filtros:** empresas, marcas (com `TRIM`), canais, período, tipo de operação,
e "gera financeiro".

**Regras sempre aplicadas:**
- Exclui canceladas: `status_nota = '101'` **ou** `data_cancelamento_nfe`
  preenchida. A segunda condição é a confiável — `status_nota` fica vazio em
  7.602 notas.
- Exclui `deleted = TRUE` em cabeçalho e item.
- Padrão `entrada_saida = 'S'`; devoluções entram só via filtro.

**Custo:** `COALESCE(NULLIF(custo_formacao,0), NULLIF(custo_medio,0))`,
casado por `id_produto` **e** `id_empresa`.

**Comissão e frete seller:** usa o valor por item (`valor_comissao_ml`,
`frete_seller`); quando ausente, rateia o valor do cabeçalho
proporcionalmente a `vr_total_bruto / total_produtos`. Como 93% das notas têm
um único item, o rateio raramente entra em ação.

### 3.2. Fórmulas

```
LÍQUIDO  = Vlr Total Mercadoria − ICMS − ICMS ST − IPI − PIS − COFINS − DIFAL
                                − Comissão Marketplace − Frete Seller
MARGEM   = LÍQUIDO − (Custo Unitário × Qtde)
% MARGEM = MARGEM ÷ Vlr Total Mercadoria
```

`MARGEM` e `% MARGEM` ficam **nulas** quando não há custo para o item.

> **Não usar `vr_item_liq` como valor líquido.** A sonda de payload provou que
> ele é base de ICMS, não receita líquida:
> ```
> NF 124992: 727,95 − 37,00 (desconto) + 8,00 (frete)              = 698,95
> NF 114165: 166,67 − 12,22 (desconto) + 23,99 (frete) + 9,28 (IPI) = 187,72
> ```
> Ou seja, `mercadoria − desconto + frete + IPI`. Usá-lo como líquido
> comercial produziria margem errada para mais.

### 3.3. Preparação para o legado

A consulta base fica atrás de uma função que recebe a origem dos dados. Hoje
existe só `'SYSEMP'`; acrescentar `'KPL'` (as tabelas `bkpkpl_*`) no futuro é
somar um segundo `SELECT` na união, sem tocar em rota nem em tela.

---

## 4. Fase 3 — Relatório de Notas Fiscais

**Rota:** `/faturamento/notas-fiscais` · **API:** `/api/faturamento/notas-fiscais`

Três endpoints, no mesmo padrão de `estoqueCurvaAbc`: `/filtros`, `/`
(paginado) e `/exportar` (ExcelJS).

### 4.1. Colunas

Empresa · Data do faturamento · Número da NF · Série · Nome do cliente · UF do
cliente · Código do produto · Descrição do produto · **Marca** · **Canal** ·
Quantidade · Valor unitário · Valor total mercadoria · Valor ICMS · Valor ICMS
ST · Valor IPI · Valor PIS · Valor COFINS · Valor DIFAL · **Valor FECP** ·
Valor Total da NF · Valor Frete Seller · Valor da Taxa do Marketplace ·
Valor líquido · Custo unitário · Margem · % da margem.

`Marca` e `Canal` foram acrescentados por serem filtros do relatório — sem
eles quem recebe a planilha não consegue reagrupar. `FECP` vem da versão
anterior deste spec.

### 4.2. Performance

~6.000 itens/mês, ~72.000 no ano. Export síncrono é adequado; acima de 100.000
linhas a tela avisa antes de gerar.

---

## 5. Fase 4 — Dashboard

**Rota:** `/faturamento/dashboard` · **API:** `/api/faturamento/dashboard`

Um único endpoint devolve todas as agregações sobre os mesmos filtros, para
evitar seis idas ao servidor.

- **KPIs:** faturamento bruto, devoluções, líquido, qtde de NFs, ticket médio,
  margem %, e **cobertura de custo** — o percentual de itens sobre os quais a
  margem foi calculável. Indicador de honestidade do próprio painel.
- **Evolução mensal** de faturamento e margem.
- **Ranking por canal e por marca.**
- **Análise de margem:** margem % por canal e marca, melhores e piores
  produtos.
- **Distribuição por UF** — relevante porque 15.411 itens têm DIFAL, ou seja,
  operação interestadual é parte grande do negócio.

Gráficos com **Recharts**, seguindo a skill `dataviz`.

---

## 6. Fase 5 — Integração ao portal

- Migration de seed: módulo `FATURAMENTO` em `modulos_sistema` (ícone
  `Receipt`) e as duas telas em `telas_modulo`, no formato de
  `013_estoque_seed.sql`.
- Rotas em `apps/portal/src/App.tsx`; routers em `apps/api/src/app.ts`.
- Permissões não exigem código novo: `requirePermissao` já resolve por rota.

---

## 7. Testes

O repositório não tem infraestrutura de teste. Este módulo introduz
**Vitest** cobrindo apenas a camada de cálculo — fórmulas de líquido e margem,
rateio de comissão, fallback de custo e exclusão de canceladas. Não cobre UI
nem banco.

A justificativa é o próprio histórico: a regressão da seção 0.2 passou dez
dias em produção sem ninguém perceber, porque nada verificava o resultado da
gravação. Cálculo de margem errado é igualmente silencioso — chega errado numa
reunião, não num log de erro.

---

## 8. Pendências conhecidas

1. **`etl_fatcom` continua defasado.** Este módulo não depende mais dele, mas
   ele segue alimentando o registro de integrações e para eventual consumo
   externo (Excel/Power BI). Decidir se é atualizado, corrigido ou aposentado.
2. **Cobertura de custo de 77%.** Um quarto dos itens vendidos sai sem margem.
   Melhorar isso depende da SysEmp, não do portal.
3. **7.602 notas sem `status_nota`.** O filtro de canceladas usa
   `data_cancelamento_nfe` como sinal principal justamente por isso, mas vale
   entender por que o status vem vazio.
