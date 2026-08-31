# Unificação de Filiais (`config_filial`) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir as três representações concorrentes de filial/empresa (`filiais`, `etl_empresa`, `usuarios_empresas`) por uma tabela única `config_filial`, e fazer todos os módulos respeitarem o vínculo do usuário.

**Architecture:** `etl_empresa` é renomeada para `config_filial` e vira o cadastro único. `usuarios_filiais` volta a ser o único vínculo, apontando para `config_filial(recno)`. Duas dimensões separadas governam o acesso: **permissão** (`usuarios_filiais`, servidor, falha fechada) e **foco** (seletor da barra lateral, escolha do usuário, filtra mas nunca amplia).

**Tech Stack:** Node 20 + Express + MySQL 8 (mysql2), React 18 + Vite + Tailwind, Vitest, npm workspaces.

**Spec:** `Specs/spec_config_filial.md`

## Global Constraints

- Migrations em `apps/api/db/NNN_nome.sql`, aplicadas por `db/migrate.ts` na ordem do nome do arquivo; cada arquivo roda **uma vez** (controle em `schema_migrations`).
- Toda consulta ao banco usa `?` com parâmetros — nunca interpolação de valor vindo do usuário.
- Nomes de coluna interpolados em SQL só saem de lista fechada no código.
- Escopo de acesso é **falha fechada**: sem vínculo, o usuário não vê nada. Condição vazia nunca significa "vê tudo".
- Comentários e mensagens em português, como o resto do repositório.
- Testes com Vitest: `npm test -w apps/api` e `npm test -w apps/portal`.
- Não commitar `.do/app.yaml.local` (contém segredos de produção).

---

## Arquivos afetados

| Arquivo | Responsabilidade |
|---|---|
| `apps/api/db/022_config_filial.sql` | **Criar** — renomeia a tabela, acrescenta `empresa` e `ativa` |
| `apps/api/db/023_filiais_unificacao.sql` | **Criar** — repõe FKs, migra dados, remove `filiais` e `usuarios_empresas` |
| `apps/api/src/services/escopoFilial.ts` | **Criar** — substitui `escopoEmpresas.ts`; permissão + foco |
| `apps/api/src/services/escopoFilial.test.ts` | **Criar** — inclui a regressão "foco não amplia" |
| `apps/api/src/services/escopoEmpresas.ts` | **Remover** (e o teste) |
| `apps/api/src/services/faturamentoFiltros.ts` | Modificar — passa a importar de `escopoFilial` |
| `apps/api/src/services/sessao.ts` | Modificar — `filiaisPermitidas` de `config_filial`; sai `empresasPermitidas` |
| `apps/api/src/routes/auth.ts` | Modificar — login e troca de filial sobre `config_filial`; aceita "todas" |
| `apps/api/src/routes/filiais.ts` | Modificar — CRUD sobre `config_filial` |
| `apps/api/src/routes/usuarios.ts` | Modificar — sai `empresas-erp`; filiais do usuário |
| `apps/api/src/routes/tiEquipamentos.ts` | Modificar — aplica escopo |
| `apps/api/src/routes/avisos.ts` | Modificar — aplica escopo |
| `apps/api/src/services/etl/empresa.ts` | **Remover** |
| `apps/api/src/services/integracaoRegistry.ts` | Modificar — sai o card ETL Empresa |
| `packages/shared/src/types/infra.ts` | Modificar — `Filial` ganha campos; sai `EmpresaAcesso` |
| `apps/portal/src/pages/config/FiliaisPage.tsx` | Modificar — CRUD completo |
| `apps/portal/src/pages/config/UsuariosPage.tsx` | Modificar — mostra o configurado |
| `apps/portal/src/components/Sidebar.tsx` | Modificar — opção "Todas as filiais" |

---

## Task 1: Migration do schema de `config_filial`

**Files:**
- Create: `apps/api/db/022_config_filial.sql`

**Interfaces:**
- Consumes: tabela `etl_empresa` com 13 linhas.
- Produces: tabela `config_filial` com as colunas `recno` (PK), `origem_dados`, `cd_filial`, `grupo`, `empresa`, `dc_filial`, `dc_fantasia`, `cnpj`, `ie`, `ativa`, `atualizado_em`; `UNIQUE uq_origem_filial (origem_dados, cd_filial)`.

- [ ] **Step 1: Escrever a migration**

Criar `apps/api/db/022_config_filial.sql`:

```sql
-- Renomeia etl_empresa para config_filial: a tabela deixa de ser uma dimensao
-- de ETL e passa a ser o cadastro unico de filiais do portal.
-- Ver Specs/spec_config_filial.md, secao 4.
--
-- O RENAME preserva as 13 linhas e os recno atuais, que passam a ser
-- referenciados por usuarios_filiais, logs_acesso, ti_equipamento e
-- avisos_plataforma na migration seguinte.

RENAME TABLE etl_empresa TO config_filial;

ALTER TABLE config_filial
    -- Agrupamento livre, paralelo ao `grupo` (JNK/NK2/CNK2), sem hierarquia
    -- definida entre os dois. Preenchido a mao na tela de Filiais.
    ADD COLUMN empresa VARCHAR(50) NULL AFTER grupo,
    -- Permite desativar sem excluir. filiais tinha; etl_empresa nao.
    ADD COLUMN ativa BOOLEAN NOT NULL DEFAULT TRUE AFTER ie,
    -- Era 25 e truncava: "FULL ML CNK2 COM, IMP E E".
    MODIFY dc_fantasia VARCHAR(100) NOT NULL,
    -- 'MANUAL' entra como terceira origem, para filiais que nao existem em ERP
    -- nenhum. VARCHAR(6) ja acomoda.
    MODIFY origem_dados VARCHAR(6) NOT NULL;
```

- [ ] **Step 2: Verificar que a migration é idempotente pelo controle de versão**

