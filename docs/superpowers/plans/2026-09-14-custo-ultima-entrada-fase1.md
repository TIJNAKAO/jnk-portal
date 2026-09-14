# Custo da Última Entrada — Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer as 742.830 linhas de custo de última entrada do SQL Server para o portal e dar uma tela de consulta, sem implementar cálculo novo.

**Architecture:** Uma tabela `compras_custo_ultima_entrada` no MySQL; um script de uso único que lê um CSV exportado por `bcp` e grava em lotes; um service + rota de consulta paginada; uma tela em Compras. As conversões (período, decimal, data) ficam em funções puras testadas; o que toca banco é verificado manualmente, como todo o resto do projeto.

**Tech Stack:** MySQL 8, Express + mysql2/promise (ESM, imports com `.js`), React 18 + Vite + Tailwind, Vitest, `bcp`/`sqlcmd` (já instalados na máquina).

**Spec:** `docs/superpowers/specs/2026-09-14-custo-ultima-entrada-fase1-design.md`

## Global Constraints

- Código, comentários, commits e UI em **português**. Assunto de commit sem acento, focado no efeito.
- Migrations são **imutáveis depois de aplicadas**; corrigir significa criar a próxima. A próxima livre é a **036**.
- O job `migrate` (`PRE_DEPLOY`) roda as migrations **sozinho no deploy**. Toda migration precisa ser aditiva e compatível com o código anterior, porque roda com a versão antiga ainda servindo.
- Banco guarda `DATETIME` no relógio de **Brasília** (`-03:00`). Data pura calculada em código usa `Date.UTC` e getters `getUTC*`.
- `npm run lint` não faz nada. A verificação real é `npm run typecheck` (TS strict + `noUncheckedIndexedAccess`).
- Todo teste do projeto é de **função pura**, ao lado do código como `*.test.ts`. Não existe teste de integração com banco — não invente um.
- Seedar `telas_modulo` **não concede permissão a ninguém**. A linha só pode ser seedada depois que a rota existir no `App.tsx` e o router no `app.ts` — as duas pontas no mesmo commit.
- Nenhuma dependência npm nova. `bcp` e `sqlcmd` já existem na máquina.
- Credenciais do SQL Server ficam em `.env.sqlserver` na raiz (coberto por `.gitignore`). **Nunca** commitar, nunca imprimir em log.

---

### Task 1: Migration da tabela

**Files:**
- Create: `apps/api/db/036_compras_custo_ultima_entrada.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabela `compras_custo_ultima_entrada` com chave única `uq_custo_periodo_origem_empresa_produto (periodo, origem, empresa, cd_produto)`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Custo da ultima entrada por periodo: porte da RDW.dbo.KPL_ULT_COMPRA.
-- Ver docs/superpowers/specs/2026-09-14-custo-ultima-entrada-fase1-design.md
--
-- DECIMAL e nao FLOAT: o original usa FLOAT em valor monetario, que e
-- binario e nao representa 0,01 exatamente. Em custo que vira margem o
-- erro acumula. Totais em DECIMAL(14,4); unitarios em DECIMAL(18,6),
-- porque vu_custo e resultado de divisao pela quantidade.
--
-- SEM FK para sysemp_produto ou sysemp_empresa, de proposito, pelo mesmo
-- motivo da 029: linha historica de 2017 cujo produto nao existe mais no
-- cadastro tem que entrar do mesmo jeito, marcada com
-- produto_encontrado = FALSE. Uma FK proibiria a gravacao.
--
-- A chave unica usa o TEXTO (empresa, cd_produto) e nao os ids porque
-- id_produto pode ser NULL, e NULL nao deduplica em chave unica do MySQL.
--
-- origem entra na chave por razao operacional: o recalculo da Fase 2
-- apaga e regrava so as linhas que ele mesmo produz. O historico
-- importado (origem='SQLSERVER') fica congelado e nunca e tocado.

CREATE TABLE IF NOT EXISTS compras_custo_ultima_entrada (
    id                  INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    periodo             DATE NOT NULL,
    origem              VARCHAR(20) NOT NULL,
    empresa             VARCHAR(10) NOT NULL,
    id_empresa          INT NULL,
    empresa_encontrada  BOOLEAN NOT NULL DEFAULT TRUE,
    cd_produto          VARCHAR(50) NOT NULL,
    id_produto          INT NULL,
    produto_encontrado  BOOLEAN NOT NULL DEFAULT TRUE,
    descricao_produto   VARCHAR(200) NULL,
    marca               VARCHAR(200) NULL,
    ncm                 VARCHAR(10)  NULL,
    dt_movto            DATE NULL,
    dt_emissao          DATE NULL,
    documento           VARCHAR(30) NULL,
    serie               VARCHAR(10) NULL,
    cd_clifor           VARCHAR(100) NULL,
    dc_clifor           VARCHAR(100) NULL,
    mun_clifor          VARCHAR(100) NULL,
    uf_clifor           VARCHAR(2)   NULL,
    qtde                DECIMAL(14,4) NULL,
    vu_merc             DECIMAL(18,6) NULL,
    aliq_icms           DECIMAL(9,4)  NULL,
    aliq_red_icms       DECIMAL(9,4)  NULL,
    vb_icms             DECIMAL(14,4) NULL,
    vt_icms             DECIMAL(14,4) NULL,
    vt_icms_st          DECIMAL(14,4) NULL,
    vt_st_gnre          DECIMAL(14,4) NULL,
    aliq_ipi            DECIMAL(9,4)  NULL,
    vb_ipi              DECIMAL(14,4) NULL,
    vt_ipi              DECIMAL(14,4) NULL,
    aliq_pis            DECIMAL(9,4)  NULL,
    vb_pis              DECIMAL(14,4) NULL,
    vt_pis              DECIMAL(14,4) NULL,
    aliq_cofins         DECIMAL(9,4)  NULL,
    vb_cofins           DECIMAL(14,4) NULL,
    vt_cofins           DECIMAL(14,4) NULL,
    vt_nf               DECIMAL(14,4) NULL,
    vt_custo            DECIMAL(14,4) NULL,
    vu_custo            DECIMAL(18,6) NULL,
    vt_fob_euro         DECIMAL(14,4) NULL,
    cst                 VARCHAR(10) NULL,
    id_nota             INT NULL,
    item_nota           INT NULL,
    calculado_em        DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_custo_periodo_origem_empresa_produto (periodo, origem, empresa, cd_produto),
    INDEX idx_custo_periodo_empresa (periodo, id_empresa),
    INDEX idx_custo_produto (id_produto),
    INDEX idx_custo_origem (origem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

- [ ] **Step 2: Conferir o tamanho da chave única**

A chave soma `DATE`(3) + `origem`(20×4) + `empresa`(10×4) + `cd_produto`(50×4) = 323 bytes, bem abaixo do limite de 3072 bytes do InnoDB com `utf8mb4`. Não precisa de prefixo.

Run: `grep -c "UNIQUE KEY uq_custo_periodo_origem_empresa_produto" apps/api/db/036_compras_custo_ultima_entrada.sql`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add apps/api/db/036_compras_custo_ultima_entrada.sql
git commit -m "Cria tabela do custo de ultima entrada do modulo Compras"
```

