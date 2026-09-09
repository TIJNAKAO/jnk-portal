# Pedido de Compra — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar Pedido de Compra da SysEmp via fila (`tipo_tabela=5`) e entregar o módulo Compras, com uma tela de consulta por pedido.

**Architecture:** Um consumidor de fila (`services/sysemp/entidades/pedidosCompra.ts`) grava cabeçalho + itens em duas tabelas novas, seguindo o molde de Nota Fiscal (cabeçalho e itens juntos no mesmo JSON, soft-delete revivendo só o que volta). O motor de fila genérico (`services/sysemp/fila.ts`) já existe e não muda. O módulo Compras é uma tela de consulta só de leitura sobre o cabeçalho, no mesmo molde de Saldo de Estoque: escopo por origem SysEmp, paginada, exportável.

**Tech Stack:** Node ≥ 20, TypeScript strict com `noUncheckedIndexedAccess`, Express 4 + `mysql2/promise`, exceljs, React 18 + Vite + Tailwind + react-router, vitest.

**Spec:** `Specs/spec_modulo_integracao.md` (seções 3.3, 4.2, 7) para a sincronização; `Specs/spec_modulo_compras.md` para o módulo e a tela. Leia as duas antes da Task 1.

## Global Constraints

- **Idioma:** código, comentários, mensagens de erro, UI e commits em **português**. Comentários de **migration** e assuntos de **commit** vão **sem acentos**; o resto do código usa acentuação normal.
- **ESM:** todo import de arquivo local leva extensão `.js`, mesmo apontando para um `.ts`.
- **`packages/shared` precisa estar compilado** (`npm run build:shared`) antes de api/portal.
- **Verificação real é `npm run typecheck`** na raiz.
- **`campo_id_detalhe` da fila é `id_compra`, mas o campo homônimo na resposta é `id_pedcompra`** — não confundir os dois nomes ao escrever a consulta de detalhe nem o mapeamento.
- **`id_fornecedor` do payload vira `id_parceiro_fornecedor`** na tabela, para bater com a convenção `id_parceiro_cliente`/`id_parceiro_vendedor` de `sysemp_pedido`.
- **Evento `acao='D'`** marca `deleted=true` no cabeçalho **e** em todos os itens daquele `id_pedcompra`. Num evento `I`/`U` normal, todo item leva soft-delete antes do upsert, revivendo só os que vêm na resposta atual.
- **Sem FK entre cabeçalho e item** — mesma razão de Nota Fiscal e Pedido de Venda: chegada fora de ordem entre janelas/páginas da fila.
- **Escopo por `condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', 'coluna')`** — a tabela é de uma origem só, sem coluna de origem. Escopo vazio gera `1 = 0`, falha fechada.
- **Exportação Excel usa `numeroXlsx()`** (`services/numeroXlsx.ts`, já existe) em todo campo monetário — sem isso o Excel mostra "número armazenado como texto".
- **Nenhuma migration concede permissão a ninguém**, nem a administrador. Liberar tela é passo manual em Configurador → Perfis.
- **Migrations são imutáveis depois de aplicadas.** Os números desta entrega são `033`, `034` e `035`; se algum já existir quando você chegar lá, use o próximo livre e ajuste as referências nos dois specs no mesmo commit.
- **Especificação é documento vivo:** divergência ou avanço em relação ao spec é atualizado nele **no mesmo commit**.

---

## Mapa de arquivos

**API — migrations (`apps/api/db/`)**

| Arquivo | Responsabilidade |
|---|---|
| `033_pedido_compra_schema.sql` | `sysemp_pedido_compra` + `sysemp_pedido_compra_item` |
| `034_pedido_compra_fila_seed.sql` | linha em `sysemp_fila_config` para `tipo_tabela=5` |
| `035_compras_modulo_seed.sql` | `modulos_sistema` + a tela `/compras/pedidos` em `telas_modulo` — **por último**, depois das rotas |

**API — serviços (`apps/api/src/services/`)**

| Arquivo | Responsabilidade |
|---|---|
| `sysemp/entidades/pedidosCompra.ts` | consumidor de fila: extrai payload, grava cabeçalho + itens |
| `comprasPedidos.ts` | consulta paginada/completa/filtros para a tela |

**API — rotas (`apps/api/src/routes/`)**: `comprasPedidos.ts` — monta em `/api/compras/pedidos`.

**Portal (`apps/portal/src/pages/compras/`)**: `PedidosPage.tsx`.

**Config**: `integracaoRegistry.ts` (registro), `.do/app.yaml` (job `cron-pedidos-compra`), `src/lib/icons.ts` (ícone `ShoppingCart`), `App.tsx` + `app.ts` (rota).

---

## Task 1: Esquema das duas tabelas

**Files:**
- Create: `apps/api/db/033_pedido_compra_schema.sql`

**Interfaces:**
- Consumes: nada.
- Produces: as tabelas `sysemp_pedido_compra` e `sysemp_pedido_compra_item`, usadas por todas as tarefas seguintes.

- [ ] **Step 1: Escrever a migration**

Crie `apps/api/db/033_pedido_compra_schema.sql`. Comentários **sem acentos**:

```sql
-- Pedido de Compra: cabecalho + itens, juntos no mesmo JSON de detalhe
-- (como Nota Fiscal). Nao confundir com NF Compra (tipo_tabela=3) - este
-- e o pedido em si, pode nao ter NF nenhuma emitida ainda.
-- Ver Specs/spec_modulo_integracao.md, secoes 3.3 e 4.2.
--
-- id_fornecedor do payload vira id_parceiro_fornecedor, pra bater com a
-- convencao de sysemp_pedido (id_parceiro_cliente/id_parceiro_vendedor).
--
-- Sem FK entre as duas tabelas, mesma razao de Pedido de Venda e Nota
-- Fiscal: chegada fora de ordem entre janelas/paginas da fila.

CREATE TABLE IF NOT EXISTS sysemp_pedido_compra (
    id_pedcompra              INT PRIMARY KEY, -- vem como "id_pedcompra"; a BUSCA usa "id_compra" (secao 3.3)
    id_empresa                INT NULL,
    id_parceiro_fornecedor    INT NULL, -- vem como "id_fornecedor"
    data_pedido               DATE NULL,
    data_prev_entrega         DATE NULL,
    valor_bruto               DECIMAL(14,4) NULL,
    valor_desconto            DECIMAL(14,4) NULL,
    valor_frete               DECIMAL(14,4) NULL,
    valor_ipi                 DECIMAL(14,4) NULL,
    valor_liquido_pedido      DECIMAL(14,4) NULL,
    total_geral               DECIMAL(14,4) NULL,
    comprador                 VARCHAR(150) NULL,
    observacao                VARCHAR(500) NULL,
    tipo_pedido               VARCHAR(30) NULL,
    codigo_status             VARCHAR(10) NULL,
    status_pedido             VARCHAR(60) NULL,
    status_entrega            VARCHAR(60) NULL,
    deleted     BOOLEAN DEFAULT FALSE,
    synced_at   DATETIME NOT NULL,
    criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_data_pedido (data_pedido),
    INDEX idx_id_empresa (id_empresa),
    INDEX idx_id_parceiro_fornecedor (id_parceiro_fornecedor),
    INDEX idx_status_pedido (status_pedido),
    INDEX idx_deleted (deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sysemp_pedido_compra_item (
    id_pedcompra              INT NOT NULL, -- liga a sysemp_pedido_compra.id_pedcompra (sem FK, ver acima)
    item                      INT NOT NULL, -- vem como "item"; chave composta com id_pedcompra, como Nota Fiscal
    id_produto                INT NULL,
    qtde_pedido               DECIMAL(14,4) NULL,
    qtde_pendente             DECIMAL(14,4) NULL,
    qtde_recebido             DECIMAL(14,4) NULL,
    desconto                  DECIMAL(14,4) NULL,
    total_bruto               DECIMAL(14,4) NULL,
    total_liquido             DECIMAL(14,4) NULL,
    valor_unitario_bruto      DECIMAL(14,4) NULL,
    valor_unitario_liquido    DECIMAL(14,4) NULL,
    aliquota_ipi              DECIMAL(9,4) NULL,
    aliquota_icms             DECIMAL(9,4) NULL,
    data_prev_entrega         DATE NULL,
    deleted     BOOLEAN DEFAULT FALSE,
    synced_at   DATETIME NOT NULL,
    PRIMARY KEY (id_pedcompra, item),
    INDEX idx_id_produto (id_produto),
    INDEX idx_deleted (deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

- [ ] **Step 2: Aplicar a migration**

```bash
npm run db:migrate
```

Esperado: a saída lista `033_pedido_compra_schema.sql` como aplicada.

- [ ] **Step 3: Conferir as duas tabelas**

```sql
SHOW TABLES LIKE 'sysemp_pedido_compra%';
```

Esperado: `sysemp_pedido_compra` e `sysemp_pedido_compra_item`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/db/033_pedido_compra_schema.sql
git commit -m "Pedido de Compra ganha as duas tabelas de sincronizacao"
```