Run: `grep -n "schema_migrations" apps/api/db/migrate.ts`
Expected: o runner registra cada arquivo aplicado, então `RENAME TABLE` (que não é idempotente sozinho) roda uma vez só.

- [ ] **Step 3: Commit**

```bash
git add apps/api/db/022_config_filial.sql
git commit -m "Renomeia etl_empresa para config_filial e acrescenta empresa/ativa"
```

---

## Task 2: Migration de FKs e dados

**Files:**
- Create: `apps/api/db/023_filiais_unificacao.sql`

**Interfaces:**
- Consumes: `config_filial` da Task 1; tabelas `filiais`, `usuarios_filiais`, `usuarios_empresas`, `logs_acesso`.
- Produces: `usuarios_filiais.filial_id` → `config_filial(recno)`; `filiais` e `usuarios_empresas` removidas.

- [ ] **Step 1: Descobrir os nomes reais das constraints**

As FKs foram criadas sem nome explícito, então o MySQL gerou nomes. Rodar antes de escrever o DROP:

```sql
SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME = 'filiais';
```

Anotar os nomes; eles entram no passo seguinte.

- [ ] **Step 2: Escrever a migration**

Criar `apps/api/db/023_filiais_unificacao.sql`. Substituir `<CONSTRAINT_*>` pelos nomes do passo 1:

```sql
-- Unifica o cadastro de filiais: usuarios_filiais, logs_acesso, ti_equipamento,
-- avisos_plataforma, usuarios.ultimo_acesso_filial_id e sysemp_empresa.filial_id
-- passam a referenciar config_filial(recno). As tabelas filiais e
-- usuarios_empresas deixam de existir.
-- Ver Specs/spec_config_filial.md, secao 5.
--
-- ORDEM OBRIGATORIA: as FKs impedem qualquer outra. Remover as constraints,
-- remapear os valores, so entao recriar apontando para config_filial.

-- ---- 1. Remover as FKs que apontam para filiais ----
ALTER TABLE usuarios_filiais    DROP FOREIGN KEY <CONSTRAINT_USUARIOS_FILIAIS>;
ALTER TABLE usuarios            DROP FOREIGN KEY <CONSTRAINT_USUARIOS>;
ALTER TABLE avisos_plataforma   DROP FOREIGN KEY <CONSTRAINT_AVISOS>;
ALTER TABLE logs_acesso         DROP FOREIGN KEY <CONSTRAINT_LOGS>;
ALTER TABLE ti_equipamento      DROP FOREIGN KEY <CONSTRAINT_TI_EQUIP>;
ALTER TABLE sysemp_empresa      DROP FOREIGN KEY <CONSTRAINT_SYSEMP_EMPRESA>;

-- ---- 2. Remapear logs_acesso (unica tabela com dado) ----
-- 1.079 linhas apontam para as filiais 1/2/3. O de-para sai do CNPJ; como o
-- CNPJ de "JNakao" corresponde a cinco empresas SysEmp, o criterio e o MENOR
-- codigo. O historico de acesso e informativo: nao alimenta relatorio.
UPDATE logs_acesso l
JOIN filiais f ON f.id = l.filial_id
JOIN (
    SELECT REGEXP_REPLACE(cnpj, '[^0-9]', '') AS cnpj_num, MIN(recno) AS recno
    FROM config_filial
    WHERE origem_dados = 'SYSEMP'
    GROUP BY REGEXP_REPLACE(cnpj, '[^0-9]', '')
) alvo ON alvo.cnpj_num = REGEXP_REPLACE(f.cnpj, '[^0-9]', '')
SET l.filial_id = alvo.recno;

-- Sobrou algum log cujo CNPJ nao casou? Vira NULL em vez de apontar para
-- linha inexistente, que impediria recriar a FK.
UPDATE logs_acesso
SET filial_id = NULL
WHERE filial_id IS NOT NULL
  AND filial_id NOT IN (SELECT recno FROM config_filial);

-- ---- 3. Migrar os vinculos de usuario ----
-- Os vinculos atuais sao por grupo (a filial "JNakao" == grupo JNK). Cada
-- usuario passa a ter todas as filiais do grupo que ja tinha, preservando
-- exatamente o acesso de hoje.
CREATE TEMPORARY TABLE tmp_vinculos AS
SELECT DISTINCT uf.usuario_id, cf.recno AS filial_id
FROM usuarios_filiais uf
JOIN filiais f ON f.id = uf.filial_id
JOIN config_filial cf
  ON cf.grupo = CASE f.nome WHEN 'JNakao' THEN 'JNK' ELSE f.nome END;

DELETE FROM usuarios_filiais;
INSERT INTO usuarios_filiais (usuario_id, filial_id)
SELECT usuario_id, filial_id FROM tmp_vinculos;
DROP TEMPORARY TABLE tmp_vinculos;

-- ---- 4. Zerar as colunas sem dado, que apontavam para ids de filiais ----
UPDATE usuarios SET ultimo_acesso_filial_id = NULL;
UPDATE avisos_plataforma SET filial_id = NULL WHERE filial_id IS NOT NULL;
UPDATE ti_equipamento SET filial_id = NULL WHERE filial_id IS NOT NULL;
UPDATE sysemp_empresa SET filial_id = NULL WHERE filial_id IS NOT NULL;

-- ---- 5. Recriar as FKs apontando para config_filial ----
ALTER TABLE usuarios_filiais
    ADD CONSTRAINT fk_usuarios_filiais_filial
    FOREIGN KEY (filial_id) REFERENCES config_filial(recno) ON DELETE CASCADE;

ALTER TABLE usuarios
    ADD CONSTRAINT fk_usuarios_ultima_filial
    FOREIGN KEY (ultimo_acesso_filial_id) REFERENCES config_filial(recno) ON DELETE SET NULL;

ALTER TABLE avisos_plataforma
    ADD CONSTRAINT fk_avisos_filial
    FOREIGN KEY (filial_id) REFERENCES config_filial(recno) ON DELETE CASCADE;

ALTER TABLE logs_acesso
    ADD CONSTRAINT fk_logs_filial
    FOREIGN KEY (filial_id) REFERENCES config_filial(recno);

ALTER TABLE ti_equipamento
    ADD CONSTRAINT fk_ti_equip_filial
    FOREIGN KEY (filial_id) REFERENCES config_filial(recno) ON DELETE SET NULL;

ALTER TABLE sysemp_empresa
    ADD CONSTRAINT fk_sysemp_empresa_filial
    FOREIGN KEY (filial_id) REFERENCES config_filial(recno) ON DELETE SET NULL;

-- ---- 6. Remover as tabelas que deixaram de existir ----
DROP TABLE usuarios_empresas;
DROP TABLE filiais;
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/db/023_filiais_unificacao.sql
git commit -m "Reponta FKs para config_filial e remove filiais e usuarios_empresas"
```