---

### Task 2: Conversores do legado (TDD)

Funções puras que traduzem o formato do SQL Server para o do portal. São a única parte da carga que dá para testar sem banco, e concentram todos os erros prováveis: período `aaaamm`, decimal com ponto, data vazia, código com espaço à direita.

**Files:**
- Create: `apps/api/src/services/comprasCustoLegado.ts`
- Test: `apps/api/src/services/comprasCustoLegado.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `periodoParaData(periodo: string): string` — `'202604'` → `'2026-04-01'`; lança `Error` se não for `aaaamm` válido.
  - `texto(valor: string | undefined): string | null` — trim; vazio vira `null`.
  - `decimal(valor: string | undefined): number | null` — vazio/inválido vira `null`.
  - `data(valor: string | undefined): string | null` — `'2026-04-01'` passa; vazio vira `null`.
  - `COLUNAS_LEGADO: readonly string[]` — ordem exata das 36 colunas do `bcp`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, expect, test } from 'vitest';
import { COLUNAS_LEGADO, data, decimal, periodoParaData, texto } from './comprasCustoLegado.js';

/**
 * O legado guarda PERIODO como VARCHAR(6) 'aaaamm' e valores como FLOAT.
 * Aqui vira DATE no primeiro dia do mes e DECIMAL, conforme a spec.
 */
describe('periodoParaData', () => {
  test('converte aaaamm para o primeiro dia do mes', () => {
    expect(periodoParaData('202604')).toBe('2026-04-01');
  });

  test('mantem o mes 12 sem virar o ano', () => {
    expect(periodoParaData('202512')).toBe('2025-12-01');
  });

  test('cobre o periodo mais antigo da carga', () => {
    expect(periodoParaData('201701')).toBe('2017-01-01');
  });

  test('recusa periodo fora do formato em vez de gravar lixo', () => {
    expect(() => periodoParaData('2026-4')).toThrow();
    expect(() => periodoParaData('202613')).toThrow();
    expect(() => periodoParaData('')).toThrow();
  });
});

describe('texto', () => {
  test('tira espaco das pontas — o legado usa CHAR e vem preenchido', () => {
    expect(texto('  ABC123  ')).toBe('ABC123');
  });

  test('vazio vira null, nao string vazia', () => {
    expect(texto('')).toBeNull();
    expect(texto('   ')).toBeNull();
    expect(texto(undefined)).toBeNull();
  });
});

describe('decimal', () => {
  test('le numero com ponto decimal', () => {
    expect(decimal('21.62424')).toBe(21.62424);
  });

  test('aceita negativo e zero', () => {
    expect(decimal('0')).toBe(0);
    expect(decimal('-1.5')).toBe(-1.5);
  });

  test('campo vazio do bcp vira null', () => {
    expect(decimal('')).toBeNull();
    expect(decimal(undefined)).toBeNull();
  });

  test('texto que nao e numero vira null em vez de NaN', () => {
    expect(decimal('N/D')).toBeNull();
  });
});

describe('data', () => {
  test('mantem data ISO', () => {
    expect(data('2026-04-01')).toBe('2026-04-01');
  });

  test('vazio vira null', () => {
    expect(data('')).toBeNull();
    expect(data(undefined)).toBeNull();
  });

  test('recusa data fora do formato ISO em vez de deixar o MySQL adivinhar', () => {
    expect(data('01/04/2026')).toBeNull();
  });
});

describe('COLUNAS_LEGADO', () => {
  test('tem as 36 colunas do KPL_ULT_COMPRA, na ordem do export', () => {
    expect(COLUNAS_LEGADO).toHaveLength(36);
    expect(COLUNAS_LEGADO[0]).toBe('CD_EMPRESA');
    expect(COLUNAS_LEGADO[1]).toBe('PERIODO');
    expect(COLUNAS_LEGADO[35]).toBe('CST');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test --workspace=apps/api -- src/services/comprasCustoLegado.test.ts`