---

## Task 2: Consumidor de fila

**Files:**
- Create: `apps/api/src/services/sysemp/entidades/pedidosCompra.ts`
- Create: `apps/api/src/services/sysemp/entidades/pedidosCompra.test.ts`

**Interfaces:**
- Consumes: `valor`, `inteiro`, `inteiroNaoZero`, `numeroSeguro` de `../dbUtil.js`; `registrarConsumidorFila` de `../fila.js` (assinatura: `{ tipoTabela: number; gravar: (connection, detalhe, acao, idRegistro) => Promise<void>; buscarDetalhe?: ... }`).
- Produces:
  - `interface CabecalhoPedidoCompra { idEmpresa; idParceiroFornecedor; dataPedido; dataPrevEntrega; valorBruto; valorDesconto; valorFrete; valorIpi; valorLiquidoPedido; totalGeral; comprador; observacao; tipoPedido; codigoStatus; statusPedido; statusEntrega }`
  - `interface ItemPedidoCompra { item; idProduto; qtdePedido; qtdePendente; qtdeRecebido; desconto; totalBruto; totalLiquido; valorUnitarioBruto; valorUnitarioLiquido; aliquotaIpi; aliquotaIcms; dataPrevEntrega }`
  - `function extrairCabecalhoPedidoCompra(payload: Record<string, unknown> | null): CabecalhoPedidoCompra | null`
  - `function extrairItensPedidoCompra(payload: Record<string, unknown> | null): ItemPedidoCompra[]`
  - `async function gravarPedidoCompra(connection, payload, acao, idRegistro): Promise<void>` (a task 3 não a usa diretamente — o motor de fila chama via registro)

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/api/src/services/sysemp/entidades/pedidosCompra.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { extrairCabecalhoPedidoCompra, extrairItensPedidoCompra } from './pedidosCompra.js';

/**
 * Payload real de /listarPedidosCompra (id_compra=294), conferido em
 * produção. Ver Specs/spec_modulo_integracao.md, seção 3.3: campo_id_detalhe
 * da BUSCA é "id_compra", mas o campo homônimo na RESPOSTA é "id_pedcompra"
 * — os dois nomes não são o mesmo texto.
 */
const PAYLOAD_REAL = {
  id_pedcompra: '294',
  codigo_status: '0',
  status_pedido: 'Pedido Liberado',
  id_empresa: '2',
  id_fornecedor: '715103',
  data_pedido: '2026-09-01',
  data_prev_entrega: null,
  valor_liquido_pedido: '2152839.2884',
  valor_desconto: '0.000000000000000000000000',
  valor_frete: '0.00000000',
  valor_ipi: '60707.65807100000000000000000000',
  valor_bruto: '2092131.63000000',
  total_geral: '2222435.3936',
  comprador: null,
  observacao: '',
  tipo_pedido: '0',
  status_entrega: 'RECEBIDO PARCIAL',
  itens: [
    {
      item: 1,
      desconto: 0,
      id_compra: 294,
      id_produto: 449,
      qtde_pedido: 14,
      total_bruto: 232.4,
      aliquota_ipi: 0,
      aliquota_icms: 0,
      qtde_pendente: 14,
      qtde_recebido: 0,
      total_liquido: 232.4,
      data_prev_entrega: null,
      valor_unitario_bruto: 16.6,
      valor_unitario_liquido: 16.6,
    },
    {
      item: 2,
      desconto: 0,
      id_compra: 294,
      id_produto: 1276,
      qtde_pedido: 19,
      total_bruto: 350.74,
      aliquota_ipi: 0,
      aliquota_icms: 0,
      qtde_pendente: 19,
      qtde_recebido: 0,
      total_liquido: 350.74,
      data_prev_entrega: null,
      valor_unitario_bruto: 18.46,
      valor_unitario_liquido: 18.46,
    },
  ],
};

describe('extrairCabecalhoPedidoCompra', () => {
  test('mapeia o payload real, incluindo o rename id_fornecedor -> idParceiroFornecedor', () => {
    const c = extrairCabecalhoPedidoCompra(PAYLOAD_REAL);

    expect(c).toEqual({
      idEmpresa: 2,
      idParceiroFornecedor: 715103,
      dataPedido: '2026-09-01',
      dataPrevEntrega: null,
      valorBruto: 2092131.63,
      valorDesconto: 0,
      valorFrete: 0,
      valorIpi: 60707.658071,
      valorLiquidoPedido: 2152839.2884,
      totalGeral: 2222435.3936,
      comprador: null,
      observacao: '',
      tipoPedido: '0',
      codigoStatus: '0',
      statusPedido: 'Pedido Liberado',
      statusEntrega: 'RECEBIDO PARCIAL',
    });
  });

  test('payload nulo devolve nulo', () => {
    expect(extrairCabecalhoPedidoCompra(null)).toBeNull();
  });

  test('comprador ausente vira null, nao string vazia', () => {
    const c = extrairCabecalhoPedidoCompra({ ...PAYLOAD_REAL, comprador: null });
    expect(c?.comprador).toBeNull();
  });

  test('data_prev_entrega nula continua nula', () => {
    const c = extrairCabecalhoPedidoCompra(PAYLOAD_REAL);
    expect(c?.dataPrevEntrega).toBeNull();
  });
});