---

## Task 3: Camada de escopo — permissão e foco

**Files:**
- Create: `apps/api/src/services/escopoFilial.ts`
- Create: `apps/api/src/services/escopoFilial.test.ts`
- Delete: `apps/api/src/services/escopoEmpresas.ts`, `apps/api/src/services/escopoEmpresas.test.ts`

**Interfaces:**
- Consumes: `usuarios_filiais`, `config_filial`.
- Produces:
  - `interface FilialPermitida { recno: number; origem: string; cdFilial: number; nome: string; grupo: string; empresa: string | null }`
  - `buscarFiliaisPermitidas(usuarioId: number): Promise<FilialPermitida[]>`
  - `aplicarFoco(permitidas: FilialPermitida[], filialAtivaId: number | null): FilialPermitida[]`
  - `aplicarEscopo(pedidas: number[] | undefined, permitidas: FilialPermitida[]): FilialPermitida[]`
  - `condicaoEscopo(escopo: FilialPermitida[], colunaOrigem?: string, colunaEmpresa?: string): { where: string; params: unknown[] }`
  - `condicaoEscopoPorRecno(escopo: FilialPermitida[], coluna: string): { where: string; params: unknown[] }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `apps/api/src/services/escopoFilial.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import {
  aplicarEscopo,
  aplicarFoco,
  condicaoEscopo,
  condicaoEscopoPorRecno,
  type FilialPermitida,
} from './escopoFilial.js';

function filial(recno: number, origem: string, cdFilial: number): FilialPermitida {
  return { recno, origem, cdFilial, nome: `F${recno}`, grupo: 'JNK', empresa: null };
}

const PERMITIDAS = [filial(1, 'SYSEMP', 1), filial(2, 'SYSEMP', 2), filial(23, 'KPL', 1)];

describe('aplicarFoco', () => {
  test('sem filial em foco, devolve tudo que o usuário pode ver', () => {
    expect(aplicarFoco(PERMITIDAS, null)).toEqual(PERMITIDAS);
  });

  test('com uma filial em foco, restringe àquela', () => {
    expect(aplicarFoco(PERMITIDAS, 2)).toEqual([filial(2, 'SYSEMP', 2)]);
  });

  test('foco numa filial FORA da permissão não amplia o acesso', () => {
    // Regressão mais importante desta mudança: o seletor é conveniência,
    // não permissão. Focar o que não se pode ver devolve vazio.
    expect(aplicarFoco(PERMITIDAS, 99)).toEqual([]);
  });

  test('usuário sem permissão nenhuma continua sem ver nada, com ou sem foco', () => {
    expect(aplicarFoco([], null)).toEqual([]);
    expect(aplicarFoco([], 2)).toEqual([]);
  });
});

describe('aplicarEscopo', () => {
  test('sem pedido, devolve tudo que o usuário pode ver', () => {
    expect(aplicarEscopo(undefined, PERMITIDAS)).toEqual(PERMITIDAS);
  });

  test('lista vazia equivale a não ter pedido nada', () => {
    expect(aplicarEscopo([], PERMITIDAS)).toEqual(PERMITIDAS);
  });

  test('filtra pelos recnos pedidos', () => {
    expect(aplicarEscopo([23], PERMITIDAS)).toEqual([filial(23, 'KPL', 1)]);
  });

  test('recno fora da permissão é descartado, nunca concedido', () => {
    expect(aplicarEscopo([99], PERMITIDAS)).toEqual([]);
  });

  test('sem permissão nenhuma, nada é devolvido', () => {
    expect(aplicarEscopo(undefined, [])).toEqual([]);
  });
});

describe('condicaoEscopo', () => {
  test('escopo vazio produz condição sempre falsa, nunca condição ausente', () => {
    expect(condicaoEscopo([])).toEqual({ where: '1 = 0', params: [] });
  });

  test('cada filial vira um par origem+código', () => {
    expect(condicaoEscopo([filial(2, 'SYSEMP', 2)])).toEqual({
      where: '((origem_dados = ? AND cd_filial = ?))',
      params: ['SYSEMP', 2],
    });
  });

  test('várias filiais são alternativas dentro de um único parêntese', () => {
    const { where, params } = condicaoEscopo([filial(1, 'SYSEMP', 1), filial(23, 'KPL', 1)]);
    expect(where).toBe('((origem_dados = ? AND cd_filial = ?) OR (origem_dados = ? AND cd_filial = ?))');
    expect(params).toEqual(['SYSEMP', 1, 'KPL', 1]);
  });
});