Expected: FAIL — `Failed to resolve import "./comprasCustoLegado.js"`

- [ ] **Step 3: Implementar**

```ts
/**
 * Conversores do formato do SQL Server (RDW.dbo.KPL_ULT_COMPRA) para o do
 * portal. Ver docs/superpowers/specs/2026-09-14-custo-ultima-entrada-fase1-design.md
 *
 * Ordem exata das colunas no arquivo gerado pelo bcp. O bcp com -c nao
 * escreve cabecalho, entao a ordem aqui e a unica fonte da verdade: mexer
 * nela sem mexer no SELECT do export desalinha a carga inteira em silencio.
 */
export const COLUNAS_LEGADO = [
  'CD_EMPRESA', 'PERIODO', 'CD_PROD', 'DC_PROD', 'MARCA', 'NCM',
  'DT_MOVTO', 'DT_EMISSAO', 'DOCTO', 'SERIE',
  'CD_CLIFOR', 'DC_CLIFOR', 'MUN_CLIFOR', 'UF_CLIFOR',
  'QTDE', 'VU_MERC', 'ALIQ_ICMS', 'ALIQ_RED_ICMS', 'VB_ICMS', 'VT_ICMS',
  'VT_ICMS_ST', 'VT_ST_GNRE', 'ALIQ_IPI', 'VB_IPI', 'VT_IPI',
  'ALIQ_PIS', 'VB_PIS', 'VT_PIS', 'ALIQ_COFINS', 'VB_COFINS', 'VT_COFINS',
  'VT_NF', 'VT_CUSTO', 'VU_CUSTO', 'VT_FOB_EURO', 'CST',
] as const;

/** `'202604'` → `'2026-04-01'`. O portal guarda periodo como DATE no primeiro dia do mes. */
export function periodoParaData(periodo: string): string {
  const limpo = String(periodo ?? '').trim();
  if (!/^\d{6}$/.test(limpo)) {
    throw new Error(`PERIODO fora do formato aaaamm: ${periodo}`);
  }
  const mes = Number(limpo.slice(4, 6));
  if (mes < 1 || mes > 12) {
    throw new Error(`PERIODO com mes invalido: ${periodo}`);
  }
  return `${limpo.slice(0, 4)}-${limpo.slice(4, 6)}-01`;
}

/** Trim; vazio vira NULL. O legado usa CHAR e devolve campo preenchido de espaco. */
export function texto(valor: string | undefined): string | null {
  const limpo = String(valor ?? '').trim();
  return limpo === '' ? null : limpo;
}

/** Numero do bcp; vazio ou nao-numerico vira NULL em vez de NaN. */
export function decimal(valor: string | undefined): number | null {
  const limpo = String(valor ?? '').trim();
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Data ja exportada em ISO pelo SELECT do export; qualquer outro formato vira NULL. */
export function data(valor: string | undefined): string | null {
  const limpo = String(valor ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(limpo) ? limpo : null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test --workspace=apps/api -- src/services/comprasCustoLegado.test.ts`
Expected: PASS, 16 testes

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sem saída de erro

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/comprasCustoLegado.ts apps/api/src/services/comprasCustoLegado.test.ts
git commit -m "Conversores do formato legado do custo de ultima entrada"
```

---

### Task 3: Script de carga do histórico

**Files:**
- Create: `apps/api/src/scripts/importarCustoUltimaEntrada.ts`
- Modify: `apps/api/package.json` (adicionar script `import:custo-entrada`)

**Interfaces:**
- Consumes: `COLUNAS_LEGADO`, `periodoParaData`, `texto`, `decimal`, `data` da Task 2; `inserirEmLote(connection, tabela, colunas, linhas)` de `services/sysemp/dbUtil.js`; `pool`, `withTransaction` de `config/database.js`.
- Produces: linhas em `compras_custo_ultima_entrada` com `origem='SQLSERVER'`.

- [ ] **Step 1: Gerar o CSV do SQL Server**

O `bcp` com `-c` **não** escreve cabeçalho, e a ordem do `SELECT` tem que bater com `COLUNAS_LEGADO`. Delimitador `~|~` porque descrição de produto contém vírgula e ponto-e-vírgula.

```bash
cd /c/GitHub/jnk-portal
HOST=$(grep -E '^SQLSERVER_HOST=' .env.sqlserver | cut -d= -f2- | tr -d '\r')
DB=$(grep -E '^SQLSERVER_DATABASE=' .env.sqlserver | cut -d= -f2- | tr -d '\r')
USR=$(grep -E '^SQLSERVER_USER=' .env.sqlserver | cut -d= -f2- | tr -d '\r')
PWD_=$(grep -E '^SQLSERVER_PASSWORD=' .env.sqlserver | cut -d= -f2- | tr -d '\r')
SP="C:/Users/rikar/AppData/Local/Temp/claude/c--GitHub-jnk-portal/e0eaa6e0-34df-4319-bbfe-27c65e4e8eca/scratchpad"
mkdir -p "$SP"
bcp "SELECT CD_EMPRESA, PERIODO, CD_PROD, DC_PROD, MARCA, NCM, CONVERT(varchar(10),DT_MOVTO,23), CONVERT(varchar(10),DT_EMISSAO,23), DOCTO, SERIE, CD_CLIFOR, DC_CLIFOR, MUN_CLIFOR, UF_CLIFOR, QTDE, VU_MERC, ALIQ_ICMS, ALIQ_RED_ICMS, VB_ICMS, VT_ICMS, VT_ICMS_ST, VT_ST_GNRE, ALIQ_IPI, VB_IPI, VT_IPI, ALIQ_PIS, VB_PIS, VT_PIS, ALIQ_COFINS, VB_COFINS, VT_COFINS, VT_NF, VT_CUSTO, VU_CUSTO, VT_FOB_EURO, CST FROM RDW.dbo.KPL_ULT_COMPRA ORDER BY PERIODO, CD_EMPRESA, CD_PROD" \
  queryout "$SP/kpl_ult_compra.csv" -S "$HOST" -d "$DB" -U "$USR" -P "$PWD_" -c -C 65001 -t"~|~"