describe('extrairItensPedidoCompra', () => {
  test('mapeia os dois itens do payload real', () => {
    const itens = extrairItensPedidoCompra(PAYLOAD_REAL);

    expect(itens).toHaveLength(2);
    expect(itens[0]).toEqual({
      item: 1,
      idProduto: 449,
      qtdePedido: 14,
      qtdePendente: 14,
      qtdeRecebido: 0,
      desconto: 0,
      totalBruto: 232.4,
      totalLiquido: 232.4,
      valorUnitarioBruto: 16.6,
      valorUnitarioLiquido: 16.6,
      aliquotaIpi: 0,
      aliquotaIcms: 0,
      dataPrevEntrega: null,
    });
  });

  test('payload nulo devolve lista vazia', () => {
    expect(extrairItensPedidoCompra(null)).toEqual([]);
  });

  test('payload sem itens devolve lista vazia', () => {
    expect(extrairItensPedidoCompra({ id_pedcompra: '1' })).toEqual([]);
  });

  test('item sem numero e ignorado, sem derrubar os demais', () => {
    const itens = extrairItensPedidoCompra({
      itens: [{ id_produto: 1 }, { item: 2, id_produto: 2 }],
    });

    expect(itens).toHaveLength(1);
    expect(itens[0]?.item).toBe(2);
  });

  test('quantidade zero e zero, nao null', () => {
    const itens = extrairItensPedidoCompra({
      itens: [{ item: 1, qtde_recebido: 0 }],
    });

    expect(itens[0]?.qtdeRecebido).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

```bash
npm run test --workspace=apps/api -- src/services/sysemp/entidades/pedidosCompra.test.ts
```

Esperado: FALHA — `pedidosCompra.ts` não existe.

- [ ] **Step 3: Escrever a implementação**

Crie `apps/api/src/services/sysemp/entidades/pedidosCompra.ts`:

```ts
import type { PoolConnection } from '../../../config/database.js';
import { inteiro, numeroSeguro, valor } from '../dbUtil.js';
import { registrarConsumidorFila } from '../fila.js';

/**
 * Consumidor de fila pra Pedido de Compra (tipo_tabela 5). Cabeçalho e
 * itens vêm juntos no mesmo JSON de `/listarPedidosCompra`, como Nota
 * Fiscal — sem a limitação de `/listarPedidos` (Pedido de Venda), que
 * exige janela de data.
 *
 * Não confundir com NF Compra (tipo_tabela 3, documento fiscal de
 * entrada) — este é o pedido em si, pode não ter NF nenhuma emitida
 * ainda. Ver Specs/spec_modulo_integracao.md, seção 3.3.
 *
 * `campo_id_detalhe` da busca é "id_compra", mas o campo homônimo na
 * resposta é "id_pedcompra" — os dois nomes não são o mesmo texto.
 * `id_fornecedor` do payload vira `idParceiroFornecedor`, pra bater com a
 * convenção de `sysemp_pedido`.
 */

export interface CabecalhoPedidoCompra {
  idEmpresa: number | null;
  idParceiroFornecedor: number | null;
  dataPedido: string | null;
  dataPrevEntrega: string | null;
  valorBruto: number | null;
  valorDesconto: number | null;
  valorFrete: number | null;
  valorIpi: number | null;
  valorLiquidoPedido: number | null;
  totalGeral: number | null;
  comprador: string | null;
  observacao: string | null;
  tipoPedido: string | null;
  codigoStatus: string | null;
  statusPedido: string | null;
  statusEntrega: string | null;
}

export interface ItemPedidoCompra {
  item: number;
  idProduto: number | null;
  qtdePedido: number | null;
  qtdePendente: number | null;
  qtdeRecebido: number | null;
  desconto: number | null;
  totalBruto: number | null;
  totalLiquido: number | null;
  valorUnitarioBruto: number | null;
  valorUnitarioLiquido: number | null;
  aliquotaIpi: number | null;
  aliquotaIcms: number | null;
  dataPrevEntrega: string | null;
}

interface PedidoCompraPayload {
  itens?: Record<string, unknown>[];
  [chave: string]: unknown;
}

export function extrairCabecalhoPedidoCompra(
  payload: Record<string, unknown> | null,
): CabecalhoPedidoCompra | null {
  if (!payload) return null;

  return {
    idEmpresa: inteiro(payload, 'id_empresa'),
    idParceiroFornecedor: inteiro(payload, 'id_fornecedor'),
    dataPedido: (valor(payload, 'data_pedido') as string | null) ?? null,
    dataPrevEntrega: (valor(payload, 'data_prev_entrega') as string | null) ?? null,
    valorBruto: numeroSeguro(payload, 'valor_bruto'),
    valorDesconto: numeroSeguro(payload, 'valor_desconto'),
    valorFrete: numeroSeguro(payload, 'valor_frete'),
    valorIpi: numeroSeguro(payload, 'valor_ipi'),
    valorLiquidoPedido: numeroSeguro(payload, 'valor_liquido_pedido'),
    totalGeral: numeroSeguro(payload, 'total_geral'),
    comprador: (valor(payload, 'comprador') as string | null) ?? null,
    observacao: (valor(payload, 'observacao') as string | null) ?? null,
    tipoPedido: (valor(payload, 'tipo_pedido') as string | null) ?? null,
    codigoStatus: (valor(payload, 'codigo_status') as string | null) ?? null,
    statusPedido: (valor(payload, 'status_pedido') as string | null) ?? null,
    statusEntrega: (valor(payload, 'status_entrega') as string | null) ?? null,
  };
}

export function extrairItensPedidoCompra(payload: Record<string, unknown> | null): ItemPedidoCompra[] {
  const itens = (payload as PedidoCompraPayload | null)?.itens ?? [];
  const validos: ItemPedidoCompra[] = [];

  for (const item of itens) {
    const numeroItem = inteiro(item, 'item');
    if (numeroItem === null) continue; // sem número de item, não há como formar a chave (id_pedcompra, item)

    validos.push({
      item: numeroItem,
      idProduto: inteiro(item, 'id_produto'),
      qtdePedido: numeroSeguro(item, 'qtde_pedido'),
      qtdePendente: numeroSeguro(item, 'qtde_pendente'),
      qtdeRecebido: numeroSeguro(item, 'qtde_recebido'),
      desconto: numeroSeguro(item, 'desconto'),
      totalBruto: numeroSeguro(item, 'total_bruto'),
      totalLiquido: numeroSeguro(item, 'total_liquido'),
      valorUnitarioBruto: numeroSeguro(item, 'valor_unitario_bruto'),
      valorUnitarioLiquido: numeroSeguro(item, 'valor_unitario_liquido'),
      aliquotaIpi: numeroSeguro(item, 'aliquota_ipi'),
      aliquotaIcms: numeroSeguro(item, 'aliquota_icms'),
      dataPrevEntrega: (valor(item, 'data_prev_entrega') as string | null) ?? null,
    });
  }

  return validos;
}

async function gravarPedidoCompra(
  connection: PoolConnection,
  payload: Record<string, unknown> | null,
  acao: 'I' | 'U' | 'D',
  idRegistro: number,
): Promise<void> {
  if (acao === 'D') {
    await connection.query('UPDATE sysemp_pedido_compra SET deleted = TRUE WHERE id_pedcompra = ?', [idRegistro]);
    await connection.query('UPDATE sysemp_pedido_compra_item SET deleted = TRUE WHERE id_pedcompra = ?', [
      idRegistro,
    ]);
    return;
  }

  const cabecalho = extrairCabecalhoPedidoCompra(payload);
  if (!cabecalho) return;

  await connection.query(
    `INSERT INTO sysemp_pedido_compra (
       id_pedcompra, id_empresa, id_parceiro_fornecedor, data_pedido, data_prev_entrega,
       valor_bruto, valor_desconto, valor_frete, valor_ipi, valor_liquido_pedido, total_geral,
       comprador, observacao, tipo_pedido, codigo_status, status_pedido, status_entrega,
       deleted, synced_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       id_empresa = VALUES(id_empresa), id_parceiro_fornecedor = VALUES(id_parceiro_fornecedor),
       data_pedido = VALUES(data_pedido), data_prev_entrega = VALUES(data_prev_entrega),
       valor_bruto = VALUES(valor_bruto), valor_desconto = VALUES(valor_desconto),
       valor_frete = VALUES(valor_frete), valor_ipi = VALUES(valor_ipi),
       valor_liquido_pedido = VALUES(valor_liquido_pedido), total_geral = VALUES(total_geral),
       comprador = VALUES(comprador), observacao = VALUES(observacao), tipo_pedido = VALUES(tipo_pedido),
       codigo_status = VALUES(codigo_status), status_pedido = VALUES(status_pedido),
       status_entrega = VALUES(status_entrega), deleted = FALSE, synced_at = CURRENT_TIMESTAMP`,
    [
      idRegistro,
      cabecalho.idEmpresa,
      cabecalho.idParceiroFornecedor,
      cabecalho.dataPedido,
      cabecalho.dataPrevEntrega,
      cabecalho.valorBruto,
      cabecalho.valorDesconto,
      cabecalho.valorFrete,
      cabecalho.valorIpi,
      cabecalho.valorLiquidoPedido,
      cabecalho.totalGeral,
      cabecalho.comprador,
      cabecalho.observacao,
      cabecalho.tipoPedido,
      cabecalho.codigoStatus,
      cabecalho.statusPedido,
      cabecalho.statusEntrega,
    ],
  );

  // Soft-delete de todos os itens antes do upsert, "revivendo" só os que
  // vêm na resposta atual — item que sumir fica deleted=true.
  await connection.query('UPDATE sysemp_pedido_compra_item SET deleted = TRUE WHERE id_pedcompra = ?', [idRegistro]);

  for (const item of extrairItensPedidoCompra(payload)) {
    await connection.query(
      `INSERT INTO sysemp_pedido_compra_item (
         id_pedcompra, item, id_produto, qtde_pedido, qtde_pendente, qtde_recebido, desconto,
         total_bruto, total_liquido, valor_unitario_bruto, valor_unitario_liquido,
         aliquota_ipi, aliquota_icms, data_prev_entrega, deleted, synced_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         id_produto = VALUES(id_produto), qtde_pedido = VALUES(qtde_pedido),
         qtde_pendente = VALUES(qtde_pendente), qtde_recebido = VALUES(qtde_recebido),
         desconto = VALUES(desconto), total_bruto = VALUES(total_bruto), total_liquido = VALUES(total_liquido),
         valor_unitario_bruto = VALUES(valor_unitario_bruto), valor_unitario_liquido = VALUES(valor_unitario_liquido),
         aliquota_ipi = VALUES(aliquota_ipi), aliquota_icms = VALUES(aliquota_icms),
         data_prev_entrega = VALUES(data_prev_entrega), deleted = FALSE, synced_at = CURRENT_TIMESTAMP`,
      [
        idRegistro,
        item.item,
        item.idProduto,
        item.qtdePedido,
        item.qtdePendente,
        item.qtdeRecebido,
        item.desconto,
        item.totalBruto,
        item.totalLiquido,
        item.valorUnitarioBruto,
        item.valorUnitarioLiquido,
        item.aliquotaIpi,
        item.aliquotaIcms,
        item.dataPrevEntrega,
      ],
    );
  }
}

registrarConsumidorFila({ tipoTabela: 5, gravar: gravarPedidoCompra });
```

- [ ] **Step 4: Rodar o teste para ver passar**

```bash
npm run test --workspace=apps/api -- src/services/sysemp/entidades/pedidosCompra.test.ts
```

Esperado: PASSA, 9 casos.

- [ ] **Step 5: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erro.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/sysemp/entidades/pedidosCompra.ts \
        apps/api/src/services/sysemp/entidades/pedidosCompra.test.ts
git commit -m "Pedido de Compra ganha consumidor de fila, cabecalho e itens juntos como Nota Fiscal"
```

---

## Task 3: Ligar a sincronização ao motor

**Files:**
- Create: `apps/api/db/034_pedido_compra_fila_seed.sql`
- Modify: `apps/api/src/services/integracaoRegistry.ts`
- Modify: `.do/app.yaml`

**Interfaces:**
- Consumes: `sincronizarFila` de `./sysemp/fila.js` (já existe); `registrarConsumidorFila` chamado pela Task 2 (side-effect do import).
- Produces: a chave `'pedidos_compra'` resolvível por `buscarEntidadeIntegracao('pedidos_compra')`, usada pelo Painel e pelo cron.

- [ ] **Step 1: Escrever o seed da config de fila**

Crie `apps/api/db/034_pedido_compra_fila_seed.sql`:

```sql
-- Config de fila para Pedido de Compra (tipo_tabela=5).
-- Ver Specs/spec_modulo_integracao.md, secao 3.3.
--
-- endpoint_detalhe usa o parametro "id_compra" na busca, mas o campo
-- homonimo na RESPOSTA e "id_pedcompra" - os dois nomes nao sao o mesmo
-- texto. O motor generico so precisa do nome do PARAMETRO de busca aqui.

INSERT IGNORE INTO sysemp_fila_config (chave, nome, tipo_tabela, endpoint_detalhe, campo_id_detalhe, limite_pagina, observacoes)
VALUES (
    'pedidos_compra',
    'Pedidos de Compra',
    5,
    '/listarPedidosCompra',
    'id_compra',
    50,
    'Cabecalho e itens vem juntos no mesmo JSON de detalhe, como Nota Fiscal. Nao confundir com NF Compra (tipo_tabela=3).'
);
```

- [ ] **Step 2: Registrar o consumidor no motor**

Em `apps/api/src/services/integracaoRegistry.ts`, acrescente o import de side-effect junto dos demais:

```ts
import './sysemp/entidades/pedidosCompra.js'; // side-effect: registra o consumidor de fila (tipo_tabela 5)
```

E a entrada no array `ENTIDADES_INTEGRACAO`, junto de `pedidos` (Pedido de Venda):

```ts
  { chave: 'pedidos_compra', nome: 'Pedidos de Compra', sincronizar: (idLog) => sincronizarFila('pedidos_compra', idLog) },
```

- [ ] **Step 3: Aplicar a migration e verificar via Painel**

```bash
npm run db:migrate
```

Esperado: `034_pedido_compra_fila_seed.sql` aplicada.

```bash
npm run typecheck
```

Esperado: sem erro.

- [ ] **Step 4: Acrescentar o job agendado**

Em `.do/app.yaml`, dentro da seção `jobs:`, acrescente (pode ir em qualquer
posição da lista — copie o bloco de outro `cron-*` para os valores de
`DB_*`/`PARAMETROS_ENCRYPTION_KEY`, que já estão preenchidos lá):

```yaml
  - name: cron-pedidos-compra
    kind: SCHEDULED
    github:
      repo: TIJNAKAO/jnk-portal
      branch: master
      deploy_on_push: true
    source_dir: /
    build_command: npm install && npm run build:shared
    run_command: npm run cron:sincronizar --workspace=apps/api -- pedidos_compra
    instance_size_slug: basic-xxs
    instance_count: 1
    schedule:
      cron: "50 * * * *"
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

- [ ] **Step 5: Validar o YAML**

```bash
node -e "
const yaml=require('js-yaml'), fs=require('fs');
const d=yaml.load(fs.readFileSync('.do/app.yaml','utf8'));
console.log('YAML valido');
console.log(d.jobs.find(j=>j.name==='cron-pedidos-compra').run_command);
"
```

Se `js-yaml` não estiver instalado, rode `npm i --no-save --silent js-yaml`
primeiro (mesma verificação usada no job `migrate` anteriormente).

Esperado: `YAML valido` e o `run_command` correto.

- [ ] **Step 6: Confirmar que o registro resolve a chave**

```bash
cd apps/api && cat > /tmp/verificar-registro.mjs <<'EOF'
import { buscarEntidadeIntegracao } from './src/services/integracaoRegistry.js';
const e = buscarEntidadeIntegracao('pedidos_compra');
console.log(e ? `encontrada: ${e.nome}` : 'NAO ENCONTRADA');
EOF
npx tsx /tmp/verificar-registro.mjs
rm /tmp/verificar-registro.mjs
cd ../..
```

Esperado: `encontrada: Pedidos de Compra`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/db/034_pedido_compra_fila_seed.sql \
        apps/api/src/services/integracaoRegistry.ts .do/app.yaml
git commit -m "Pedido de Compra passa a existir no motor de sincronizacao e no Painel"
```

---

## Task 4: Serviço de consulta

**Files:**
- Create: `apps/api/src/services/comprasPedidos.ts`
- Create: `apps/api/src/services/comprasPedidos.test.ts`

**Interfaces:**
- Consumes: `condicaoEscopoDeUmaOrigem`, `type EmpresaPermitida` de `./escopoEmpresas.js`.
- Produces:
  - `interface FiltroPedidosCompra { empresas?: number[]; fornecedores?: number[]; statusPedido?: string[]; statusEntrega?: string[]; dataInicio?: string; dataFim?: string }`
  - `interface LinhaPedidoCompra extends RowDataPacket { ... }`
  - `interface Ordenacao { coluna?: string; direcao: 'asc' | 'desc' }`
  - `function montarCondicoes(filtro: FiltroPedidosCompra, escopo: EmpresaPermitida[]): { where: string; params: unknown[] }`
  - `async function buscarPedidosCompraPaginados(filtro, escopo, pagina, tamanhoPagina, ordenacao): Promise<{ linhas: LinhaPedidoCompra[]; total: number }>`
  - `async function buscarPedidosCompraCompletos(filtro, escopo, ordenacao): Promise<LinhaPedidoCompra[]>`
  - `async function buscarFiltrosPedidosCompra(escopo: EmpresaPermitida[]): Promise<{ empresas: OpcaoFiltro[]; fornecedores: OpcaoFiltro[]; statusPedido: OpcaoFiltro[]; statusEntrega: OpcaoFiltro[] }>`
  - `interface OpcaoFiltro { valor: string; rotulo: string }`

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/api/src/services/comprasPedidos.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import type { EmpresaPermitida } from './escopoEmpresas.js';
import { montarCondicoes } from './comprasPedidos.js';

/**
 * Mesma fronteira de segurança das demais consultas sobre dado do ERP:
 * `sysemp_pedido_compra` é de uma origem só (SysEmp), sem coluna de
 * origem — ter a empresa 4 do KPL não pode liberar a 4 da SysEmp.
 */
const ESCOPO: EmpresaPermitida[] = [
  { origem: 'SYSEMP', cdFilial: 1 },
  { origem: 'SYSEMP', cdFilial: 4 },
  { origem: 'KPL', cdFilial: 7 },
];

describe('montarCondicoes', () => {
  test('nunca lista deletado, mesmo sem nenhum filtro', () => {
    expect(montarCondicoes({}, ESCOPO).where).toContain('pc.deleted = FALSE');
  });

  test('restringe às empresas SysEmp do usuário, ignorando as do KPL', () => {
    const { where, params } = montarCondicoes({}, ESCOPO);

    expect(where).toContain('pc.id_empresa IN (?,?)');
    expect(params).toEqual([1, 4]);
  });

  test('escopo vazio gera condição sempre falsa, não ausência de filtro', () => {
    const { where } = montarCondicoes({}, []);

    expect(where).toBe('pc.deleted = FALSE AND 1 = 0');
  });

  test('escopo só de KPL também falha fechado nesta tela', () => {
    expect(montarCondicoes({}, [{ origem: 'KPL', cdFilial: 1 }]).where).toContain('1 = 0');
  });

  test('empresa pedida na tela soma ao escopo, sem substituí-lo', () => {
    const { where, params } = montarCondicoes({ empresas: [9] }, ESCOPO);

    expect(where).toContain('pc.id_empresa IN (?,?)');
    expect(params).toEqual([1, 4, 9]);
  });

  test('filtro de fornecedor entra na condição', () => {
    const { where, params } = montarCondicoes({ fornecedores: [715103] }, ESCOPO);

    expect(where).toContain('pc.id_parceiro_fornecedor IN (?)');
    expect(params).toContain(715103);
  });

  test('filtro de status do pedido entra na condição', () => {
    const { where, params } = montarCondicoes({ statusPedido: ['Pedido Liberado'] }, ESCOPO);

    expect(where).toContain('pc.status_pedido IN (?)');
    expect(params).toContain('Pedido Liberado');
  });

  test('filtro de status da entrega entra na condição', () => {
    const { where, params } = montarCondicoes({ statusEntrega: ['RECEBIDO PARCIAL'] }, ESCOPO);

    expect(where).toContain('pc.status_entrega IN (?)');
    expect(params).toContain('RECEBIDO PARCIAL');
  });

  test('intervalo de data do pedido entra na condição', () => {
    const { where, params } = montarCondicoes({ dataInicio: '2026-09-01', dataFim: '2026-09-30' }, ESCOPO);

    expect(where).toContain('pc.data_pedido >= ?');
    expect(where).toContain('pc.data_pedido <= ?');
    expect(params).toEqual(expect.arrayContaining(['2026-09-01', '2026-09-30']));
  });

  test('só dataInicio filtra sem exigir dataFim', () => {
    const { where } = montarCondicoes({ dataInicio: '2026-09-01' }, ESCOPO);

    expect(where).toContain('pc.data_pedido >= ?');
    expect(where).not.toContain('pc.data_pedido <= ?');
  });
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

```bash
npm run test --workspace=apps/api -- src/services/comprasPedidos.test.ts
```

Esperado: FALHA — o arquivo não existe.

- [ ] **Step 3: Escrever o serviço**

Crie `apps/api/src/services/comprasPedidos.ts`:

```ts
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { condicaoEscopoDeUmaOrigem, type EmpresaPermitida } from './escopoEmpresas.js';

/**
 * Consulta de Pedidos de Compra sincronizados da SysEmp
 * (`sysemp_pedido_compra`, alimentada pela fila — ver
 * Specs/spec_modulo_integracao.md, seção 3.3).
 *
 * Uma linha por PEDIDO (cabeçalho), não por item — decisão da spec
 * (spec_modulo_compras.md, seção 2): visão geral de "quais pedidos estão
 * pendentes" é mais útil aqui do que uma grade item a item.
 *
 * Escopo por `condicaoEscopoDeUmaOrigem` com origem SYSEMP: a tabela é de
 * uma origem só e não tem coluna de origem, então ter a empresa 4 do KPL
 * não pode liberar a 4 da SysEmp, que é outra companhia.
 */

export interface FiltroPedidosCompra {
  empresas?: number[];
  fornecedores?: number[];
  statusPedido?: string[];
  statusEntrega?: string[];
  dataInicio?: string;
  dataFim?: string;
}

export interface LinhaPedidoCompra extends RowDataPacket {
  id_pedcompra: number;
  id_empresa: number | null;
  empresa: string | null;
  id_parceiro_fornecedor: number | null;
  fornecedor: string | null;
  data_pedido: string | null;
  data_prev_entrega: string | null;
  comprador: string | null;
  status_pedido: string | null;
  status_entrega: string | null;
  valor_bruto: number | null;
  valor_desconto: number | null;
  valor_ipi: number | null;
  valor_frete: number | null;
  total_geral: number | null;
}

export interface Ordenacao {
  coluna?: string;
  direcao: 'asc' | 'desc';
}

const COLUNAS_ORDENAVEIS: Record<string, string> = {
  empresa: 'e.fantasia',
  fornecedor: 'f.razao_social',
  data_pedido: 'pc.data_pedido',
  data_prev_entrega: 'pc.data_prev_entrega',
  status_pedido: 'pc.status_pedido',
  status_entrega: 'pc.status_entrega',
  total_geral: 'pc.total_geral',
};

const DE_JOINS = `
  FROM sysemp_pedido_compra pc
  LEFT JOIN sysemp_empresa e ON e.id_empresa = pc.id_empresa
  LEFT JOIN sysemp_parceiro f ON f.id_parceiro = pc.id_parceiro_fornecedor`;

/** Monta o WHERE completo: deletados fora, escopo (obrigatório) e filtros da tela. */
export function montarCondicoes(
  filtro: FiltroPedidosCompra,
  escopo: EmpresaPermitida[],
): { where: string; params: unknown[] } {
  const { where: escopoWhere, params } = condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', 'pc.id_empresa');
  const condicoes = ['pc.deleted = FALSE', escopoWhere];

  if (filtro.empresas?.length) {
    condicoes.push(`pc.id_empresa IN (${filtro.empresas.map(() => '?').join(',')})`);
    params.push(...filtro.empresas);
  }

  if (filtro.fornecedores?.length) {
    condicoes.push(`pc.id_parceiro_fornecedor IN (${filtro.fornecedores.map(() => '?').join(',')})`);
    params.push(...filtro.fornecedores);
  }

  if (filtro.statusPedido?.length) {
    condicoes.push(`pc.status_pedido IN (${filtro.statusPedido.map(() => '?').join(',')})`);
    params.push(...filtro.statusPedido);
  }

  if (filtro.statusEntrega?.length) {
    condicoes.push(`pc.status_entrega IN (${filtro.statusEntrega.map(() => '?').join(',')})`);
    params.push(...filtro.statusEntrega);
  }

  if (filtro.dataInicio) {
    condicoes.push('pc.data_pedido >= ?');
    params.push(filtro.dataInicio);
  }

  if (filtro.dataFim) {
    condicoes.push('pc.data_pedido <= ?');
    params.push(filtro.dataFim);
  }

  return { where: condicoes.join(' AND '), params };
}

const SELECT_COLUNAS = `
  SELECT
    pc.id_pedcompra, pc.id_empresa, e.fantasia AS empresa,
    pc.id_parceiro_fornecedor, f.razao_social AS fornecedor,
    pc.data_pedido, pc.data_prev_entrega, pc.comprador,
    pc.status_pedido, pc.status_entrega,
    pc.valor_bruto, pc.valor_desconto, pc.valor_ipi, pc.valor_frete, pc.total_geral`;

export async function buscarPedidosCompraPaginados(
  filtro: FiltroPedidosCompra,
  escopo: EmpresaPermitida[],
  pagina: number,
  tamanhoPagina: number,
  ordenacao: Ordenacao,
): Promise<{ linhas: LinhaPedidoCompra[]; total: number }> {
  const { where, params } = montarCondicoes(filtro, escopo);

  const [contagem] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total ${DE_JOINS} WHERE ${where}`, params);
  const total = Number(contagem[0]?.total ?? 0);
  if (total === 0) return { linhas: [], total: 0 };

  const coluna = COLUNAS_ORDENAVEIS[ordenacao.coluna ?? ''] ?? 'pc.data_pedido';
  const direcao = ordenacao.direcao === 'asc' ? 'ASC' : 'DESC';

  const [linhas] = await pool.query<LinhaPedidoCompra[]>(
    `${SELECT_COLUNAS} ${DE_JOINS} WHERE ${where}
     ORDER BY ${coluna} ${direcao}, pc.id_pedcompra
     LIMIT ? OFFSET ?`,
    [...params, tamanhoPagina, (pagina - 1) * tamanhoPagina],
  );

  return { linhas, total };
}

/** Acima disto o Excel fica pesado demais para gerar dentro de uma request. */
export const LIMITE_EXPORTACAO = 100_000;

/** Mesma consulta da tela, sem paginação — para a exportação em Excel. */
export async function buscarPedidosCompraCompletos(
  filtro: FiltroPedidosCompra,
  escopo: EmpresaPermitida[],
  ordenacao: Ordenacao,
): Promise<LinhaPedidoCompra[]> {
  const { linhas } = await buscarPedidosCompraPaginados(filtro, escopo, 1, LIMITE_EXPORTACAO, ordenacao);
  return linhas;
}

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

/** Opções dos seletores da tela, já restritas ao escopo. */
export async function buscarFiltrosPedidosCompra(escopo: EmpresaPermitida[]): Promise<{
  empresas: OpcaoFiltro[];
  fornecedores: OpcaoFiltro[];
  statusPedido: OpcaoFiltro[];
  statusEntrega: OpcaoFiltro[];
}> {
  const { where, params } = montarCondicoes({}, escopo);

  const [empresas] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT pc.id_empresa, e.fantasia ${DE_JOINS} WHERE ${where} ORDER BY e.fantasia`,
    params,
  );
  const [fornecedores] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT pc.id_parceiro_fornecedor, f.razao_social ${DE_JOINS}
      WHERE ${where} AND pc.id_parceiro_fornecedor IS NOT NULL ORDER BY f.razao_social`,
    params,
  );
  const [statusPedido] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT pc.status_pedido ${DE_JOINS}
      WHERE ${where} AND pc.status_pedido IS NOT NULL AND pc.status_pedido <> '' ORDER BY pc.status_pedido`,
    params,
  );
  const [statusEntrega] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT pc.status_entrega ${DE_JOINS}
      WHERE ${where} AND pc.status_entrega IS NOT NULL AND pc.status_entrega <> '' ORDER BY pc.status_entrega`,
    params,
  );

  return {
    empresas: empresas.map((e) => ({ valor: String(e.id_empresa), rotulo: String(e.fantasia ?? e.id_empresa).trim() })),
    fornecedores: fornecedores.map((f) => ({
      valor: String(f.id_parceiro_fornecedor),
      rotulo: String(f.razao_social ?? f.id_parceiro_fornecedor).trim(),
    })),
    statusPedido: statusPedido.map((s) => ({ valor: String(s.status_pedido), rotulo: String(s.status_pedido) })),
    statusEntrega: statusEntrega.map((s) => ({ valor: String(s.status_entrega), rotulo: String(s.status_entrega) })),
  };
}
```

- [ ] **Step 4: Rodar o teste para ver passar**

```bash
npm run test --workspace=apps/api -- src/services/comprasPedidos.test.ts
```

Esperado: PASSA, 10 casos.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/comprasPedidos.ts apps/api/src/services/comprasPedidos.test.ts
git commit -m "Consulta de Pedidos de Compra: filtros, paginacao e escopo por origem SysEmp"
```

---

## Task 5: Rota da consulta, com exportação Excel

**Files:**
- Create: `apps/api/src/routes/comprasPedidos.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: tudo da Task 4; `numeroXlsx` de `../services/numeroXlsx.js` (já existe); `buscarEmpresasPermitidas` de `../services/escopoEmpresas.js`.
- Produces: `const comprasPedidosRouter: Router`, montado em `/api/compras/pedidos`.

- [ ] **Step 1: Escrever a rota**

Crie `apps/api/src/routes/comprasPedidos.ts`:

```ts
import ExcelJS from 'exceljs';
import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import {
  buscarFiltrosPedidosCompra,
  buscarPedidosCompraCompletos,
  buscarPedidosCompraPaginados,
  type FiltroPedidosCompra,
  type Ordenacao,
} from '../services/comprasPedidos.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import { numeroXlsx } from '../services/numeroXlsx.js';

export const comprasPedidosRouter = Router();

const ROTA = '/compras/pedidos';

comprasPedidosRouter.use(authTenant);

function lista(valor: string | undefined): string[] | undefined {
  const itens = valor?.split(',').filter(Boolean);
  return itens?.length ? itens : undefined;
}

function extrairFiltros(query: Record<string, string | undefined>): FiltroPedidosCompra {
  const empresas = lista(query.empresas)
    ?.map(Number)
    .filter((n) => Number.isInteger(n));
  const fornecedores = lista(query.fornecedores)
    ?.map(Number)
    .filter((n) => Number.isInteger(n));

  return {
    empresas: empresas?.length ? empresas : undefined,
    fornecedores: fornecedores?.length ? fornecedores : undefined,
    statusPedido: lista(query.statusPedido),
    statusEntrega: lista(query.statusEntrega),
    dataInicio: query.dataInicio || undefined,
    dataFim: query.dataFim || undefined,
  };
}

function extrairOrdenacao(query: Record<string, string | undefined>): Ordenacao {
  return { coluna: query.ordenarPor, direcao: query.direcao === 'asc' ? 'asc' : 'desc' };
}

comprasPedidosRouter.get('/filtros', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  res.json(await buscarFiltrosPedidosCompra(await buscarEmpresasPermitidas(req.usuario!.id)));
});

comprasPedidosRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const pagina = Math.max(1, Number(query.pagina) || 1);
  const tamanhoPagina = Math.min(200, Math.max(1, Number(query.tamanhoPagina) || 50));

  const { linhas, total } = await buscarPedidosCompraPaginados(
    extrairFiltros(query),
    await buscarEmpresasPermitidas(req.usuario!.id),
    pagina,
    tamanhoPagina,
    extrairOrdenacao(query),
  );

  res.json({ linhas, total, pagina, tamanhoPagina });
});

comprasPedidosRouter.get('/exportar', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;

  // O escopo do usuário entra aqui igual à consulta da tela — a exportação
  // não é uma porta lateral que devolve o que a tela não mostraria.
  const linhas = await buscarPedidosCompraCompletos(
    extrairFiltros(query),
    await buscarEmpresasPermitidas(req.usuario!.id),
    extrairOrdenacao(query),
  );

  const valor = { width: 16, style: { numFmt: '#,##0.0000' } };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Pedidos de Compra');
  sheet.columns = [
    { header: 'PEDIDO', key: 'id_pedcompra', width: 12 },
    { header: 'EMPRESA', key: 'empresa', width: 40 },
    { header: 'FORNECEDOR', key: 'fornecedor', width: 45 },
    { header: 'DATA DO PEDIDO', key: 'data_pedido', width: 16 },
    { header: 'PREVISAO DE ENTREGA', key: 'data_prev_entrega', width: 18 },
    { header: 'COMPRADOR', key: 'comprador', width: 22 },
    { header: 'STATUS DO PEDIDO', key: 'status_pedido', width: 20 },
    { header: 'STATUS DA ENTREGA', key: 'status_entrega', width: 22 },
    { header: 'VALOR BRUTO', key: 'valor_bruto', ...valor },
    { header: 'DESCONTO', key: 'valor_desconto', ...valor },
    { header: 'IPI', key: 'valor_ipi', ...valor },
    { header: 'FRETE', key: 'valor_frete', ...valor },
    { header: 'TOTAL GERAL', key: 'total_geral', ...valor },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(
    linhas.map((l) => ({
      ...l,
      // DECIMAL do mysql2 chega como string — sem isso o Excel grava
      // texto, não número (ver numeroXlsx.ts).
      valor_bruto: numeroXlsx(l.valor_bruto),
      valor_desconto: numeroXlsx(l.valor_desconto),
      valor_ipi: numeroXlsx(l.valor_ipi),
      valor_frete: numeroXlsx(l.valor_frete),
      total_geral: numeroXlsx(l.total_geral),
    })),
  );

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="pedidos-compra.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});
```

- [ ] **Step 2: Montar a rota**

Em `apps/api/src/app.ts`, acrescente o import (ordem alfabética, como o
arquivo já mantém):

```ts
import { comprasPedidosRouter } from './routes/comprasPedidos.js';
```

E o `app.use`, antes do bloco de `/api/estoque/*` (ou em qualquer posição —
a ordem dos `app.use` não afeta roteamento, cada um tem prefixo próprio):

```ts
app.use('/api/compras/pedidos', comprasPedidosRouter);
```

- [ ] **Step 3: Verificar tipos e a suíte inteira**

```bash
npm run typecheck
npm run test --workspace=apps/api
```

Esperado: sem erro; suíte inteira passando.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/comprasPedidos.ts apps/api/src/app.ts
git commit -m "Rota de Pedidos de Compra ganha grade paginada e exportacao em xlsx"
```

---

## Task 6: Tela de consulta no portal

**Files:**
- Create: `apps/portal/src/pages/compras/PedidosPage.tsx`

**Interfaces:**
- Consumes: `useApi`, `useApiDownload` de `../../lib/useApi`; `GET /compras/pedidos/filtros`, `GET /compras/pedidos`, `GET /compras/pedidos/exportar` (Task 5).
- Produces: `function PedidosPage()`, consumida pelo `App.tsx` na Task 7.

- [ ] **Step 1: Escrever a página**

Crie `apps/portal/src/pages/compras/PedidosPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useApi, useApiDownload } from '../../lib/useApi';

interface LinhaPedido {
  id_pedcompra: number;
  empresa: string | null;
  fornecedor: string | null;
  data_pedido: string | null;
  data_prev_entrega: string | null;
  comprador: string | null;
  status_pedido: string | null;
  status_entrega: string | null;
  valor_bruto: number | null;
  valor_desconto: number | null;
  valor_ipi: number | null;
  valor_frete: number | null;
  total_geral: number | null;
}

interface Opcoes {
  empresas: { valor: string; rotulo: string }[];
  fornecedores: { valor: string; rotulo: string }[];
  statusPedido: { valor: string; rotulo: string }[];
  statusEntrega: { valor: string; rotulo: string }[];
}

const TAMANHO_PAGINA = 50;

function num(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function data(v: string | null): string {
  if (!v) return '—';
  // Data-sem-hora: le pelos getters UTC, sem passar pelo fuso do
  // navegador (mesma razao de formatarDataUtc em lib/datas.ts).
  const d = new Date(v);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

export function PedidosPage() {
  const api = useApi();
  const baixar = useApiDownload();

  const [opcoes, setOpcoes] = useState<Opcoes>({ empresas: [], fornecedores: [], statusPedido: [], statusEntrega: [] });
  const [empresa, setEmpresa] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [statusPedido, setStatusPedido] = useState('');
  const [statusEntrega, setStatusEntrega] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const [linhas, setLinhas] = useState<LinhaPedido[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<Opcoes>('/compras/pedidos/filtros')
      .then(setOpcoes)
      .catch((e: Error) => setErro(e.message));
  }, [api]);

  const queryFiltros = useCallback(() => {
    const params = new URLSearchParams();
    if (empresa) params.set('empresas', empresa);
    if (fornecedor) params.set('fornecedores', fornecedor);
    if (statusPedido) params.set('statusPedido', statusPedido);
    if (statusEntrega) params.set('statusEntrega', statusEntrega);
    if (dataInicio) params.set('dataInicio', dataInicio);
    if (dataFim) params.set('dataFim', dataFim);
    return params;
  }, [empresa, fornecedor, statusPedido, statusEntrega, dataInicio, dataFim]);

  const carregar = useCallback(
    async (paginaAlvo: number) => {
      setCarregando(true);
      setErro(null);
      try {
        const params = queryFiltros();
        params.set('pagina', String(paginaAlvo));
        params.set('tamanhoPagina', String(TAMANHO_PAGINA));

        const dados = await api<{ linhas: LinhaPedido[]; total: number }>(`/compras/pedidos?${params.toString()}`);
        setLinhas(dados.linhas);
        setTotal(dados.total);
        setPagina(paginaAlvo);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setCarregando(false);
      }
    },
    [api, queryFiltros],
  );

  useEffect(() => {
    carregar(1).catch(console.error);
  }, [carregar]);

  async function exportar() {
    setExportando(true);
    try {
      await baixar(`/compras/pedidos/exportar?${queryFiltros().toString()}`, { nomeArquivo: 'pedidos-compra.xlsx' });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setExportando(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Pedidos de Compra</h1>
          <p className="text-sm text-slate-500">Pedidos de compra sincronizados da SysEmp, um por linha.</p>
        </div>
        <button
          type="button"
          onClick={exportar}
          disabled={exportando || total === 0}
          className="min-h-[40px] shrink-0 rounded-lg bg-slate-900 px-4 text-sm text-white disabled:opacity-50"
        >
          {exportando ? 'Exportando…' : 'Exportar Excel'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Todas as empresas</option>
          {opcoes.empresas.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Todos os fornecedores</option>
          {opcoes.fornecedores.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <select value={statusPedido} onChange={(e) => setStatusPedido(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Status do pedido (todos)</option>
          {opcoes.statusPedido.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <select value={statusEntrega} onChange={(e) => setStatusEntrega(e.target.value)} className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm">
          <option value="">Status da entrega (todos)</option>
          {opcoes.statusEntrega.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={dataInicio}
          onChange={(e) => setDataInicio(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        />
        <span className="text-sm text-slate-500">até</span>
        <input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        />
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Pedido</th>
              <th className="px-3 py-2 font-medium">Empresa</th>
              <th className="px-3 py-2 font-medium">Fornecedor</th>
              <th className="px-3 py-2 font-medium">Data do pedido</th>
              <th className="px-3 py-2 font-medium">Previsão de entrega</th>
              <th className="px-3 py-2 font-medium">Comprador</th>
              <th className="px-3 py-2 font-medium">Status do pedido</th>
              <th className="px-3 py-2 font-medium">Status da entrega</th>
              <th className="px-3 py-2 text-right font-medium">Valor bruto</th>
              <th className="px-3 py-2 text-right font-medium">Desconto</th>
              <th className="px-3 py-2 text-right font-medium">IPI</th>
              <th className="px-3 py-2 text-right font-medium">Frete</th>
              <th className="px-3 py-2 text-right font-medium">Total geral</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-6 text-center text-slate-500">
                  {carregando ? 'Carregando…' : 'Nenhum pedido de compra encontrado.'}
                </td>
              </tr>
            )}
            {linhas.map((l) => (
              <tr key={l.id_pedcompra} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">{l.id_pedcompra}</td>
                <td className="px-3 py-2">{l.empresa ?? '—'}</td>
                <td className="px-3 py-2">{l.fornecedor ?? '—'}</td>
                <td className="px-3 py-2">{data(l.data_pedido)}</td>
                <td className="px-3 py-2">{data(l.data_prev_entrega)}</td>
                <td className="px-3 py-2">{l.comprador ?? '—'}</td>
                <td className="px-3 py-2">{l.status_pedido ?? '—'}</td>
                <td className="px-3 py-2">{l.status_entrega ?? '—'}</td>
                <td className="px-3 py-2 text-right">{num(l.valor_bruto)}</td>
                <td className="px-3 py-2 text-right">{num(l.valor_desconto)}</td>
                <td className="px-3 py-2 text-right">{num(l.valor_ipi)}</td>
                <td className="px-3 py-2 text-right">{num(l.valor_frete)}</td>
                <td className="px-3 py-2 text-right">{num(l.total_geral)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > TAMANHO_PAGINA && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Página {pagina} de {totalPaginas} · {total.toLocaleString('pt-BR')} pedidos
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => carregar(pagina - 1)}
              disabled={pagina <= 1 || carregando}
              className="min-h-[36px] rounded-lg border border-slate-300 px-3 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => carregar(pagina + 1)}
              disabled={pagina >= totalPaginas || carregando}
              className="min-h-[36px] rounded-lg border border-slate-300 px-3 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erro. A página ainda não está roteada — isso é a Task 7.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/src/pages/compras/PedidosPage.tsx
git commit -m "Portal ganha a tela de consulta de Pedidos de Compra"
```

---

## Task 7: Módulo Compras — ícone, rotas e visibilidade

Esta é a tarefa que faz o módulo existir de verdade. As três pontas — ícone,
rota no `App.tsx`/`app.ts` já feita na Task 5/6, e o seed do módulo — sobem
no mesmo commit: a linha em `telas_modulo` já aparece no menu, então só pode
ser seedada depois que a rota existir.

**Files:**
- Modify: `apps/portal/src/lib/icons.ts`
- Modify: `apps/portal/src/App.tsx`
- Create: `apps/api/db/035_compras_modulo_seed.sql`

**Interfaces:**
- Consumes: `PedidosPage` (Task 6).
- Produces: o módulo `COMPRAS` visível no Hub (depois de liberado em Perfis) com a tela `/compras/pedidos`.

- [ ] **Step 1: Registrar o ícone**

Em `apps/portal/src/lib/icons.ts`:

```ts
import { Boxes, Grid2x2, Laptop, Receipt, Settings, ShoppingCart, Workflow, type LucideIcon } from 'lucide-react';
```

E no mapa `ICONES`:

```ts
const ICONES: Record<string, LucideIcon> = {
  Settings,
  Laptop,
  Workflow,
  Boxes,
  Receipt,
  ShoppingCart,
};
```

- [ ] **Step 2: Acrescentar a rota no App.tsx**

Em `apps/portal/src/App.tsx`, junto dos demais imports (ordem alfabética
por caminho, como o arquivo já mantém):

```tsx
import { PedidosPage } from './pages/compras/PedidosPage';
```

E a rota, junto das demais `<Route>`:

```tsx
<Route path="/compras/pedidos" element={<PedidosPage />} />
```

- [ ] **Step 3: Escrever o seed do módulo**

Crie `apps/api/db/035_compras_modulo_seed.sql`:

```sql
-- Modulo Compras: Pedidos de Compra sincronizados da SysEmp.
-- Ver Specs/spec_modulo_compras.md.
--
-- A linha em telas_modulo ja aparece no menu, entao so pode ser seedada
-- depois que a rota existir no App.tsx e o router em app.ts - as duas
-- pontas sobem no mesmo commit/deploy.
--
-- Isto NAO concede permissao a ninguem, nem a administrador: a tela fica
-- invisivel ate alguem marca-la em Configurador -> Perfis -> Salvar.

INSERT IGNORE INTO modulos_sistema (nome, chave_modulo, icone, descricao)
VALUES ('Compras', 'COMPRAS', 'ShoppingCart', 'Pedidos de compra sincronizados da SysEmp.');

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Pedidos de Compra' AS nome_tela, '/compras/pedidos' AS rota_tela
) t ON m.chave_modulo = 'COMPRAS'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
```

- [ ] **Step 4: Aplicar e verificar**

```bash
npm run db:migrate
npm run typecheck
npm run test --workspace=apps/api
npm run test --workspace=apps/portal
```

Esperado: `035` aplicada; typecheck limpo; as duas suítes passando.

- [ ] **Step 5: Conferir a tela no portal**

Suba os dois processos, em terminais separados:

```bash
npm run dev:api
```

```bash
npm run dev:portal
```

Entre no portal, vá em **Configurador → Perfis**, marque **Ver** e **Criar**
na tela "Pedidos de Compra" (⚠️ marcar **Ver** é obrigatório para a tela
aparecer no menu — a query do menu exige `pode_visualizar = 1`) e **Salve**.
Confirme que o módulo Compras aparece no Hub e a tela carrega, mesmo vazia
(sem sincronização rodada ainda).

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/lib/icons.ts apps/portal/src/App.tsx apps/api/db/035_compras_modulo_seed.sql
git commit -m "Modulo Compras passa a existir no Hub, com a tela de Pedidos de Compra"
```

---

## Fechamento da entrega

- [ ] **Verificação final**

```bash
npm run build:shared
npm run typecheck
npm run test --workspace=apps/api
npm run test --workspace=apps/portal
npm run build
```

Esperado: os cinco comandos passam. Só afirme que a entrega está pronta
depois de ver a saída de todos — evidência antes de asserção.

- [ ] **Conferir o spec contra o que foi construído**

Releia `Specs/spec_modulo_integracao.md` (seções 3.3, 4.2, 7) e
`Specs/spec_modulo_compras.md`, comparando com o código. Onde a
implementação divergiu ou foi além, atualize o spec **agora**, num commit
próprio. Pontos que costumam divergir:

- números das migrations, se `033`–`035` já estavam ocupados;
- o horário `"50 * * * *"` do cron, se colidir com algo adicionado depois
  desta entrega;
- nomes de coluna, se o payload real de produção divergir do exemplo usado
  nesta entrega (mesmo risco que Nota Fiscal já teve — confira contra um
  pedido real assim que a sincronização rodar em produção).

- [ ] **Liberar a tela**

Configurador → Perfis → marcar "Pedidos de Compra" (Ver, e Criar se algum
fluxo de escrita for adicionado depois) → Salvar. Sem esse passo manual a
tela não existe para ninguém, nem para administrador.

- [ ] **Aplicar o App Spec no painel da DigitalOcean**

`.do/app.yaml` é template — editar o arquivo no repositório não muda o app
em produção. O job `cron-pedidos-compra` só passa a rodar de verdade depois
que alguém colar o bloco no App Spec do painel (Settings → Edit Your App
Spec), preenchendo os três `ALTERAR-AQUI` com os mesmos valores que os
outros jobs `cron-*` já usam.