describe('condicaoEscopoPorRecno', () => {
  test('escopo vazio produz condição sempre falsa', () => {
    expect(condicaoEscopoPorRecno([], 'e.filial_id')).toEqual({ where: '1 = 0', params: [] });
  });

  test('usa o recno, para tabelas do portal que apontam para config_filial', () => {
    expect(condicaoEscopoPorRecno(PERMITIDAS, 'e.filial_id')).toEqual({
      where: 'e.filial_id IN (?,?,?)',
      params: [1, 2, 23],
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w apps/api`
Expected: FAIL com "Cannot find module './escopoFilial.js'".

- [ ] **Step 3: Escrever a implementação**

Criar `apps/api/src/services/escopoFilial.ts`:

```typescript
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

/**
 * Escopo de filiais por usuário.
 *
 * Duas dimensões que não se confundem (Specs/spec_config_filial.md, seção 3):
 *
 * - **Permissão** — o que o usuário PODE ver, em `usuarios_filiais`. Fronteira
 *   de segurança: aplicada no servidor, falha fechada, não contornável pela
 *   query string.
 * - **Foco** — o que ele ESTÁ vendo agora, pelo seletor da barra lateral.
 *   Conveniência: o usuário troca à vontade. Filtra, nunca amplia.
 */

export interface FilialPermitida {
  /** Chave em `config_filial`, usada pelas tabelas do portal. */
  recno: number;
  /** `SYSEMP`, `KPL` ou `MANUAL`. */
  origem: string;
  /** Código no ERP de origem, usado pelas tabelas de fato. */
  cdFilial: number;
  nome: string;
  grupo: string;
  empresa: string | null;
}

interface FilialRow extends RowDataPacket {
  recno: number;
  origem_dados: string;
  cd_filial: number;
  dc_fantasia: string;
  grupo: string;
  empresa: string | null;
}

export async function buscarFiliaisPermitidas(usuarioId: number): Promise<FilialPermitida[]> {
  const [linhas] = await pool.query<FilialRow[]>(
    `SELECT cf.recno, cf.origem_dados, cf.cd_filial, cf.dc_fantasia, cf.grupo, cf.empresa
     FROM usuarios_filiais uf
     JOIN config_filial cf ON cf.recno = uf.filial_id
     WHERE uf.usuario_id = ? AND cf.ativa = TRUE
     ORDER BY cf.origem_dados, cf.cd_filial`,
    [usuarioId],
  );
  return linhas.map((l) => ({
    recno: l.recno,
    origem: l.origem_dados,
    cdFilial: l.cd_filial,
    nome: l.dc_fantasia,
    grupo: l.grupo,
    empresa: l.empresa,
  }));
}

/**
 * Aplica a filial em foco. `null` significa "todas as permitidas".
 *
 * Focar uma filial fora da permissão devolve vazio — o seletor filtra dentro
 * do que a pessoa já pode ver, e jamais concede acesso novo.
 */
export function aplicarFoco(permitidas: FilialPermitida[], filialAtivaId: number | null): FilialPermitida[] {
  if (filialAtivaId === null) return permitidas;
  return permitidas.filter((f) => f.recno === filialAtivaId);
}

/** Interseção entre o que a tela pediu (por `recno`) e o que o usuário pode ver. */
export function aplicarEscopo(pedidas: number[] | undefined, permitidas: FilialPermitida[]): FilialPermitida[] {
  if (!pedidas?.length) return permitidas;
  const alvo = new Set(pedidas);
  return permitidas.filter((f) => alvo.has(f.recno));
}

/**
 * Condição para as tabelas de fato, que identificam a filial por origem +
 * código: o código 1 é Barueri na SysEmp e JNK Barueri no KPL.
 *
 * Escopo vazio devolve condição sempre falsa, não ausência de condição — a
 * diferença entre não ver nada e ver tudo.
 */
export function condicaoEscopo(
  escopo: FilialPermitida[],
  colunaOrigem = 'origem_dados',
  colunaEmpresa = 'cd_filial',
): { where: string; params: unknown[] } {
  if (escopo.length === 0) return { where: '1 = 0', params: [] };
  return {
    where: `(${escopo.map(() => `(${colunaOrigem} = ? AND ${colunaEmpresa} = ?)`).join(' OR ')})`,
    params: escopo.flatMap((f) => [f.origem, f.cdFilial]),
  };
}

/** Condição para as tabelas do portal, que apontam para `config_filial(recno)`. */
export function condicaoEscopoPorRecno(
  escopo: FilialPermitida[],
  coluna: string,
): { where: string; params: unknown[] } {
  if (escopo.length === 0) return { where: '1 = 0', params: [] };
  return { where: `${coluna} IN (${escopo.map(() => '?').join(',')})`, params: escopo.map((f) => f.recno) };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -w apps/api`
Expected: PASS.

- [ ] **Step 5: Remover o módulo antigo**

```bash
rm apps/api/src/services/escopoEmpresas.ts apps/api/src/services/escopoEmpresas.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/escopoFilial.ts apps/api/src/services/escopoFilial.test.ts
git add -u apps/api/src/services/
git commit -m "Camada de escopo por filial: permissao e foco separados"
```

---

## Task 4: Adaptar os filtros de Faturamento

**Files:**
- Modify: `apps/api/src/services/faturamentoFiltros.ts`
- Modify: `apps/api/src/services/faturamentoFiltros.test.ts`
- Modify: `apps/api/src/services/faturamento.ts`

**Interfaces:**
- Consumes: `FilialPermitida`, `aplicarEscopo`, `condicaoEscopo` da Task 3.
- Produces: `montarFiltroComEscopo(filtros: FiltroFaturamento, escopo: FilialPermitida[]): ClausulaFiltro` — mesma assinatura, tipo novo.

- [ ] **Step 1: Ajustar os testes existentes para o tipo novo**

Em `apps/api/src/services/faturamentoFiltros.test.ts`, trocar o bloco `escopoJnk` e o import:

```typescript
import { montarFiltro, montarFiltroComEscopo, type FiltroFaturamento } from './faturamentoFiltros.js';
import type { FilialPermitida } from './escopoFilial.js';

// dentro de describe('montarFiltroComEscopo', ...)
  const escopoJnk: FilialPermitida[] = [
    { recno: 1, origem: 'SYSEMP', cdFilial: 1, nome: 'Barueri', grupo: 'JNK', empresa: null },
    { recno: 2, origem: 'SYSEMP', cdFilial: 2, nome: 'Pinheiros', grupo: 'JNK', empresa: null },
  ];
```

O teste `'empresa escolhida dentro do escopo é respeitada'` passa a pedir por `recno`:

```typescript
  test('filial escolhida dentro do escopo é respeitada', () => {
    expect(montarFiltroComEscopo({ empresas: [2] }, escopoJnk).params).toEqual(['S', 'SYSEMP', 2]);
  });

  test('filial escolhida FORA do escopo não retorna nada — não vaza', () => {
    expect(montarFiltroComEscopo({ empresas: [99] }, escopoJnk).where).toContain('1 = 0');
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -w apps/api`
Expected: FAIL — `escopoEmpresas.js` não existe mais.

- [ ] **Step 3: Trocar o import em `faturamentoFiltros.ts`**

```typescript
import { aplicarEscopo, condicaoEscopo, type FilialPermitida } from './escopoFilial.js';
```

E a assinatura:

```typescript
export function montarFiltroComEscopo(
  filtros: FiltroFaturamento,
  escopoUsuario: FilialPermitida[],
): ClausulaFiltro {
```

O campo `empresas` de `FiltroFaturamento` passa a significar **recnos de filial**. Atualizar o comentário:

```typescript
  /** `recno` das filiais escolhidas na tela. Sempre interseccionado com o escopo. */
  empresas?: number[];
```

- [ ] **Step 4: Trocar o import em `faturamento.ts`**

```typescript
import { condicaoEscopo, type FilialPermitida } from './escopoFilial.js';
```

E substituir `EmpresaPermitida[]` por `FilialPermitida[]` em todas as assinaturas do arquivo (`buscarLinhasPaginadas`, `buscarLinhasCompletas`, `buscarResumo`, `agregarPor`, `agregarPorPeriodo`, `buscarFiltrosDisponiveis`).

- [ ] **Step 5: Rodar e ver passar**

Run: `npm test -w apps/api && npm run typecheck -w apps/api`
Expected: PASS, sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/faturamentoFiltros.ts apps/api/src/services/faturamentoFiltros.test.ts apps/api/src/services/faturamento.ts
git commit -m "Faturamento passa a usar o escopo por filial"
```

---

## Task 5: Sessão, login e troca de filial

**Files:**
- Modify: `packages/shared/src/types/infra.ts`
- Modify: `apps/api/src/services/sessao.ts`
- Modify: `apps/api/src/routes/auth.ts`

**Interfaces:**
- Consumes: `buscarFiliaisPermitidas` da Task 3.
- Produces: `UsuarioSessao.filiaisPermitidas: Filial[]` com `Filial = { id, nomeFormatado, cnpj, origem, cdFilial, grupo, empresa }`; `filialAtivaId: number | null` (`null` = todas).

- [ ] **Step 1: Atualizar os tipos compartilhados**

Em `packages/shared/src/types/infra.ts`, substituir a interface `Filial` e remover `EmpresaAcesso`:

```typescript
export interface Filial {
  /** `config_filial.recno`. */
  id: number;
  nomeFormatado: string;
  cnpj: string;
  /** `SYSEMP`, `KPL` ou `MANUAL`. */
  origem: string;
  cdFilial: number;
  grupo: string;
  empresa: string | null;
}
```

Em `UsuarioSessao`, remover a propriedade `empresasPermitidas` e trocar:

```typescript
  /** `null` significa "todas as filiais permitidas". */
  filialAtivaId: number | null;
```

- [ ] **Step 2: Atualizar `sessao.ts`**

Substituir a consulta de filiais e remover o bloco de `empresasPermitidas`:

```typescript
  const permitidas = await buscarFiliaisPermitidas(usuarioId);

  const filiaisPermitidas: Filial[] = permitidas.map((f) => ({
    id: f.recno,
    nomeFormatado: `${f.origem} · ${f.nome}`,
    cnpj: '',
    origem: f.origem,
    cdFilial: f.cdFilial,
    grupo: f.grupo,
    empresa: f.empresa,
  }));
```

O CNPJ vem junto na consulta se for exibido; incluir `cf.cnpj` no `SELECT` de `buscarFiliaisPermitidas` e no tipo `FilialPermitida` caso a tela precise dele.

- [ ] **Step 3: Atualizar `auth.ts`**

A validação de login que exige ao menos uma filial permanece. A escolha da filial ativa passa a aceitar `null`:

```typescript
  // `null` = todas as permitidas. O seletor da barra lateral oferece essa
  // opção, e ela é o padrão de quem nunca escolheu.
  const filialAtivaId = idsPermitidos.includes(usuario.ultimo_acesso_filial_id ?? -1)
    ? (usuario.ultimo_acesso_filial_id as number)
    : null;
```

No endpoint de troca de filial, aceitar `null` e validar pertencimento quando não for nulo:

```typescript
  const filialId = req.body.filialId as number | null;
  if (filialId !== null) {
    const [permitida] = await pool.query<RowDataPacket[]>(
      `SELECT 1 FROM usuarios_filiais uf
       JOIN config_filial cf ON cf.recno = uf.filial_id
       WHERE uf.usuario_id = ? AND uf.filial_id = ? AND cf.ativa = TRUE`,
      [usuarioId, filialId],
    );
    if (permitida.length === 0) {
      res.status(403).json({ erro: 'Filial não permitida para este usuário.' });
      return;
    }
  }
```

- [ ] **Step 4: Verificar compilação**

Run: `npm run build:shared && npm run typecheck -w apps/api`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/types/infra.ts apps/api/src/services/sessao.ts apps/api/src/routes/auth.ts
git commit -m "Sessao e login sobre config_filial, com filial ativa opcional"
```

---

## Task 6: Rotas — CRUD de filiais e escopo nos módulos

**Files:**
- Modify: `apps/api/src/routes/filiais.ts`
- Modify: `apps/api/src/routes/usuarios.ts`
- Modify: `apps/api/src/routes/tiEquipamentos.ts`
- Modify: `apps/api/src/routes/avisos.ts`
- Modify: `apps/api/src/routes/faturamentoNotasFiscais.ts`, `faturamentoDashboard.ts`, `estoqueCurvaAbc.ts`

**Interfaces:**
- Consumes: `buscarFiliaisPermitidas`, `aplicarFoco`, `condicaoEscopoPorRecno` da Task 3.
- Produces: `GET/POST/PUT/DELETE /api/filiais` sobre `config_filial`.

- [ ] **Step 1: Reescrever `filiais.ts`**

```typescript
import { Router } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';

export const filiaisRouter = Router();

const ROTA = '/config/filiais';

interface FilialBody {
  origem_dados?: string;
  cd_filial?: number;
  grupo?: string;
  empresa?: string | null;
  dc_filial?: string;
  dc_fantasia?: string;
  cnpj?: string;
  ie?: string;
  ativa?: boolean;
}

filiaisRouter.use(authTenant);

filiaisRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (_req, res) => {
  const [filiais] = await pool.query<RowDataPacket[]>(
    'SELECT * FROM config_filial ORDER BY origem_dados, grupo, cd_filial',
  );
  res.json(filiais);
});

filiaisRouter.post('/', requirePermissao(ROTA, 'podeCriar'), async (req, res) => {
  const b = req.body as FilialBody;
  if (!b.origem_dados || b.cd_filial === undefined || !b.dc_filial) {
    res.status(400).json({ erro: 'Origem, código e razão social são obrigatórios.' });
    return;
  }

  const [resultado] = await pool.query<ResultSetHeader>(
    `INSERT INTO config_filial
       (origem_dados, cd_filial, grupo, empresa, dc_filial, dc_fantasia, cnpj, ie, ativa, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      b.origem_dados,
      b.cd_filial,
      b.grupo ?? 'N/D',
      b.empresa ?? null,
      b.dc_filial,
      b.dc_fantasia ?? b.dc_filial,
      b.cnpj ?? '',
      b.ie ?? '',
      b.ativa ?? true,
    ],
  );
  res.status(201).json({ recno: resultado.insertId });
});

filiaisRouter.put('/:recno', requirePermissao(ROTA, 'podeEditar'), async (req, res) => {
  const b = req.body as FilialBody;
  await pool.query(
    `UPDATE config_filial SET
       grupo = COALESCE(?, grupo),
       empresa = ?,
       dc_filial = COALESCE(?, dc_filial),
       dc_fantasia = COALESCE(?, dc_fantasia),
       cnpj = COALESCE(?, cnpj),
       ie = COALESCE(?, ie),
       ativa = COALESCE(?, ativa),
       atualizado_em = CURRENT_TIMESTAMP
     WHERE recno = ?`,
    [
      b.grupo ?? null,
      b.empresa ?? null,
      b.dc_filial ?? null,
      b.dc_fantasia ?? null,
      b.cnpj ?? null,
      b.ie ?? null,
      b.ativa ?? null,
      req.params.recno,
    ],
  );
  res.json({ ok: true });
});

/**
 * Excluir uma filial vinculada a usuários é bloqueado com mensagem explícita.
 * A alternativa — cascata — removeria acesso sem que ninguém percebesse.
 */
filiaisRouter.delete('/:recno', requirePermissao(ROTA, 'podeDeletar'), async (req, res) => {
  const [vinculos] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS total FROM usuarios_filiais WHERE filial_id = ?',
    [req.params.recno],
  );
  const total = Number(vinculos[0]?.total ?? 0);
  if (total > 0) {
    res.status(409).json({
      erro: `Esta filial está vinculada a ${total} usuário(s). Remova os vínculos ou desative a filial em vez de excluir.`,
    });
    return;
  }

  await pool.query('DELETE FROM config_filial WHERE recno = ?', [req.params.recno]);
  res.json({ ok: true });
});
```

- [ ] **Step 2: Ajustar `usuarios.ts`**

Remover os endpoints `GET /empresas-erp` e `GET /:id/empresas-erp`, a função `regravarEmpresas`, `parEmpresa` e o campo `empresas` do body. Acrescentar o endpoint que devolve as filiais de um usuário:

```typescript
/** Filiais já vinculadas — usado para marcar o formulário de edição. */
usuariosRouter.get('/:id/filiais', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const [linhas] = await pool.query<RowDataPacket[]>(
    'SELECT filial_id FROM usuarios_filiais WHERE usuario_id = ?',
    [req.params.id],
  );
  res.json(linhas.map((l) => l.filial_id as number));
});
```

No `PUT`, `filiaisIds` deixa de significar "vazio = manter":

```typescript
    // Sempre regravado, inclusive vazio: e assim que se remove todo o acesso.
    if (filiaisIds) {
      await connection.query('DELETE FROM usuarios_filiais WHERE usuario_id = ?', [usuarioId]);
      for (const filialId of filiaisIds) {
        await connection.query('INSERT INTO usuarios_filiais (usuario_id, filial_id) VALUES (?, ?)', [
          usuarioId,
          filialId,
        ]);
      }
    }
```

- [ ] **Step 3: Aplicar escopo no TI**

Em `tiEquipamentos.ts`, o `filialId` da query string hoje não é validado contra a permissão. Substituir o bloco:

```typescript
import { buscarFiliaisPermitidas, condicaoEscopoPorRecno } from '../services/escopoFilial.js';

// dentro do handler GET /
  const permitidas = await buscarFiliaisPermitidas(req.usuario!.id);
  const escopo = filialId
    ? permitidas.filter((f) => f.recno === Number(filialId))
    : permitidas;

  // Equipamento sem filial atribuída continua visível: o vínculo é opcional
  // por decisão do módulo TI, e escondê-lo faria sumir equipamento do
  // inventário sem aviso.
  const esc = condicaoEscopoPorRecno(escopo, 'e.filial_id');
  condicoes.push(`(e.filial_id IS NULL OR ${esc.where})`);
  params.push(...esc.params);
```

- [ ] **Step 4: Aplicar escopo nos Avisos**

Em `avisos.ts`, trocar a condição por filial ativa:

```typescript
  const permitidas = await buscarFiliaisPermitidas(req.usuario!.id);
  const esc = condicaoEscopoPorRecno(permitidas, 'filial_id');
  const [avisos] = await pool.query<RowDataPacket[]>(
    `SELECT * FROM avisos_plataforma
     WHERE (filial_id IS NULL OR ${esc.where}) AND data_expiracao > CURRENT_TIMESTAMP
     ORDER BY criado_em DESC`,
    esc.params,
  );
```

- [ ] **Step 5: Trocar as chamadas nas rotas de Faturamento e Estoque**

Substituir `buscarEmpresasPermitidas(req.usuario!.id)` por, nas três rotas:

```typescript
import { aplicarFoco, buscarFiliaisPermitidas } from '../services/escopoFilial.js';

const escopo = aplicarFoco(await buscarFiliaisPermitidas(req.usuario!.id), req.usuario!.filialAtivaId);
```

Em `estoqueCurvaAbc.ts`, `condicaoEscopoDeUmaOrigem` some; usar `condicaoEscopo` com a origem filtrada:

```typescript
const codigos = escopo.filter((f) => f.origem === 'SYSEMP').map((f) => f.cdFilial);
```

- [ ] **Step 6: Verificar**

Run: `npm run typecheck -w apps/api && npm test -w apps/api`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/
git commit -m "Rotas: CRUD de config_filial e escopo por filial em todos os modulos"
```

---

## Task 7: Desligar o ETL de empresa

**Files:**
- Delete: `apps/api/src/services/etl/empresa.ts`
- Modify: `apps/api/src/services/integracaoRegistry.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `ENTIDADES_INTEGRACAO` sem a entrada `etl_empresa`.

- [ ] **Step 1: Remover o serviço e a entrada do registro**

```bash
rm apps/api/src/services/etl/empresa.ts
```

Em `integracaoRegistry.ts`, remover o import `rodarEtlEmpresa` e a linha:

```typescript
  { chave: 'etl_empresa', nome: 'ETL Empresa', sincronizar: rodarEtlEmpresa },
```

- [ ] **Step 2: Verificar**

Run: `npm run typecheck -w apps/api`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add -u apps/api/src/services/
git commit -m "Desliga o ETL de empresa: config_filial passa a ser cadastral"
```

---

## Task 8: Tela de Filiais

**Files:**
- Modify: `apps/portal/src/pages/config/FiliaisPage.tsx`

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /api/filiais` da Task 6.
- Produces: nenhuma para outras tasks.

- [ ] **Step 1: Trocar o tipo e o formulário**

```typescript
interface Filial {
  recno: number;
  origem_dados: string;
  cd_filial: number;
  grupo: string;
  empresa: string | null;
  dc_filial: string;
  dc_fantasia: string;
  cnpj: string;
  ie: string;
  ativa: boolean;
}

const FILIAL_VAZIA = {
  origem_dados: 'MANUAL',
  cd_filial: 0,
  grupo: '',
  empresa: '',
  dc_filial: '',
  dc_fantasia: '',
  cnpj: '',
  ie: '',
  ativa: true,
};
```

A tabela ganha colunas para origem, código, grupo, empresa, fantasia, CNPJ e ativa. O `id` vira `recno` em todas as chamadas (`/filiais/${filial.recno}`).

Origem e código só são editáveis na criação — mudá-los depois quebraria o vínculo com as tabelas de fato:

```tsx
<input
  value={form.origem_dados}
  onChange={(e) => setForm({ ...form, origem_dados: e.target.value })}
  disabled={editando !== null}
  className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-100"
/>
```

- [ ] **Step 2: Tratar o 409 da exclusão**

```typescript
  async function excluir(filial: Filial) {
    try {
      await api(`/filiais/${filial.recno}`, { method: 'DELETE' });
      await carregar();
    } catch (error) {
      setErro((error as Error).message);
    }
  }
```

- [ ] **Step 3: Verificar**

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/portal/src/pages/config/FiliaisPage.tsx
git commit -m "Tela de Filiais sobre config_filial, com CRUD completo"
```

---

## Task 9: Tela de Usuários mostra o que está configurado

**Files:**
- Modify: `apps/portal/src/pages/config/UsuariosPage.tsx`

**Interfaces:**
- Consumes: `GET /api/usuarios/:id/filiais` da Task 6.
- Produces: nenhuma.

- [ ] **Step 1: Remover a seção "Empresas do ERP"**

Apagar o estado `empresasErp`, a interface `EmpresaErp`, a função `alternarEmpresa`, o campo `empresas` de `FormState` e o bloco JSX inteiro da seção.

- [ ] **Step 2: Carregar o que está configurado ao abrir a edição**

```typescript
  async function abrirEdicao(usuario: Usuario) {
    setEditando(usuario);
    setFormAberto(true);
    setErro(null);
    // Mostrar o que ESTA configurado, em vez de vazio com "deixe em branco
    // para manter": o administrador precisa ver o estado real, e desmarcar
    // tudo precisa ser uma acao possivel.
    const [filiaisIds, perfisIds] = await Promise.all([
      api<number[]>(`/usuarios/${usuario.id}/filiais`).catch(() => [] as number[]),
      api<number[]>(`/usuarios/${usuario.id}/perfis`).catch(() => [] as number[]),
    ]);
    setForm({
      nome: usuario.nome,
      email: usuario.email,
      senha: '',
      whatsapp: usuario.whatsapp ?? '',
      filiaisIds,
      perfisIds,
    });
  }
```

Se `GET /usuarios/:id/perfis` ainda não existir, acrescentá-lo em `usuarios.ts` no mesmo formato do endpoint de filiais:

```typescript
usuariosRouter.get('/:id/perfis', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const [linhas] = await pool.query<RowDataPacket[]>(
    'SELECT perfil_id FROM usuarios_perfis WHERE usuario_id = ?',
    [req.params.id],
  );
  res.json(linhas.map((l) => l.perfil_id as number));
});
```

- [ ] **Step 3: Enviar sempre, inclusive vazio**

```typescript
      if (editando) {
        const body: Record<string, unknown> = { nome: form.nome, email: form.email, whatsapp: form.whatsapp };
        if (form.senha) body.senha = form.senha;
        // Sempre enviados, inclusive vazios: e assim que se remove o acesso.
        body.filiaisIds = form.filiaisIds;
        body.perfisIds = form.perfisIds;
        await api(`/usuarios/${editando.id}`, { method: 'PUT', body });
      }
```

- [ ] **Step 4: Tirar o texto "(deixe em branco para manter)"**

Nos dois títulos, trocar por um rótulo simples e um aviso honesto:

```tsx
<p className="mb-1 text-sm font-medium text-slate-700">Filiais</p>
<p className="mb-2 text-xs text-slate-500">
  Quais filiais este usuário enxerga nos módulos. Nenhuma marcada significa nenhum acesso a dado.
</p>
```

Listar as filiais agrupadas por origem, com CNPJ visível — sem ele "JNK Barueri" e "BARUERI CASA J NAKAO" parecem coisas diferentes.

- [ ] **Step 5: Verificar**

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/pages/config/UsuariosPage.tsx apps/api/src/routes/usuarios.ts
git commit -m "Cadastro de usuario mostra filiais e perfis realmente configurados"
```

---

## Task 10: Seletor da barra lateral com "Todas as filiais"

**Files:**
- Modify: `apps/portal/src/components/Sidebar.tsx`
- Modify: `apps/portal/src/context/AuthProvider.tsx`

**Interfaces:**
- Consumes: `filialAtivaId: number | null` da Task 5.
- Produces: nenhuma.

- [ ] **Step 1: Acrescentar a opção no dropdown**

```tsx
<button
  type="button"
  onClick={() => switchFilial(null)}
  className="flex min-h-[44px] w-full items-center px-3 py-2 text-left text-sm hover:bg-slate-100"
>
  Todas as filiais
</button>
{usuario.filiaisPermitidas.map((filial) => (
  <button
    key={filial.id}
    type="button"
    onClick={() => switchFilial(filial.id)}
    className="flex min-h-[44px] w-full items-center px-3 py-2 text-left text-sm hover:bg-slate-100"
  >
    {filial.nomeFormatado}
  </button>
))}
```

O rótulo do botão principal passa a mostrar "Todas as filiais" quando `filialAtivaId` é `null`.

- [ ] **Step 2: Aceitar `null` em `switchFilial`**

Em `AuthProvider.tsx`, a assinatura passa a ser `switchFilial(filialId: number | null)`, enviando o valor como está no corpo da requisição.

- [ ] **Step 3: Verificar**

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/portal/src/components/Sidebar.tsx apps/portal/src/context/AuthProvider.tsx
git commit -m "Seletor de filial ganha a opcao Todas as filiais"
```

---

## Task 11: Aplicar em produção e verificar

**Files:** nenhum — execução e verificação.

- [ ] **Step 1: Backup do banco antes das migrations**

As migrations 022 e 023 removem tabelas e recriam chaves estrangeiras. Fazer snapshot do cluster no painel da DigitalOcean antes de rodar.

- [ ] **Step 2: Rodar as migrations contra produção**

Usar o mesmo wrapper temporário dos deploys anteriores (lê `.do/app.yaml.local` e importa `db/migrate.js`), depois apagá-lo.

Expected: `[migrate] aplicando: 022_config_filial.sql` e `023_filiais_unificacao.sql`, sem erro.

- [ ] **Step 3: Verificar o estado**

```sql
SELECT COUNT(*) FROM config_filial;                      -- 13
SELECT COUNT(*) FROM usuarios_filiais;                   -- 18 (9 por usuario)
SELECT COUNT(*) FROM logs_acesso WHERE filial_id IS NOT NULL;  -- 1.079
SHOW TABLES LIKE 'filiais';                              -- vazio
SHOW TABLES LIKE 'usuarios_empresas';                    -- vazio
```

- [ ] **Step 4: Confirmar que o escopo continua restringindo**

Comparar o faturamento total com e sem escopo, como na verificação anterior: a diferença deve continuar sendo exatamente NK2 + CNK2 (R$ 136.350), já que os vínculos foram preservados.

- [ ] **Step 5: Commit e push final**

```bash
git push origin master
```

---

## Auto-revisão do plano

**Cobertura da spec:**

| Seção da spec | Task |
|---|---|
| 4.1 `config_filial` | 1 |
| 4.2–4.4 FKs, remoções | 2 |
| 3 Permissão vs foco | 3 |
| 5 Migração | 2, 11 |
| 5.1 Desligar ETL | 7 |
| 6 Aplicação nos módulos | 4, 6 |
| 7.1 Tela de filiais | 8 |
| 7.2 Tela de usuários | 9 |
| Seletor com "Todas" | 10 |
| 8 Testes | 3 (foco não amplia), 4 |

**Consistência de tipos:** `FilialPermitida` é definida na Task 3 e consumida com o mesmo nome e campos nas Tasks 4, 5 e 6. `Filial` (compartilhada) é definida na Task 5 e consumida nas Tasks 8, 9 e 10. `filialAtivaId: number | null` é introduzido na Task 5 e usado nas Tasks 6 e 10.

**Ponto de atenção para quem executar:** a Task 2 depende dos nomes reais das constraints, que só se descobrem consultando o banco (Step 1 daquela task). Não invente os nomes.