wc -l < "$SP/kpl_ult_compra.csv"
```

Expected: `742830`

- [ ] **Step 2: Escrever o script**

```ts
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { inserirEmLote } from '../services/sysemp/dbUtil.js';
import { COLUNAS_LEGADO, data, decimal, periodoParaData, texto } from '../services/comprasCustoLegado.js';

/**
 * Carga unica do historico de custo de ultima entrada, vindo do SQL Server
 * (RDW.dbo.KPL_ULT_COMPRA) via CSV gerado pelo bcp.
 *
 * Ver docs/superpowers/specs/2026-09-14-custo-ultima-entrada-fase1-design.md
 *
 * NAO recalcula nada: importa o resultado que o legado ja calculou. O KPL
 * parou em 31/12/2024 e as tabelas TOTVS estao vazias, entao recalcular
 * significaria refazer sete anos de regra fiscal sem ganho nenhum.
 *
 * Idempotente: grava com ON DUPLICATE KEY UPDATE sobre
 * (periodo, origem, empresa, cd_produto). Rodar de novo reescreve os mesmos
 * valores, nao duplica.
 *
 * Uso:
 *   npm run import:custo-entrada --workspace=apps/api -- --arquivo <caminho.csv>
 *   npm run import:custo-entrada --workspace=apps/api -- --arquivo <caminho.csv> --limite 1000
 */

const ORIGEM = 'SQLSERVER';
const SEPARADOR = '~|~';
const TAMANHO_LOTE = 200;

const COLUNAS_DESTINO = [
  'periodo', 'origem', 'empresa', 'id_empresa', 'empresa_encontrada',
  'cd_produto', 'id_produto', 'produto_encontrado',
  'descricao_produto', 'marca', 'ncm',
  'dt_movto', 'dt_emissao', 'documento', 'serie',
  'cd_clifor', 'dc_clifor', 'mun_clifor', 'uf_clifor',
  'qtde', 'vu_merc', 'aliq_icms', 'aliq_red_icms', 'vb_icms', 'vt_icms',
  'vt_icms_st', 'vt_st_gnre', 'aliq_ipi', 'vb_ipi', 'vt_ipi',
  'aliq_pis', 'vb_pis', 'vt_pis', 'aliq_cofins', 'vb_cofins', 'vt_cofins',
  'vt_nf', 'vt_custo', 'vu_custo', 'vt_fob_euro', 'cst',
];

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface ProdutoRow extends RowDataPacket {
  id_produto: number;
  codigo_auxiliar: string;
}

interface EmpresaRow extends RowDataPacket {
  id_empresa: number;
  nome: string;
}

/**
 * De-para carregado UMA vez na memoria. Sao 11.509 produtos e 9 empresas:
 * cabe folgado, e evita 742 mil consultas de resolucao.
 */
async function carregarDePara() {
  const [produtos] = await pool.query<ProdutoRow[]>(
    'SELECT id_produto, codigo_auxiliar FROM sysemp_produto WHERE codigo_auxiliar IS NOT NULL',
  );
  const porCodigo = new Map<string, number>();
  for (const p of produtos) {
    const chave = String(p.codigo_auxiliar).trim().toUpperCase();
    if (chave && !porCodigo.has(chave)) porCodigo.set(chave, p.id_produto);
  }
  return porCodigo;
}

async function main() {
  const arquivo = argumento('arquivo');
  if (!arquivo) {
    console.error('[custo] uso: --arquivo <caminho do csv gerado pelo bcp>');
    process.exitCode = 1;
    return;
  }
  const limite = Number(argumento('limite') ?? 0);

  const porCodigo = await carregarDePara();
  console.log(`[custo] de-para de produto carregado: ${porCodigo.size} codigos.`);

  const leitor = createInterface({ input: createReadStream(arquivo, 'utf8'), crlfDelay: Infinity });

  let lidas = 0;
  let gravadas = 0;
  let semProduto = 0;
  let lote: unknown[][] = [];

  const gravar = async () => {
    if (lote.length === 0) return;
    const conexao = await pool.getConnection();
    try {
      await inserirEmLote(conexao, 'compras_custo_ultima_entrada', COLUNAS_DESTINO, lote);
    } finally {
      conexao.release();
    }
    gravadas += lote.length;
    lote = [];
  };

  for await (const linha of leitor) {
    if (!linha.trim()) continue;
    const c = linha.split(SEPARADOR);
    if (c.length !== COLUNAS_LEGADO.length) {
      throw new Error(`[custo] linha ${lidas + 1} tem ${c.length} campos, esperado ${COLUNAS_LEGADO.length}`);
    }
    lidas += 1;

    const cdProduto = texto(c[2]) ?? '';
    const idProduto = porCodigo.get(cdProduto.toUpperCase()) ?? null;
    if (idProduto === null) semProduto += 1;

    lote.push([
      periodoParaData(c[1] ?? ''), ORIGEM, texto(c[0]) ?? '', null, false,
      cdProduto, idProduto, idProduto !== null,
      texto(c[3]), texto(c[4]), texto(c[5]),
      data(c[6]), data(c[7]), texto(c[8]), texto(c[9]),
      texto(c[10]), texto(c[11]), texto(c[12]), texto(c[13]),
      decimal(c[14]), decimal(c[15]), decimal(c[16]), decimal(c[17]), decimal(c[18]), decimal(c[19]),
      decimal(c[20]), decimal(c[21]), decimal(c[22]), decimal(c[23]), decimal(c[24]),
      decimal(c[25]), decimal(c[26]), decimal(c[27]), decimal(c[28]), decimal(c[29]), decimal(c[30]),
      decimal(c[31]), decimal(c[32]), decimal(c[33]), decimal(c[34]), texto(c[35]),
    ]);

    if (lote.length >= TAMANHO_LOTE) {
      await gravar();
      if (gravadas % 50000 === 0) console.log(`[custo] ${gravadas} linhas gravadas...`);
    }
    if (limite > 0 && lidas >= limite) break;
  }
  await gravar();

  console.log(`[custo] lidas=${lidas} gravadas=${gravadas} sem_produto_no_cadastro=${semProduto}`);
}

main().finally(() => pool.end());
```

- [ ] **Step 3: `inserirEmLote` não faz upsert — conferir e ajustar**

O `inserirEmLote` atual monta `INSERT INTO ... VALUES (...)`, sem `ON DUPLICATE KEY UPDATE`. Rodar o script duas vezes estouraria na chave única em vez de reescrever.

Run: `grep -n "INSERT INTO" apps/api/src/services/sysemp/dbUtil.ts`
Expected: uma linha, sem `ON DUPLICATE`.

Como a função é usada por vários consumidores da fila, **não altere o comportamento dela**. Em vez disso, o script grava com SQL próprio. Substitua o corpo de `gravar()` por:

```ts
  const gravar = async () => {
    if (lote.length === 0) return;
    const placeholders = lote.map(() => `(${COLUNAS_DESTINO.map(() => '?').join(',')})`).join(',');
    const atualizacoes = COLUNAS_DESTINO
      .filter((col) => !['periodo', 'origem', 'empresa', 'cd_produto'].includes(col))
      .map((col) => `${col} = VALUES(${col})`)
      .join(', ');
    await pool.query(
      `INSERT INTO compras_custo_ultima_entrada (${COLUNAS_DESTINO.join(',')})
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE ${atualizacoes}`,
      lote.flat(),
    );
    gravadas += lote.length;
    lote = [];
  };
```

E remova o import de `inserirEmLote`, que deixa de ser usado.

- [ ] **Step 4: Registrar o script no package.json**

Em `apps/api/package.json`, dentro de `"scripts"`, ao lado de `"backfill:nf"`:

```json
"import:custo-entrada": "tsx src/scripts/importarCustoUltimaEntrada.ts",
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sem saída de erro

- [ ] **Step 6: Ensaio com 1.000 linhas**

Run: `npm run import:custo-entrada --workspace=apps/api -- --arquivo "<caminho>/kpl_ult_compra.csv" --limite 1000`
Expected: `lidas=1000 gravadas=1000 sem_produto_no_cadastro=<n>`

Confira no banco que os valores batem com a origem antes de seguir para a carga cheia:

```sql
SELECT periodo, empresa, cd_produto, dt_movto, documento, vu_custo
FROM compras_custo_ultima_entrada ORDER BY id LIMIT 5;
```

- [ ] **Step 7: Conferir idempotência**

Rode o mesmo comando do Step 6 de novo.
Expected: `gravadas=1000` e a contagem total da tabela **não muda**.

```sql
SELECT COUNT(*) FROM compras_custo_ultima_entrada;
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/scripts/importarCustoUltimaEntrada.ts apps/api/package.json
git commit -m "Script de carga do historico de custo de ultima entrada"
```

---

### Task 4: Service e rota de consulta

**Files:**
- Create: `apps/api/src/services/comprasCustoUltimaEntrada.ts`
- Create: `apps/api/src/routes/comprasCustoUltimaEntrada.ts`
- Modify: `apps/api/src/app.ts` (import + `app.use`)

**Interfaces:**
- Consumes: `pool` de `config/database.js`; `authTenant`, `requirePermissao`.
- Produces:
  - `buscarCustoUltimaEntradaPaginado(filtro: FiltroCusto): Promise<{ linhas: LinhaCusto[]; total: number }>`
  - `buscarPeriodosDisponiveis(): Promise<string[]>`
  - Rota `GET /api/compras/custo-ultima-entrada` com `periodo`, `empresa`, `produto`, `pagina`, `tamanho`.
  - Rota `GET /api/compras/custo-ultima-entrada/periodos`.

- [ ] **Step 1: Escrever o service**

```ts
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

export interface FiltroCusto {
  periodo?: string;
  empresa?: string;
  produto?: string;
  pagina: number;
  tamanho: number;
}

export interface LinhaCusto extends RowDataPacket {
  id: number;
  periodo: string;
  origem: string;
  empresa: string;
  cd_produto: string;
  descricao_produto: string | null;
  marca: string | null;
  dt_movto: string | null;
  documento: string | null;
  dc_clifor: string | null;
  qtde: string | null;
  vu_custo: string | null;
  vt_custo: string | null;
  produto_encontrado: number;
}

/** Monta WHERE e parametros uma vez so, pra contagem e pagina usarem o mesmo filtro. */
function montarFiltro(filtro: FiltroCusto): { where: string; params: unknown[] } {
  const condicoes: string[] = [];
  const params: unknown[] = [];

  if (filtro.periodo) {
    condicoes.push('periodo = ?');
    params.push(filtro.periodo);
  }
  if (filtro.empresa) {
    condicoes.push('empresa = ?');
    params.push(filtro.empresa);
  }
  if (filtro.produto) {
    condicoes.push('(cd_produto LIKE ? OR descricao_produto LIKE ?)');
    params.push(`%${filtro.produto}%`, `%${filtro.produto}%`);
  }

  return { where: condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '', params };
}

export async function buscarCustoUltimaEntradaPaginado(filtro: FiltroCusto) {
  const { where, params } = montarFiltro(filtro);

  const [totais] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM compras_custo_ultima_entrada ${where}`,
    params,
  );
  const total = Number(totais[0]?.total ?? 0);

  const offset = (filtro.pagina - 1) * filtro.tamanho;
  const [linhas] = await pool.query<LinhaCusto[]>(
    `SELECT id, periodo, origem, empresa, cd_produto, descricao_produto, marca,
            dt_movto, documento, dc_clifor, qtde, vu_custo, vt_custo, produto_encontrado
       FROM compras_custo_ultima_entrada
       ${where}
      ORDER BY periodo DESC, empresa, cd_produto
      LIMIT ? OFFSET ?`,
    [...params, filtro.tamanho, offset],
  );

  return { linhas, total };
}

export async function buscarPeriodosDisponiveis(): Promise<string[]> {
  const [linhas] = await pool.query<RowDataPacket[]>(
    'SELECT DISTINCT periodo FROM compras_custo_ultima_entrada ORDER BY periodo DESC',
  );
  return linhas.map((l) => String(l.periodo));
}
```

- [ ] **Step 2: Escrever a rota**

```ts
import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import {
  buscarCustoUltimaEntradaPaginado,
  buscarPeriodosDisponiveis,
} from '../services/comprasCustoUltimaEntrada.js';

export const comprasCustoUltimaEntradaRouter = Router();

const ROTA = '/compras/custo-ultima-entrada';

comprasCustoUltimaEntradaRouter.use(authTenant);

comprasCustoUltimaEntradaRouter.get('/periodos', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  res.json(await buscarPeriodosDisponiveis());
});

comprasCustoUltimaEntradaRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const pagina = Math.max(1, Number(req.query.pagina ?? 1));
  const tamanho = Math.min(200, Math.max(1, Number(req.query.tamanho ?? 50)));

  const resultado = await buscarCustoUltimaEntradaPaginado({
    periodo: (req.query.periodo as string) || undefined,
    empresa: (req.query.empresa as string) || undefined,
    produto: (req.query.produto as string) || undefined,
    pagina,
    tamanho,
  });

  res.json({ ...resultado, pagina, tamanho });
});
```

- [ ] **Step 3: Montar o router no app.ts**

Em `apps/api/src/app.ts`, ao lado de `comprasPedidosRouter`:

```ts
import { comprasCustoUltimaEntradaRouter } from './routes/comprasCustoUltimaEntrada.js';
```

e, junto das outras montagens:

```ts
app.use('/api/compras/custo-ultima-entrada', comprasCustoUltimaEntradaRouter);
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sem saída de erro

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/comprasCustoUltimaEntrada.ts apps/api/src/routes/comprasCustoUltimaEntrada.ts apps/api/src/app.ts
git commit -m "API de consulta do custo de ultima entrada"
```

---

### Task 5: Tela em Compras e seed

A rota no `App.tsx` e o seed em `telas_modulo` sobem **no mesmo commit**: a linha em `telas_modulo` já aparece no menu, então seedar antes da rota existir deixa um item de menu que leva a lugar nenhum.

**Files:**
- Create: `apps/portal/src/pages/compras/CustoUltimaEntradaPage.tsx`
- Modify: `apps/portal/src/App.tsx`
- Create: `apps/api/db/037_compras_custo_entrada_seed.sql`

**Interfaces:**
- Consumes: `GET /api/compras/custo-ultima-entrada` e `/periodos` da Task 4; `useApi()` de `src/lib/useApi.ts`.
- Produces: tela em `/compras/custo-ultima-entrada`.

- [ ] **Step 1: Ler uma tela existente para seguir o padrão**

Run: `sed -n '1,60p' apps/portal/src/pages/compras/PedidosPage.tsx`

Siga o mesmo formato de estado, chamada e tabela. Não invente um padrão novo de data-fetching: o projeto não usa biblioteca para isso, é `useApi()` direto.

- [ ] **Step 2: Escrever a página**

```tsx
import { useEffect, useState } from 'react';
import { useApi } from '../../lib/useApi';

interface LinhaCusto {
  id: number;
  periodo: string;
  origem: string;
  empresa: string;
  cd_produto: string;
  descricao_produto: string | null;
  marca: string | null;
  dt_movto: string | null;
  documento: string | null;
  dc_clifor: string | null;
  qtde: string | null;
  vu_custo: string | null;
  vt_custo: string | null;
  produto_encontrado: number;
}

interface Resposta {
  linhas: LinhaCusto[];
  total: number;
  pagina: number;
  tamanho: number;
}

const TAMANHO = 50;

function fmtData(valor: string | null): string {
  if (!valor) return '';
  // O valor chega como ISO; formatar sem passar por fuso do navegador.
  const [ano, mes, dia] = valor.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

function fmtNumero(valor: string | null, casas: number): string {
  if (valor === null) return '';
  return Number(valor).toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function CustoUltimaEntradaPage() {
  const api = useApi();
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [periodo, setPeriodo] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [produto, setProduto] = useState('');
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<string[]>('/compras/custo-ultima-entrada/periodos')
      .then((lista) => {
        setPeriodos(lista);
        if (lista.length > 0 && !periodo) setPeriodo(lista[0] ?? '');
      })
      .catch((e) => setErro(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    const params = new URLSearchParams({ pagina: String(pagina), tamanho: String(TAMANHO) });
    if (periodo) params.set('periodo', periodo);
    if (empresa) params.set('empresa', empresa);
    if (produto) params.set('produto', produto);

    api<Resposta>(`/compras/custo-ultima-entrada?${params.toString()}`)
      .then(setDados)
      .catch((e) => setErro(String(e)))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, empresa, produto, pagina]);

  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / TAMANHO)) : 1;

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Custo da Última Entrada</h1>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          className="border rounded px-2 py-1"
          value={periodo}
          onChange={(e) => { setPeriodo(e.target.value); setPagina(1); }}
        >
          <option value="">Todos os períodos</option>
          {periodos.map((p) => (
            <option key={p} value={p}>{p.slice(0, 7).split('-').reverse().join('/')}</option>
          ))}
        </select>

        <select
          className="border rounded px-2 py-1"
          value={empresa}
          onChange={(e) => { setEmpresa(e.target.value); setPagina(1); }}
        >
          <option value="">Todas as empresas</option>
          <option value="JNK">JNK</option>
          <option value="NK2">NK2</option>
        </select>

        <input
          className="border rounded px-2 py-1 flex-1 min-w-[200px]"
          placeholder="Código ou descrição do produto"
          value={produto}
          onChange={(e) => { setProduto(e.target.value); setPagina(1); }}
        />
      </div>

      {erro && <div className="text-red-600 mb-3">{erro}</div>}
      {carregando && <div className="text-gray-500 mb-3">Carregando...</div>}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b">
              <th className="p-2">Empresa</th>
              <th className="p-2">Produto</th>
              <th className="p-2">Descrição</th>
              <th className="p-2">Marca</th>
              <th className="p-2">Entrada</th>
              <th className="p-2">Documento</th>
              <th className="p-2">Fornecedor</th>
              <th className="p-2 text-right">Qtde</th>
              <th className="p-2 text-right">Custo unit.</th>
              <th className="p-2 text-right">Custo total</th>
              <th className="p-2">Origem</th>
            </tr>
          </thead>
          <tbody>
            {dados?.linhas.map((l) => (
              <tr key={l.id} className="border-b hover:bg-gray-50">
                <td className="p-2">{l.empresa}</td>
                <td className="p-2">
                  {l.cd_produto}
                  {!l.produto_encontrado && (
                    <span className="ml-1 text-amber-600" title="Produto não encontrado no cadastro atual">*</span>
                  )}
                </td>
                <td className="p-2">{l.descricao_produto}</td>
                <td className="p-2">{l.marca}</td>
                <td className="p-2">{fmtData(l.dt_movto)}</td>
                <td className="p-2">{l.documento}</td>
                <td className="p-2">{l.dc_clifor}</td>
                <td className="p-2 text-right">{fmtNumero(l.qtde, 2)}</td>
                <td className="p-2 text-right">{fmtNumero(l.vu_custo, 4)}</td>
                <td className="p-2 text-right">{fmtNumero(l.vt_custo, 2)}</td>
                <td className="p-2">{l.origem}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dados && (
        <div className="flex items-center gap-3 mt-4">
          <button
            className="border rounded px-3 py-1 disabled:opacity-40"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </button>
          <span className="text-sm">
            Página {pagina} de {totalPaginas} — {dados.total.toLocaleString('pt-BR')} linhas
          </span>
          <button
            className="border rounded px-3 py-1 disabled:opacity-40"
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-3">
        * produto sem correspondência no cadastro atual do SysEmp — a linha histórica foi
        importada do mesmo jeito.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Registrar a rota no App.tsx**

Junto do import do `PedidosPage`:

```tsx
import { CustoUltimaEntradaPage } from './pages/compras/CustoUltimaEntradaPage';
```

e junto da rota `/compras/pedidos`:

```tsx
<Route path="/compras/custo-ultima-entrada" element={<CustoUltimaEntradaPage />} />
```

- [ ] **Step 4: Escrever o seed**

```sql
-- Tela de consulta do Custo da Ultima Entrada, no modulo Compras.
-- Ver docs/superpowers/specs/2026-09-14-custo-ultima-entrada-fase1-design.md
--
-- A linha em telas_modulo ja aparece no menu, entao so pode ser seedada
-- depois que a rota existir no App.tsx e o router em app.ts - as duas
-- pontas sobem no mesmo commit/deploy.
--
-- Isto NAO concede permissao a ninguem, nem a administrador: a tela fica
-- invisivel ate alguem marca-la em Configurador -> Perfis -> Salvar.

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Custo da Ultima Entrada' AS nome_tela, '/compras/custo-ultima-entrada' AS rota_tela
) t ON m.chave_modulo = 'COMPRAS'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
```

- [ ] **Step 5: Typecheck e build**

Run: `npm run typecheck`
Expected: sem saída de erro

Run: `npm run build`
Expected: build completo sem erro

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/pages/compras/CustoUltimaEntradaPage.tsx apps/portal/src/App.tsx apps/api/db/037_compras_custo_entrada_seed.sql
git commit -m "Tela de consulta do custo de ultima entrada no modulo Compras"
```

---

### Task 6: Carga cheia e conferência contra o legado

Só rodar depois que a migration 036 estiver **aplicada em produção** (o job `PRE_DEPLOY` a aplica no deploy do commit da Task 1).

**Files:** nenhum. Esta task é execução e verificação.

- [ ] **Step 1: Rodar a carga cheia**

Run: `npm run import:custo-entrada --workspace=apps/api -- --arquivo "<caminho>/kpl_ult_compra.csv"`
Expected: `lidas=742830 gravadas=742830 sem_produto_no_cadastro=<n>`

- [ ] **Step 2: Conferir a contagem total**

```sql
SELECT COUNT(*) AS total FROM compras_custo_ultima_entrada WHERE origem = 'SQLSERVER';
```
Expected: `742830`

- [ ] **Step 3: Conferir contagem por empresa**

```sql
SELECT empresa, COUNT(*) FROM compras_custo_ultima_entrada
WHERE origem='SQLSERVER' GROUP BY empresa;
```
Expected: `JNK 713678`, `NK2 29152`

- [ ] **Step 4: Conferir a cobertura de períodos**

```sql
SELECT MIN(periodo), MAX(periodo), COUNT(DISTINCT periodo)
FROM compras_custo_ultima_entrada WHERE origem='SQLSERVER';
```
Expected: `2017-01-01`, `2026-04-01`, `112`

- [ ] **Step 5: Conferir uma linha conhecida contra a origem**

```sql
SELECT periodo, dt_movto, documento, vu_custo
FROM compras_custo_ultima_entrada
WHERE origem='SQLSERVER' AND empresa='JNK' AND cd_produto='000001' AND periodo='2026-04-01';
```
Expected: `dt_movto = 2022-01-05`, `documento = 957702`, `vu_custo = 21.624240`

- [ ] **Step 6: Reportar a taxa de casamento de produto**

```sql
SELECT produto_encontrado, COUNT(*) FROM compras_custo_ultima_entrada
WHERE origem='SQLSERVER' GROUP BY produto_encontrado;
```

A spec registra essa taxa como desconhecida. Se a maioria vier `0` (não encontrado), **pare e reporte** — a chave de casamento (`codigo_auxiliar`) provavelmente está errada, e a tela fica inútil sem o vínculo.

- [ ] **Step 7: Conferir a tela**

Abrir `/compras/custo-ultima-entrada` no portal, após liberar a tela em Configurador → Perfis. Filtrar por período e produto e comparar com o SQL Server.

- [ ] **Step 8: Apagar as credenciais**

```bash
rm /c/GitHub/jnk-portal/.env.sqlserver
```

---

## Self-Review

**Cobertura da spec:**

| Seção da spec | Task |
|---|---|
| 3.1 Tabela | Task 1 |
| 3.2 Carga do histórico | Tasks 2, 3, 6 |
| 3.3 Tela de consulta | Task 5 (+ rota na Task 4) |
| 6 Como validar | Task 6 |

**Sem lacunas.** Os itens de "Fora do escopo" da spec (cálculo, precedência, despachante, margem) não têm task, o que é correto — são Fases 2 e 3.

**Placeholders:** nenhum. Todo passo tem o código real.

**Consistência de tipos:** `COLUNAS_LEGADO` (Task 2) é consumida pelo script (Task 3) com o mesmo nome; `COLUNAS_DESTINO` do script tem 41 entradas e casa com a ordem do array de valores; `LinhaCusto` do service (Task 4) tem os mesmos campos da interface homônima na página (Task 5).

**Risco conhecido:** o Step 3 da Task 3 corrige um problema real — `inserirEmLote` não faz upsert, e o script precisa de idempotência. A correção é local ao script, sem alterar a função compartilhada.
