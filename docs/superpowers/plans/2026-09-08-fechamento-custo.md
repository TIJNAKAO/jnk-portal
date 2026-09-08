# Fechamento de Custo — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar as seis telas do submenu "Fechamento Mensal" do portal PHP `jnakao-digital-ocean` para o módulo Estoque deste monorepo, incluindo a carga do histórico do banco antigo.

**Architecture:** Três telas de upload de `.xlsx` gravam em tabelas próprias (`estoque_fechamento_mensal`, `estoque_full_importado`, `estoque_inventario_fisico`); uma tela de cálculo junta as duas primeiras em `estoque_custo_fechamento`, valorizando o Estoque FULL pelo custo do Fechamento e caindo para um percentual do preço de venda quando não há custo; uma tela compara Inventário × Fechamento sem gravar nada; uma tela lista o log das importações. A regra de valorização mora numa função pura, separada da persistência, e é onde os testes se concentram.

**Tech Stack:** Node ≥ 20, TypeScript strict com `noUncheckedIndexedAccess`, Express 4 + `mysql2/promise` (SQL parametrizado, sem ORM), exceljs (leitura e escrita), multer (upload), React 18 + Vite + Tailwind + react-router, vitest.

**Spec:** `Specs/spec_modulo_estoque.md`, seção 3 (subseções 3.1 a 3.14). Leia a seção inteira antes da Task 1 — ela justifica decisões que o código sozinho não explica.

## Global Constraints

- **Idioma:** código, comentários, mensagens de erro, UI e commits em **português**. Comentários de **migration** e assuntos de **commit** vão **sem acentos** (padrão do histórico); o resto do código usa acentuação normal.
- **Numeração de seções em documento começa em 1**, nunca em 0.
- **ESM:** todo import de arquivo local leva extensão `.js` (`from './planilha.js'`), mesmo apontando para um `.ts`.
- **`packages/shared` precisa estar compilado** antes de api e portal: rode `npm run build:shared` na raiz depois de qualquer mudança em `packages/shared`.
- **Verificação real é `npm run typecheck`** na raiz (`npm run lint` não faz nada — não há ESLint no projeto).
- **Toda rota autenticada declara sua `ROTA`** e usa `requirePermissao(ROTA, acao)`. Um router que serve mais de uma tela usa uma constante `ROTA` por tela.
- **Escritas em mais de uma tabela usam `withTransaction`** de `src/config/database.ts`.
- **Nenhuma migration concede permissão a ninguém**, nem a administrador. Liberar tela é passo manual em Configurador → Perfis.
- **Migrations são imutáveis depois de aplicadas.** Corrigir significa criar a próxima. Os números desta entrega são `029`, `030` e `031`; se algum já existir no repositório quando você chegar nele, use o próximo livre e ajuste as referências no spec no mesmo commit.
- **Datas em horário de Brasília.** O pool já grava assim (`timezone: '-03:00'` em `config/database.ts`); não converta nada à mão.
- **Sem FK das tabelas de importação para `sysemp_produto` / `sysemp_empresa`.** Linha que não bate com o cadastro é importada assim mesmo, só marcada. FK proibiria isso.
- **Especificação é documento vivo:** se a implementação divergir do spec ou for além dele, atualize `Specs/spec_modulo_estoque.md` **no mesmo commit**.

---

## Mapa de arquivos

**API — migrations (`apps/api/db/`)**

| Arquivo | Responsabilidade |
|---|---|
| `029_estoque_fechamento_schema.sql` | as cinco tabelas |
| `030_estoque_fechamento_parametros.sql` | seed dos dois parâmetros |
| `031_estoque_fechamento_seed.sql` | as seis linhas em `telas_modulo` — **por último**, depois das rotas |

**API — serviços (`apps/api/src/services/`)**

| Arquivo | Responsabilidade |
|---|---|
| `planilha.ts` | ler `.xlsx`, mapear cabeçalho por nome, parsear período/número/texto |
| `estoqueFechamentoParametros.ts` | ler e validar os dois parâmetros |
| `estoqueImportacaoLog.ts` | gravar e listar o log de importações |
| `estoqueFechamentoMensal.ts` | importar a planilha de Fechamento Mensal |
| `estoqueFullImportado.ts` | importar a planilha de Estoque FULL |
| `estoqueInventarioFisico.ts` | importar a planilha de Inventário Físico |
| `estoqueFechamentoGrupos.ts` | resolver grupo → empresas e filtrar por escopo |
| `estoqueCustoFechamento.ts` | valorizar, calcular, consultar e exportar |
| `estoqueFechamentoComparativo.ts` | comparar Inventário × Fechamento |

**API — rotas (`apps/api/src/routes/`)**

| Arquivo | Monta em | Telas que serve |
|---|---|---|
| `estoqueFechamentoImportar.ts` | `/api/estoque/fechamento/importar` | as três de upload |
| `estoqueImportacaoLogs.ts` | `/api/estoque/fechamento/logs` | Logs de Importação |
| `estoqueFechamentoCusto.ts` | `/api/estoque/fechamento/custo` | Cálculo de Custo |
| `estoqueFechamentoComparativo.ts` | `/api/estoque/fechamento/comparativo` | Comparativo |

**API — script (`apps/api/src/scripts/`)**: `migrarFechamentoLegado.ts`

**Portal (`apps/portal/src/pages/estoque/fechamento/`)**

| Arquivo | Responsabilidade |
|---|---|
| `FormularioImportacao.tsx` | componente compartilhado pelas três telas de upload |
| `ImportarFechamentoPage.tsx` | tela de Fechamento Mensal |
| `ImportarEstoqueFullPage.tsx` | tela de Estoque FULL |
| `ImportarInventarioPage.tsx` | tela de Inventário Físico |
| `CustoFechamentoPage.tsx` | cálculo, grade e exportações |
| `ComparativoPage.tsx` | comparativo |
| `LogsImportacaoPage.tsx` | log das importações |

**Compartilhado:** `packages/shared/src/types/infra.ts` ganha `'ESTOQUE'` em `CategoriaParametro`.

---

## Task 1: Esquema das cinco tabelas

**Files:**
- Create: `apps/api/db/029_estoque_fechamento_schema.sql`

**Interfaces:**
- Consumes: nada.
- Produces: as tabelas `estoque_fechamento_mensal`, `estoque_full_importado`, `estoque_inventario_fisico`, `estoque_custo_fechamento`, `estoque_importacao_log`, usadas por todas as tarefas seguintes.

- [ ] **Step 1: Escrever a migration**

Crie `apps/api/db/029_estoque_fechamento_schema.sql`. Comentários **sem acentos**, como as demais migrations do projeto:

```sql
-- Fechamento de Custo: as cinco tabelas do modulo.
-- Ver Specs/spec_modulo_estoque.md, secao 3.3.
--
-- NENHUMA destas tabelas tem FK para sysemp_produto ou sysemp_empresa, e
-- isso e deliberado: linha de planilha que nao bate com o cadastro e
-- importada do mesmo jeito, so marcada com produto_encontrado = FALSE ou
-- empresa_encontrada = FALSE. A informacao contabil continua valida ainda
-- que o produto nao esteja sincronizado, e uma FK proibiria a gravacao.

-- ------------------------------------------------------------------
-- Fechamento Mensal: a planilha contabil, ja com custo proprio.
--
-- A planilha so traz a razao social em EMPRESA (texto livre). O
-- id_empresa e resolvido UMA VEZ, na importacao, e o texto original fica
-- como auditoria do que a planilha dizia. A chave unica continua sendo o
-- texto e nao o id, porque id_empresa pode ser NULL (razao social que nao
-- casou), e NULL nao deduplica em chave unica do MySQL.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estoque_fechamento_mensal (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    periodo            DATE NOT NULL,
    empresa            VARCHAR(100) NOT NULL,
    id_empresa         INT NULL,
    id_produto         INT UNSIGNED NOT NULL,
    codigo_auxiliar    VARCHAR(50) NULL,
    descricao          VARCHAR(255) NULL,
    ncm                VARCHAR(20) NULL,
    unidade            VARCHAR(10) NULL,
    marca              VARCHAR(100) NULL,
    estoque            DECIMAL(14,4) NULL,
    custo              DECIMAL(14,4) NULL,
    total              DECIMAL(14,4) NULL,
    cst_venda          VARCHAR(10) NULL,
    produto_encontrado BOOLEAN NOT NULL DEFAULT TRUE,
    empresa_encontrada BOOLEAN NOT NULL DEFAULT TRUE,
    importado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_fechamento_periodo_empresa_produto (periodo, empresa, id_produto),
    INDEX idx_fechamento_periodo (periodo),
    INDEX idx_fechamento_periodo_empresa (periodo, id_empresa),
    INDEX idx_fechamento_periodo_produto (periodo, id_produto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Estoque FULL: saldo por conta/canal (Amazon, Shopee, Axado, lojas).
--
-- conta e tipo_saldo entram na chave porque o mesmo produto aparece mais
-- de uma vez no mesmo periodo e empresa com classificacoes diferentes:
-- "Aptas para venda" e "Extraviadas" sao linhas distintas, nao uma
-- sobrescrevendo a outra.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estoque_full_importado (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    periodo            DATE NOT NULL,
    id_empresa         INT NOT NULL,
    conta              VARCHAR(50) NOT NULL,
    tipo_saldo         VARCHAR(50) NOT NULL,
    cd_produto         VARCHAR(50) NOT NULL,
    qtde               DECIMAL(14,4) NULL,
    produto_encontrado BOOLEAN NOT NULL DEFAULT TRUE,
    empresa_encontrada BOOLEAN NOT NULL DEFAULT TRUE,
    importado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_full_periodo_empresa_conta_tipo_produto (periodo, id_empresa, conta, tipo_saldo, cd_produto),
    INDEX idx_full_periodo (periodo),
    INDEX idx_full_periodo_empresa (periodo, id_empresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Inventario Fisico: contagem fisica, ate cinco rodadas mais a final.
--
-- almox entra na chave pela mesma razao do Estoque FULL: PRINCIPAL e
-- AVARIAS contam o mesmo produto separadamente. O Fechamento contabil
-- NAO distingue almoxarifado, e e isso que obriga o comparativo a somar
-- os almoxarifados antes de comparar.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estoque_inventario_fisico (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    periodo            DATE NOT NULL,
    id_empresa         INT NOT NULL,
    cd_produto         VARCHAR(50) NOT NULL,
    almox              VARCHAR(50) NOT NULL DEFAULT '',
    marca              VARCHAR(100) NULL,
    contagem_1         DECIMAL(14,4) NULL,
    contagem_2         DECIMAL(14,4) NULL,
    contagem_3         DECIMAL(14,4) NULL,
    contagem_4         DECIMAL(14,4) NULL,
    contagem_5         DECIMAL(14,4) NULL,
    contagem_final     DECIMAL(14,4) NULL,
    saldo_sysemp       DECIMAL(14,4) NULL,
    divergencia        DECIMAL(14,4) NULL,
    analise            VARCHAR(255) NULL,
    acao               VARCHAR(255) NULL,
    produto_encontrado BOOLEAN NOT NULL DEFAULT TRUE,
    empresa_encontrada BOOLEAN NOT NULL DEFAULT TRUE,
    importado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_inventario_periodo_empresa_produto_almox (periodo, id_empresa, cd_produto, almox),
    INDEX idx_inventario_periodo (periodo),
    INDEX idx_inventario_periodo_empresa (periodo, id_empresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Resultado do calculo, por periodo + grupo de empresa.
--
-- Sem chave unica de proposito: recalcular um par (periodo, grupo) apaga
-- o calculo anterior desse par e grava de novo. Nao acumula historico de
-- re-execucoes, so a data da ultima em data_calculo_custo.
--
-- O indice idx_custo_grupo_codigo_periodo nao serve a nenhuma tela desta
-- entrega. Serve a Visao de Margem (spec secao 3.13), que consulta o
-- "custo vigente" - o fechamento mais recente ate o fim de um periodo.
-- Custa uma linha agora e uma migration depois.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estoque_custo_fechamento (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    data_calculo_custo DATETIME DEFAULT CURRENT_TIMESTAMP,
    periodo            DATE NOT NULL,
    grupo_empresa      VARCHAR(5) NOT NULL,
    id_empresa         INT NULL,
    nome_empresa       VARCHAR(255) NULL,
    origem             VARCHAR(20) NOT NULL,
    id_produto         INT UNSIGNED NULL,
    codigo_auxiliar    VARCHAR(50) NULL,
    descricao_produto  VARCHAR(255) NULL,
    marca              VARCHAR(100) NULL,
    unidade            VARCHAR(10) NULL,
    ncm                VARCHAR(20) NULL,
    conta              VARCHAR(50) NULL,
    tipo_saldo         VARCHAR(50) NULL,
    qtde               DECIMAL(14,4) NULL,
    vu_custo_estoque   DECIMAL(14,4) NULL,
    vu_custo_venda     DECIMAL(14,4) NULL,
    vu_custo           DECIMAL(14,4) NULL,
    valor_custo_total  DECIMAL(16,4) NULL,
    INDEX idx_custo_periodo_grupo (periodo, grupo_empresa),
    INDEX idx_custo_origem (origem),
    INDEX idx_custo_grupo_codigo_periodo (grupo_empresa, codigo_auxiliar, periodo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ------------------------------------------------------------------
-- Log de importacao: uma linha por execucao de upload de planilha.
--
-- Mesmo espirito do Painel de Integracao, mas para arquivo em vez de
-- chamada de API. Sem ele, uma importacao parcial so aparece semanas
-- depois, num total que nao fecha.
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS estoque_importacao_log (
    id                       INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tipo                     VARCHAR(40) NOT NULL,
    arquivo                  VARCHAR(255) NULL,
    periodo                  DATE NULL,
    total_linhas             INT UNSIGNED NOT NULL DEFAULT 0,
    inseridas                INT UNSIGNED NOT NULL DEFAULT 0,
    atualizadas              INT UNSIGNED NOT NULL DEFAULT 0,
    ignoradas                INT UNSIGNED NOT NULL DEFAULT 0,
    produtos_nao_encontrados INT UNSIGNED NOT NULL DEFAULT 0,
    empresas_nao_encontradas INT UNSIGNED NOT NULL DEFAULT 0,
    custo_total              DECIMAL(16,4) NULL,
    observacoes              TEXT NULL,
    usuario_id               INT NULL,
    executado_em             DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    INDEX idx_log_tipo (tipo),
    INDEX idx_log_executado_em (executado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

- [ ] **Step 2: Aplicar a migration**

Rode na raiz do monorepo:

```bash
npm run db:migrate
```

Esperado: a saída lista `029_estoque_fechamento_schema.sql` como aplicada, sem erro.

Se o MySQL local não estiver rodando, suba-o antes — a migration precisa de fato ser aplicada, não só escrita.

- [ ] **Step 3: Conferir que as cinco tabelas existem**

```bash
npm run db:migrate
```

Esperado: nenhuma migration pendente (a `029` não é reaplicada). Confirme as tabelas com o cliente MySQL que você usar:

```sql
SHOW TABLES LIKE 'estoque\_%';
```

Esperado: as cinco tabelas listadas.

- [ ] **Step 4: Commit**

```bash
git add apps/api/db/029_estoque_fechamento_schema.sql
git commit -m "Fechamento de Custo ganha as cinco tabelas do modulo Estoque"
```

---

## Task 2: Parâmetros configuráveis do fechamento

**Files:**
- Modify: `packages/shared/src/types/infra.ts:79`
- Modify: `apps/api/src/services/parametros.ts` (bloco `DEFINICAO_CAMPOS`)
- Create: `apps/api/db/030_estoque_fechamento_parametros.sql`
- Create: `apps/api/src/services/estoqueFechamentoParametros.ts`
- Create: `apps/api/src/services/estoqueFechamentoParametros.test.ts`
- Modify: `apps/portal/src/pages/config/ParametrosPage.tsx` (array `CATEGORIAS`)

**Interfaces:**
- Consumes: `ConfiguracaoAusenteError` de `services/erros.ts` (já existe, `statusCode = 422`).
- Produces:
  - `interface ParametrosFechamento { percentualCustoVenda: number; idTabelaPreco: number }`
  - `function interpretarParametrosFechamento(percentual: string | null, idTabela: string | null): ParametrosFechamento`
  - `async function obterParametrosFechamento(): Promise<ParametrosFechamento>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/api/src/services/estoqueFechamentoParametros.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { ConfiguracaoAusenteError } from './erros.js';
import { interpretarParametrosFechamento } from './estoqueFechamentoParametros.js';

/**
 * Um percentual errado produz um custo errado que ninguém questiona, porque
 * o número continua parecendo razoável. Por isso nada aqui tem default
 * silencioso: valor ausente ou inválido derruba o cálculo com o nome da
 * chave. Ver Specs/spec_modulo_estoque.md, seção 3.7.
 */
describe('interpretarParametrosFechamento', () => {
  test('lê os dois parâmetros como número', () => {
    expect(interpretarParametrosFechamento('50', '1')).toEqual({
      percentualCustoVenda: 50,
      idTabelaPreco: 1,
    });
  });

  test('aceita percentual fracionário', () => {
    expect(interpretarParametrosFechamento('47.5', '1').percentualCustoVenda).toBe(47.5);
  });

  test('percentual ausente aborta, nomeando a chave', () => {
    expect(() => interpretarParametrosFechamento(null, '1')).toThrow(ConfiguracaoAusenteError);
    expect(() => interpretarParametrosFechamento(null, '1')).toThrow(/FECHAMENTO_PERCENTUAL_CUSTO_VENDA/);
  });

  test('tabela de preço ausente aborta, nomeando a chave', () => {
    expect(() => interpretarParametrosFechamento('50', null)).toThrow(/FECHAMENTO_ID_TABELA_PRECO/);
  });

  test('percentual não numérico aborta em vez de virar NaN', () => {
    expect(() => interpretarParametrosFechamento('cinquenta', '1')).toThrow(ConfiguracaoAusenteError);
  });

  test('percentual zero aborta — valorizaria tudo a custo zero', () => {
    expect(() => interpretarParametrosFechamento('0', '1')).toThrow(ConfiguracaoAusenteError);
  });

  test('percentual negativo aborta', () => {
    expect(() => interpretarParametrosFechamento('-10', '1')).toThrow(ConfiguracaoAusenteError);
  });

  test('percentual acima de 100 aborta', () => {
    expect(() => interpretarParametrosFechamento('101', '1')).toThrow(ConfiguracaoAusenteError);
  });

  test('percentual exatamente 100 é aceito', () => {
    expect(interpretarParametrosFechamento('100', '1').percentualCustoVenda).toBe(100);
  });

  test('id de tabela de preço não inteiro aborta', () => {
    expect(() => interpretarParametrosFechamento('50', '1.5')).toThrow(ConfiguracaoAusenteError);
  });

  test('espaço em volta do valor não atrapalha', () => {
    expect(interpretarParametrosFechamento(' 50 ', ' 1 ')).toEqual({
      percentualCustoVenda: 50,
      idTabelaPreco: 1,
    });
  });

  test('string vazia conta como ausente', () => {
    expect(() => interpretarParametrosFechamento('', '1')).toThrow(/FECHAMENTO_PERCENTUAL_CUSTO_VENDA/);
  });
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueFechamentoParametros.test.ts
```

Esperado: FALHA — o arquivo `estoqueFechamentoParametros.ts` não existe.

- [ ] **Step 3: Adicionar a categoria `ESTOQUE` ao tipo compartilhado**

Em `packages/shared/src/types/infra.ts`, linha 79, troque:

```ts
export type CategoriaParametro = 'EMAIL' | 'WHATSAPP' | 'TELEGRAM' | 'TI' | 'SYSEMP' | 'MERCADO_LIVRE';
```

por:

```ts
export type CategoriaParametro =
  | 'EMAIL'
  | 'WHATSAPP'
  | 'TELEGRAM'
  | 'TI'
  | 'SYSEMP'
  | 'MERCADO_LIVRE'
  | 'ESTOQUE';
```

Recompile o shared, senão api e portal continuam vendo o tipo antigo (eles importam pelo `dist`):

```bash
npm run build:shared
```

- [ ] **Step 4: Declarar os campos da categoria**

Em `apps/api/src/services/parametros.ts`, dentro de `DEFINICAO_CAMPOS`, acrescente a entrada `ESTOQUE` depois de `MERCADO_LIVRE`:

```ts
  ESTOQUE: [
    { chave: 'FECHAMENTO_PERCENTUAL_CUSTO_VENDA', sensivel: false },
    { chave: 'FECHAMENTO_ID_TABELA_PRECO', sensivel: false },
  ],
```

- [ ] **Step 5: Escrever a implementação**

Crie `apps/api/src/services/estoqueFechamentoParametros.ts`:

```ts
import { ConfiguracaoAusenteError } from './erros.js';
import { obterParametro } from './parametros.js';

/**
 * Os dois parâmetros do Cálculo de Custo de Fechamento. No portal PHP
 * anterior eram literais no código (`preco / 2` e `id_tb_preco = 1`);
 * aqui vivem em Configurador → Parâmetros, categoria ESTOQUE.
 *
 * Nada aqui tem default: parâmetro ausente ou inválido **aborta o
 * cálculo** com o nome da chave. Um percentual errado produz um custo
 * errado que ninguém questiona, porque o número continua parecendo
 * razoável. Ver Specs/spec_modulo_estoque.md, seção 3.7.
 */

export interface ParametrosFechamento {
  /** Percentual mesmo: o custo vira `preço × percentual / 100`. */
  percentualCustoVenda: number;
  /** `sysemp_preco.id_tb_preco` da tabela consultada (LUCRO REAL = 1). */
  idTabelaPreco: number;
}

function exigirNumero(valor: string | null, chave: string, valido: (n: number) => boolean): number {
  const texto = valor?.trim() ?? '';
  if (texto === '') {
    throw new ConfiguracaoAusenteError(
      `Parâmetro ${chave} não está preenchido. Configure-o em Configurador → Parâmetros → Estoque.`,
    );
  }

  const numero = Number(texto);
  if (!Number.isFinite(numero) || !valido(numero)) {
    throw new ConfiguracaoAusenteError(
      `Parâmetro ${chave} tem valor inválido ("${texto}"). Corrija-o em Configurador → Parâmetros → Estoque.`,
    );
  }

  return numero;
}

export function interpretarParametrosFechamento(
  percentual: string | null,
  idTabela: string | null,
): ParametrosFechamento {
  return {
    percentualCustoVenda: exigirNumero(
      percentual,
      'FECHAMENTO_PERCENTUAL_CUSTO_VENDA',
      (n) => n > 0 && n <= 100,
    ),
    idTabelaPreco: exigirNumero(idTabela, 'FECHAMENTO_ID_TABELA_PRECO', (n) => Number.isInteger(n) && n > 0),
  };
}

export async function obterParametrosFechamento(): Promise<ParametrosFechamento> {
  const [percentual, idTabela] = await Promise.all([
    obterParametro('ESTOQUE', 'FECHAMENTO_PERCENTUAL_CUSTO_VENDA'),
    obterParametro('ESTOQUE', 'FECHAMENTO_ID_TABELA_PRECO'),
  ]);

  return interpretarParametrosFechamento(percentual, idTabela);
}
```

- [ ] **Step 6: Rodar o teste para ver passar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueFechamentoParametros.test.ts
```

Esperado: PASSA, 12 casos.

- [ ] **Step 7: Semear os parâmetros**

Crie `apps/api/db/030_estoque_fechamento_parametros.sql`:

```sql
-- Parametros do Calculo de Custo de Fechamento.
-- Ver Specs/spec_modulo_estoque.md, secao 3.7.
--
-- Os valores abaixo sao os que o portal PHP anterior tinha fixos no
-- codigo: metade do preco de venda, tabela LUCRO REAL. Semear preserva o
-- comportamento validado em producao; a partir daqui, quem muda a regra e
-- Configurador -> Parametros, nao um deploy.
--
-- INSERT IGNORE, e nao REPLACE: se alguem ja ajustou o valor, reaplicar a
-- migration nao pode desfazer o ajuste.

INSERT IGNORE INTO parametros_sistema (categoria, chave, valor, sensivel)
VALUES
    ('ESTOQUE', 'FECHAMENTO_PERCENTUAL_CUSTO_VENDA', '50', FALSE),
    ('ESTOQUE', 'FECHAMENTO_ID_TABELA_PRECO', '1', FALSE);
```

- [ ] **Step 8: Expor a categoria na tela de Parâmetros**

Em `apps/portal/src/pages/config/ParametrosPage.tsx`, no array `CATEGORIAS` (linha 13), acrescente ao final:

```ts
  { chave: 'ESTOQUE', label: 'Estoque' },
```

- [ ] **Step 9: Aplicar a migration e verificar tudo**

```bash
npm run db:migrate
npm run typecheck
npm run test --workspace=apps/api
```

Esperado: `030_estoque_fechamento_parametros.sql` aplicada; typecheck sem erro nos três workspaces; suíte da API inteira passando.

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/types/infra.ts apps/api/src/services/parametros.ts \
        apps/api/src/services/estoqueFechamentoParametros.ts \
        apps/api/src/services/estoqueFechamentoParametros.test.ts \
        apps/api/db/030_estoque_fechamento_parametros.sql \
        apps/portal/src/pages/config/ParametrosPage.tsx
git commit -m "Percentual do custo de venda e tabela de preco viram parametro do Estoque"
```

---

## Task 3: Leitura de planilha

**Files:**
- Create: `apps/api/src/services/planilha.ts`
- Create: `apps/api/src/services/planilha.test.ts`

**Interfaces:**
- Consumes: `exceljs` (já dependência da API).
- Produces:
  - `class PlanilhaForaDoModeloError extends Error` com `statusCode = 422`
  - `interface PlanilhaLida { cabecalho: string[]; linhas: (string | null)[][] }`
  - `async function lerPlanilha(buffer: Buffer): Promise<PlanilhaLida>`
  - `function mapearColunas(cabecalho: string[], esperadas: readonly string[]): Record<string, number>`
  - `function parsePeriodo(valor: string | null | undefined): string | null`
  - `function parseNumero(valor: string | null | undefined): number | null`
  - `function parseTexto(valor: string | null | undefined): string | null`

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/api/src/services/planilha.test.ts`. Ele monta planilhas de verdade com o próprio exceljs e as lê de volta — não há fixture binário no repositório:

```ts
import ExcelJS from 'exceljs';
import { describe, expect, test } from 'vitest';
import {
  lerPlanilha,
  mapearColunas,
  parseNumero,
  parsePeriodo,
  parseTexto,
  PlanilhaForaDoModeloError,
} from './planilha.js';

/**
 * O cabeçalho é mapeado por NOME, nunca por posição: reordenar colunas na
 * planilha não pode quebrar a importação. Herdado do portal PHP e
 * deliberado. Ver Specs/spec_modulo_estoque.md, seção 3.4.
 */

async function montarPlanilha(linhas: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Plan1');
  for (const linha of linhas) sheet.addRow(linha);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('mapearColunas', () => {
  test('mapeia cada coluna esperada para o seu índice', () => {
    expect(mapearColunas(['A', 'B', 'C'], ['A', 'C'])).toEqual({ A: 0, C: 2 });
  });

  test('cabeçalho fora de ordem funciona igual', () => {
    expect(mapearColunas(['C', 'B', 'A'], ['A', 'B', 'C'])).toEqual({ A: 2, B: 1, C: 0 });
  });

  test('coluna a mais na planilha é ignorada', () => {
    expect(mapearColunas(['A', 'EXTRA', 'B'], ['A', 'B'])).toEqual({ A: 0, B: 2 });
  });

  test('coluna faltando derruba a importação nomeando o que faltou', () => {
    expect(() => mapearColunas(['A'], ['A', 'B', 'C'])).toThrow(PlanilhaForaDoModeloError);
    expect(() => mapearColunas(['A'], ['A', 'B', 'C'])).toThrow(/B, C/);
  });

  test('espaço em volta do nome da coluna não atrapalha', () => {
    expect(mapearColunas(['  A  ', 'B'], ['A', 'B'])).toEqual({ A: 0, B: 1 });
  });
});

describe('parsePeriodo', () => {
  test('converte MM/AAAA no primeiro dia do mês', () => {
    expect(parsePeriodo('07/2026')).toBe('2026-07-01');
  });

  test('aceita mês com um dígito só', () => {
    expect(parsePeriodo('7/2026')).toBe('2026-07-01');
  });

  test('mês fora de 1..12 é inválido', () => {
    expect(parsePeriodo('13/2026')).toBeNull();
    expect(parsePeriodo('0/2026')).toBeNull();
  });

  test('formato diferente de MM/AAAA é inválido', () => {
    expect(parsePeriodo('2026-07')).toBeNull();
    expect(parsePeriodo('julho/2026')).toBeNull();
    expect(parsePeriodo('07/26')).toBeNull();
  });

  test('vazio e nulo são inválidos', () => {
    expect(parsePeriodo('')).toBeNull();
    expect(parsePeriodo(null)).toBeNull();
    expect(parsePeriodo(undefined)).toBeNull();
  });
});

describe('parseNumero', () => {
  test('lê número com ponto decimal', () => {
    expect(parseNumero('12.5')).toBe(12.5);
  });

  test('lê número com vírgula decimal, como o Excel pt-BR escreve', () => {
    expect(parseNumero('12,5')).toBe(12.5);
  });

  test('lê negativo', () => {
    expect(parseNumero('-3')).toBe(-3);
  });

  test('zero é zero, não nulo', () => {
    expect(parseNumero('0')).toBe(0);
  });

  test('vazio vira nulo, não zero', () => {
    expect(parseNumero('')).toBeNull();
    expect(parseNumero(null)).toBeNull();
  });

  test('texto que não é número vira nulo, nunca NaN', () => {
    expect(parseNumero('abc')).toBeNull();
  });
});

describe('parseTexto', () => {
  test('apara espaços', () => {
    expect(parseTexto('  x  ')).toBe('x');
  });

  test('vazio vira nulo', () => {
    expect(parseTexto('   ')).toBeNull();
    expect(parseTexto(null)).toBeNull();
  });
});

describe('lerPlanilha', () => {
  test('devolve o cabeçalho e as linhas seguintes', async () => {
    const buffer = await montarPlanilha([
      ['EMPRESA', 'QTDE'],
      ['JNK', '10'],
      ['CNK2', '20'],
    ]);

    const { cabecalho, linhas } = await lerPlanilha(buffer);

    expect(cabecalho).toEqual(['EMPRESA', 'QTDE']);
    expect(linhas).toEqual([
      ['JNK', '10'],
      ['CNK2', '20'],
    ]);
  });

  test('célula que o Excel guarda como número chega como texto', async () => {
    const buffer = await montarPlanilha([
      ['CD_PRODUTO', 'QTDE'],
      [1234, 10.5],
    ]);

    const { linhas } = await lerPlanilha(buffer);

    expect(linhas[0]).toEqual(['1234', '10.5']);
  });

  test('célula vazia vira nulo, sem deslocar as colunas seguintes', async () => {
    const buffer = await montarPlanilha([
      ['A', 'B', 'C'],
      ['x', null, 'z'],
    ]);

    const { linhas } = await lerPlanilha(buffer);

    expect(linhas[0]).toEqual(['x', null, 'z']);
  });

  test('linha inteiramente vazia é descartada', async () => {
    const buffer = await montarPlanilha([['A'], ['x'], [null], ['y']]);

    const { linhas } = await lerPlanilha(buffer);

    expect(linhas).toEqual([['x'], ['y']]);
  });

  test('planilha sem nenhuma aba é recusada', async () => {
    const workbook = new ExcelJS.Workbook();
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(lerPlanilha(buffer)).rejects.toThrow(PlanilhaForaDoModeloError);
  });

  test('arquivo que não é xlsx é recusado com erro de modelo, não erro interno', async () => {
    await expect(lerPlanilha(Buffer.from('isto nao e uma planilha'))).rejects.toThrow(
      PlanilhaForaDoModeloError,
    );
  });
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

```bash
npm run test --workspace=apps/api -- src/services/planilha.test.ts
```

Esperado: FALHA — `planilha.ts` não existe.

- [ ] **Step 3: Escrever a implementação**

Crie `apps/api/src/services/planilha.ts`:

```ts
import ExcelJS from 'exceljs';

/**
 * Leitura de planilha `.xlsx` das telas de importação do Fechamento de
 * Custo. Ver Specs/spec_modulo_estoque.md, seção 3.4.
 *
 * Substitui o `src/XlsxReader.php` caseiro do portal PHP anterior, que
 * existia só porque aquele projeto não tinha biblioteca de planilha
 * nenhuma. Aqui o exceljs já é dependência, usada nas exportações.
 *
 * Tudo sai como **texto**: o parse de número e de data é responsabilidade
 * de quem importa, que sabe o significado da coluna. Célula que o Excel
 * guardou como número (código de produto sem zero à esquerda, por
 * exemplo) chega igual a uma que ele guardou como texto.
 */

/** Planilha fora do modelo esperado — erro do usuário, não do servidor. */
export class PlanilhaForaDoModeloError extends Error {
  statusCode = 422;
}

export interface PlanilhaLida {
  /** Primeira linha, aparada. */
  cabecalho: string[];
  /** Demais linhas. Célula vazia é `null`, preservando a posição das outras. */
  linhas: (string | null)[][];
}

/**
 * Normaliza o que o exceljs devolve numa célula. O tipo `CellValue` cobre
 * texto, número, data, fórmula (com resultado), hyperlink e rich text — e
 * a planilha real traz vários deles na mesma coluna.
 */
function celulaParaTexto(valor: ExcelJS.CellValue): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'string') return valor.trim() || null;
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (valor instanceof Date) return valor.toISOString();

  if (typeof valor === 'object') {
    if ('richText' in valor) {
      return valor.richText.map((t) => t.text).join('').trim() || null;
    }
    if ('text' in valor && typeof valor.text === 'string') {
      return valor.text.trim() || null;
    }
    if ('result' in valor) {
      return celulaParaTexto(valor.result as ExcelJS.CellValue);
    }
    if ('error' in valor) {
      return null; // #N/D, #VALOR! etc — trata como célula vazia
    }
  }

  return null;
}

export async function lerPlanilha(buffer: Buffer): Promise<PlanilhaLida> {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(buffer);
  } catch {
    // Arquivo corrompido ou que não é xlsx de verdade. Vira erro de
    // modelo (422) e não 500: o problema está no que o usuário mandou.
    throw new PlanilhaForaDoModeloError('Não foi possível ler o arquivo. Ele é mesmo uma planilha .xlsx?');
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new PlanilhaForaDoModeloError('A planilha não tem nenhuma aba.');
  }

  const todas: (string | null)[][] = [];
  const largura = sheet.columnCount;

  sheet.eachRow({ includeEmpty: false }, (row) => {
    const celulas: (string | null)[] = [];
    for (let coluna = 1; coluna <= largura; coluna++) {
      celulas.push(celulaParaTexto(row.getCell(coluna).value));
    }
    // Linha em branco no meio ou no fim do arquivo não é dado.
    if (celulas.some((c) => c !== null)) todas.push(celulas);
  });

  const cabecalho = todas.shift();
  if (!cabecalho) {
    throw new PlanilhaForaDoModeloError('A planilha está vazia — nem o cabeçalho foi encontrado.');
  }

  return { cabecalho: cabecalho.map((c) => c ?? ''), linhas: todas };
}

/**
 * Índice de cada coluna esperada dentro do cabeçalho, **por nome**.
 * Reordenar colunas na planilha não quebra a importação; faltar coluna
 * derruba a importação inteira antes de gravar qualquer linha.
 */
export function mapearColunas(
  cabecalho: string[],
  esperadas: readonly string[],
): Record<string, number> {
  const normalizado = cabecalho.map((c) => c.trim());
  const indices: Record<string, number> = {};
  const faltando: string[] = [];

  for (const nome of esperadas) {
    const posicao = normalizado.indexOf(nome);
    if (posicao === -1) faltando.push(nome);
    else indices[nome] = posicao;
  }

  if (faltando.length > 0) {
    throw new PlanilhaForaDoModeloError(
      `Planilha fora do modelo esperado — colunas não encontradas: ${faltando.join(', ')}.`,
    );
  }

  return indices;
}

/** `MM/AAAA` da planilha para o primeiro dia do mês (`AAAA-MM-01`). */
export function parsePeriodo(valor: string | null | undefined): string | null {
  const texto = valor?.trim() ?? '';
  const partes = /^(\d{1,2})\/(\d{4})$/.exec(texto);
  if (!partes) return null;

  const mes = Number(partes[1]);
  const ano = Number(partes[2]);
  if (mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return null;

  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-01`;
}

/**
 * Número da planilha. Vazio vira `null` e **não** zero — a diferença
 * entre "não informado" e "contou zero" é o que o inventário compara.
 * Aceita vírgula decimal porque o Excel em pt-BR escreve assim quando a
 * célula é texto.
 */
export function parseNumero(valor: string | null | undefined): number | null {
  const texto = valor?.trim() ?? '';
  if (texto === '') return null;

  const numero = Number(texto.replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
}

export function parseTexto(valor: string | null | undefined): string | null {
  return valor?.trim() || null;
}
```

- [ ] **Step 4: Rodar o teste para ver passar**

```bash
npm run test --workspace=apps/api -- src/services/planilha.test.ts
```

Esperado: PASSA, 24 casos.

- [ ] **Step 5: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erro. Atenção ao `noUncheckedIndexedAccess`: `partes[1]` é `string | undefined` para o TypeScript, e `Number(undefined)` é `NaN` — a regex garante que existe, e a faixa de mês/ano rejeita `NaN` de qualquer forma. Se o compilador reclamar, não silencie com `!`; trate o `undefined` explicitamente.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/planilha.ts apps/api/src/services/planilha.test.ts
git commit -m "Leitura de planilha xlsx passa a mapear o cabecalho por nome"
```

---

## Task 4: Log de importação e a tela que o exibe

**Files:**
- Create: `apps/api/src/services/estoqueImportacaoLog.ts`
- Create: `apps/api/src/routes/estoqueImportacaoLogs.ts`
- Modify: `apps/api/src/app.ts` (import e `app.use`)

**Interfaces:**
- Consumes: tabela `estoque_importacao_log` (Task 1).
- Produces:
  - `type TipoImportacao = 'fechamento_estoque' | 'estoque_full' | 'inventario_fisico'`
  - `interface ResultadoImportacao { totalLinhas; inseridas; atualizadas; ignoradas: LinhaIgnorada[]; produtosNaoEncontrados; empresasNaoEncontradas; custoTotal: number | null; periodo: string | null }`
  - `interface LinhaIgnorada { linha: number; motivo: string }`
  - `async function registrarImportacao(conexao: PoolConnection, dados: DadosLog): Promise<void>`
  - `async function listarImportacoes(tipo?: TipoImportacao): Promise<LinhaLog[]>`

  As três tarefas de importação (5, 6 e 7) devolvem `ResultadoImportacao` e chamam `registrarImportacao`.

- [ ] **Step 1: Escrever o serviço**

Crie `apps/api/src/services/estoqueImportacaoLog.ts`:

```ts
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../config/database.js';

/**
 * Histórico das importações de planilha do Fechamento de Custo.
 *
 * É o equivalente do Painel de Integração para upload de arquivo: sem
 * ele, uma importação parcial só aparece semanas depois, num total que
 * não fecha. Ver Specs/spec_modulo_estoque.md, seção 3.10.
 *
 * A gravação acontece **dentro da transação da importação**, e por isso
 * recebe a conexão em vez de usar o pool: importação que rola atrás não
 * pode deixar para trás um log dizendo que deu certo.
 */

export type TipoImportacao = 'fechamento_estoque' | 'estoque_full' | 'inventario_fisico';

export interface LinhaIgnorada {
  /** Número da linha na planilha, contando o cabeçalho como linha 1. */
  linha: number;
  motivo: string;
}

export interface ResultadoImportacao {
  totalLinhas: number;
  inseridas: number;
  atualizadas: number;
  ignoradas: LinhaIgnorada[];
  produtosNaoEncontrados: number;
  empresasNaoEncontradas: number;
  /** Só o Fechamento Mensal soma custo; nas outras planilhas fica nulo. */
  custoTotal: number | null;
  /** Período encontrado na planilha, quando ela tem um só. */
  periodo: string | null;
}

export interface DadosLog extends ResultadoImportacao {
  tipo: TipoImportacao;
  arquivo: string;
  usuarioId: number;
}

/** Quantas linhas ignoradas cabem em `observacoes` antes de virar ruído. */
const IGNORADAS_NO_LOG = 50;

export async function registrarImportacao(conexao: PoolConnection, dados: DadosLog): Promise<void> {
  const observacoes =
    dados.ignoradas.length === 0
      ? null
      : dados.ignoradas
          .slice(0, IGNORADAS_NO_LOG)
          .map((i) => `Linha ${i.linha}: ${i.motivo}`)
          .join('\n') +
        (dados.ignoradas.length > IGNORADAS_NO_LOG
          ? `\n… e mais ${dados.ignoradas.length - IGNORADAS_NO_LOG} linha(s) ignorada(s).`
          : '');

  await conexao.query(
    `INSERT INTO estoque_importacao_log
       (tipo, arquivo, periodo, total_linhas, inseridas, atualizadas, ignoradas,
        produtos_nao_encontrados, empresas_nao_encontradas, custo_total, observacoes, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      dados.tipo,
      dados.arquivo,
      dados.periodo,
      dados.totalLinhas,
      dados.inseridas,
      dados.atualizadas,
      dados.ignoradas.length,
      dados.produtosNaoEncontrados,
      dados.empresasNaoEncontradas,
      dados.custoTotal,
      observacoes,
      dados.usuarioId,
    ],
  );
}

export interface LinhaLog extends RowDataPacket {
  id: number;
  tipo: string;
  arquivo: string | null;
  periodo: string | null;
  total_linhas: number;
  inseridas: number;
  atualizadas: number;
  ignoradas: number;
  produtos_nao_encontrados: number;
  empresas_nao_encontradas: number;
  custo_total: number | null;
  observacoes: string | null;
  usuario: string | null;
  executado_em: string;
}

/** Últimas 300 execuções, como no portal PHP — é histórico, não auditoria paginada. */
export async function listarImportacoes(tipo?: TipoImportacao): Promise<LinhaLog[]> {
  const filtro = tipo ? 'WHERE l.tipo = ?' : '';
  const params = tipo ? [tipo] : [];

  const [linhas] = await pool.query<LinhaLog[]>(
    `SELECT l.id, l.tipo, l.arquivo, l.periodo, l.total_linhas, l.inseridas, l.atualizadas,
            l.ignoradas, l.produtos_nao_encontrados, l.empresas_nao_encontradas,
            l.custo_total, l.observacoes, u.nome AS usuario, l.executado_em
       FROM estoque_importacao_log l
       LEFT JOIN usuarios u ON u.id = l.usuario_id
       ${filtro}
      ORDER BY l.executado_em DESC
      LIMIT 300`,
    params,
  );

  return linhas;
}
```

**Atenção:** confirme o nome da coluna de nome em `usuarios` antes de rodar
(`SHOW COLUMNS FROM usuarios`). Se não for `nome`, ajuste o `SELECT` — não
invente uma coluna.

- [ ] **Step 2: Escrever a rota**

Crie `apps/api/src/routes/estoqueImportacaoLogs.ts`:

```ts
import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { listarImportacoes, type TipoImportacao } from '../services/estoqueImportacaoLog.js';

export const estoqueImportacaoLogsRouter = Router();

const ROTA = '/estoque/fechamento/logs';

const TIPOS_VALIDOS: TipoImportacao[] = ['fechamento_estoque', 'estoque_full', 'inventario_fisico'];

estoqueImportacaoLogsRouter.use(authTenant);

estoqueImportacaoLogsRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const pedido = String(req.query.tipo ?? '');
  // Lista fechada: o valor vem da query string e entra numa cláusula SQL.
  const tipo = TIPOS_VALIDOS.find((t) => t === pedido);

  res.json({ linhas: await listarImportacoes(tipo) });
});
```

- [ ] **Step 3: Montar a rota**

Em `apps/api/src/app.ts`, acrescente o import junto aos demais de estoque (ordem alfabética, como o arquivo já mantém):

```ts
import { estoqueImportacaoLogsRouter } from './routes/estoqueImportacaoLogs.js';
```

e o `app.use` logo abaixo de `/api/estoque/saldos`:

```ts
app.use('/api/estoque/fechamento/logs', estoqueImportacaoLogsRouter);
```

- [ ] **Step 4: Verificar tipos e subir a API**

```bash
npm run typecheck
```

Esperado: sem erro.

```bash
npm run dev:api
```

Esperado: a API sobe na porta 3001 sem erro de import. Encerre com Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/estoqueImportacaoLog.ts \
        apps/api/src/routes/estoqueImportacaoLogs.ts apps/api/src/app.ts
git commit -m "Importacoes de planilha passam a registrar e expor o log de execucao"
```

---

## Task 5: Importar Fechamento Mensal

**Files:**
- Create: `apps/api/src/services/estoqueFechamentoMensal.ts`
- Create: `apps/api/src/services/estoqueFechamentoMensal.test.ts`
- Create: `apps/api/src/routes/estoqueFechamentoImportar.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `lerPlanilha`, `mapearColunas`, `parsePeriodo`, `parseNumero`, `parseTexto`, `PlanilhaForaDoModeloError` (Task 3); `registrarImportacao`, `ResultadoImportacao`, `LinhaIgnorada` (Task 4); `withTransaction` de `../config/database.js`.
- Produces:
  - `interface LinhaFechamentoValida { periodo; empresa; idProduto; codigoAuxiliar; descricao; ncm; unidade; marca; estoque; custo; total; cstVenda }`
  - `function extrairLinhasFechamento(planilha: PlanilhaLida): { validas: LinhaFechamentoValida[]; ignoradas: LinhaIgnorada[] }`
  - `async function importarFechamentoMensal(buffer: Buffer, arquivo: string, usuarioId: number): Promise<ResultadoImportacao>`
  - `const estoqueFechamentoImportarRouter: Router` (as Tasks 6 e 7 acrescentam endpoints a **este mesmo** router)

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/api/src/services/estoqueFechamentoMensal.test.ts`. Testa a extração pura, sem banco:

```ts
import { describe, expect, test } from 'vitest';
import { extrairLinhasFechamento } from './estoqueFechamentoMensal.js';
import { PlanilhaForaDoModeloError, type PlanilhaLida } from './planilha.js';

const CABECALHO = [
  'EMPRESA',
  'ID Produto',
  'Código Auxiliar',
  'Descrição',
  'NCM',
  'Un',
  'Marca',
  'Estoque',
  'Custo',
  'Total',
  'CST Venda',
  'Mês/Ano',
];

function planilha(linhas: (string | null)[][]): PlanilhaLida {
  return { cabecalho: CABECALHO, linhas };
}

const LINHA_OK = [
  'CASA J NAKAO LTDA',
  '4321',
  '0012',
  'PARAFUSO',
  '73181500',
  'UN',
  'ACME',
  '10',
  '2,50',
  '25',
  '000',
  '07/2026',
];

describe('extrairLinhasFechamento', () => {
  test('lê uma linha completa', () => {
    const { validas, ignoradas } = extrairLinhasFechamento(planilha([LINHA_OK]));

    expect(ignoradas).toEqual([]);
    expect(validas[0]).toEqual({
      periodo: '2026-07-01',
      empresa: 'CASA J NAKAO LTDA',
      idProduto: 4321,
      codigoAuxiliar: '0012',
      descricao: 'PARAFUSO',
      ncm: '73181500',
      unidade: 'UN',
      marca: 'ACME',
      estoque: 10,
      custo: 2.5,
      total: 25,
      cstVenda: '000',
    });
  });

  test('preserva zero à esquerda do código auxiliar', () => {
    const { validas } = extrairLinhasFechamento(planilha([LINHA_OK]));

    expect(validas[0]?.codigoAuxiliar).toBe('0012');
  });

  test('cabeçalho fora de ordem funciona igual', () => {
    const invertido = [...CABECALHO].reverse();
    const linhaInvertida = [...LINHA_OK].reverse();

    const { validas } = extrairLinhasFechamento({ cabecalho: invertido, linhas: [linhaInvertida] });

    expect(validas[0]?.idProduto).toBe(4321);
    expect(validas[0]?.periodo).toBe('2026-07-01');
  });

  test('coluna faltando derruba a importação inteira', () => {
    expect(() => extrairLinhasFechamento({ cabecalho: ['EMPRESA'], linhas: [] })).toThrow(
      PlanilhaForaDoModeloError,
    );
  });

  test('empresa vazia ignora a linha, apontando o número na planilha', () => {
    const semEmpresa = [...LINHA_OK];
    semEmpresa[0] = '';

    const { validas, ignoradas } = extrairLinhasFechamento(planilha([semEmpresa]));

    expect(validas).toEqual([]);
    expect(ignoradas).toEqual([{ linha: 2, motivo: 'EMPRESA ou ID Produto vazio/inválido.' }]);
  });

  test('id de produto não numérico ignora a linha', () => {
    const idRuim = [...LINHA_OK];
    idRuim[1] = 'ABC';

    const { ignoradas } = extrairLinhasFechamento(planilha([idRuim]));

    expect(ignoradas[0]?.motivo).toMatch(/ID Produto/);
  });

  test('período inválido ignora a linha com motivo próprio', () => {
    const periodoRuim = [...LINHA_OK];
    periodoRuim[11] = '13/2026';

    const { ignoradas } = extrairLinhasFechamento(planilha([periodoRuim]));

    expect(ignoradas).toEqual([{ linha: 2, motivo: 'Mês/Ano inválido (esperado MM/AAAA).' }]);
  });

  test('o número da linha ignorada conta o cabeçalho como linha 1', () => {
    const ruim = [...LINHA_OK];
    ruim[0] = '';

    const { ignoradas } = extrairLinhasFechamento(planilha([LINHA_OK, LINHA_OK, ruim]));

    expect(ignoradas[0]?.linha).toBe(4);
  });

  test('custo vazio vira nulo, não zero', () => {
    const semCusto = [...LINHA_OK];
    semCusto[8] = '';

    const { validas } = extrairLinhasFechamento(planilha([semCusto]));

    expect(validas[0]?.custo).toBeNull();
  });

  test('linha válida e linha inválida convivem na mesma planilha', () => {
    const ruim = [...LINHA_OK];
    ruim[1] = '';

    const { validas, ignoradas } = extrairLinhasFechamento(planilha([LINHA_OK, ruim]));

    expect(validas).toHaveLength(1);
    expect(ignoradas).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueFechamentoMensal.test.ts
```

Esperado: FALHA — `estoqueFechamentoMensal.ts` não existe.

- [ ] **Step 3: Escrever o serviço**

Crie `apps/api/src/services/estoqueFechamentoMensal.ts`:

```ts
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../config/database.js';
import {
  registrarImportacao,
  type LinhaIgnorada,
  type ResultadoImportacao,
} from './estoqueImportacaoLog.js';
import {
  lerPlanilha,
  mapearColunas,
  parseNumero,
  parsePeriodo,
  parseTexto,
  type PlanilhaLida,
} from './planilha.js';

/**
 * Importação da planilha de Fechamento Mensal (a planilha contábil, que
 * já traz custo próprio). Ver Specs/spec_modulo_estoque.md, seção 3.4.
 *
 * A planilha só traz a razão social em EMPRESA. O `id_empresa` é
 * resolvido **aqui, uma vez**, contra `sysemp_empresa.razao_social`, e o
 * texto original fica gravado como auditoria. No portal PHP anterior esse
 * casamento por nome exato era refeito em cada tela que consumia a
 * tabela.
 *
 * Linha que não bate com o cadastro é importada assim mesmo, só marcada:
 * a informação contábil continua válida ainda que o produto não esteja
 * sincronizado.
 */

const COLUNAS = [
  'EMPRESA',
  'ID Produto',
  'Código Auxiliar',
  'Descrição',
  'NCM',
  'Un',
  'Marca',
  'Estoque',
  'Custo',
  'Total',
  'CST Venda',
  'Mês/Ano',
] as const;

export interface LinhaFechamentoValida {
  periodo: string;
  empresa: string;
  idProduto: number;
  codigoAuxiliar: string | null;
  descricao: string | null;
  ncm: string | null;
  unidade: string | null;
  marca: string | null;
  estoque: number | null;
  custo: number | null;
  total: number | null;
  cstVenda: string | null;
}

export function extrairLinhasFechamento(planilha: PlanilhaLida): {
  validas: LinhaFechamentoValida[];
  ignoradas: LinhaIgnorada[];
} {
  const col = mapearColunas(planilha.cabecalho, COLUNAS);
  const validas: LinhaFechamentoValida[] = [];
  const ignoradas: LinhaIgnorada[] = [];

  planilha.linhas.forEach((linha, i) => {
    const numeroLinha = i + 2; // +1 pela base 1, +1 pelo cabeçalho
    const em = (nome: string): string | null => linha[col[nome] ?? -1] ?? null;

    const empresa = parseTexto(em('EMPRESA'));
    const idBruto = parseTexto(em('ID Produto'));
    const periodo = parsePeriodo(em('Mês/Ano'));

    if (!empresa || !idBruto || !/^\d+$/.test(idBruto)) {
      ignoradas.push({ linha: numeroLinha, motivo: 'EMPRESA ou ID Produto vazio/inválido.' });
      return;
    }
    if (!periodo) {
      ignoradas.push({ linha: numeroLinha, motivo: 'Mês/Ano inválido (esperado MM/AAAA).' });
      return;
    }

    validas.push({
      periodo,
      empresa,
      idProduto: Number(idBruto),
      codigoAuxiliar: parseTexto(em('Código Auxiliar')),
      descricao: parseTexto(em('Descrição')),
      ncm: parseTexto(em('NCM')),
      unidade: parseTexto(em('Un')),
      marca: parseTexto(em('Marca')),
      estoque: parseNumero(em('Estoque')),
      custo: parseNumero(em('Custo')),
      total: parseNumero(em('Total')),
      cstVenda: parseTexto(em('CST Venda')),
    });
  });

  return { validas, ignoradas };
}

/** Razão social (aparada) → id_empresa, para as empresas citadas na planilha. */
async function resolverEmpresas(
  conexao: PoolConnection,
  razoesSociais: string[],
): Promise<Map<string, number>> {
  if (razoesSociais.length === 0) return new Map();

  const marcadores = razoesSociais.map(() => '?').join(',');
  const [linhas] = await conexao.query<RowDataPacket[]>(
    `SELECT id_empresa, TRIM(razao_social) AS razao_social
       FROM sysemp_empresa WHERE TRIM(razao_social) IN (${marcadores})`,
    razoesSociais,
  );

  return new Map(linhas.map((l) => [String(l.razao_social), Number(l.id_empresa)]));
}

async function resolverProdutos(conexao: PoolConnection, ids: number[]): Promise<Set<number>> {
  const encontrados = new Set<number>();
  for (let i = 0; i < ids.length; i += 1000) {
    const bloco = ids.slice(i, i + 1000);
    const marcadores = bloco.map(() => '?').join(',');
    const [linhas] = await conexao.query<RowDataPacket[]>(
      `SELECT id_produto FROM sysemp_produto WHERE id_produto IN (${marcadores})`,
      bloco,
    );
    for (const l of linhas) encontrados.add(Number(l.id_produto));
  }
  return encontrados;
}

export async function importarFechamentoMensal(
  buffer: Buffer,
  arquivo: string,
  usuarioId: number,
): Promise<ResultadoImportacao> {
  const planilha = await lerPlanilha(buffer);
  const { validas, ignoradas } = extrairLinhasFechamento(planilha);

  return withTransaction(async (conexao) => {
    const empresas = await resolverEmpresas(conexao, [...new Set(validas.map((l) => l.empresa))]);
    const produtos = await resolverProdutos(conexao, [...new Set(validas.map((l) => l.idProduto))]);

    let inseridas = 0;
    let atualizadas = 0;
    let produtosNaoEncontrados = 0;
    let empresasNaoEncontradas = 0;
    let custoTotal = 0;

    for (const linha of validas) {
      const idEmpresa = empresas.get(linha.empresa) ?? null;
      const produtoEncontrado = produtos.has(linha.idProduto);
      if (idEmpresa === null) empresasNaoEncontradas++;
      if (!produtoEncontrado) produtosNaoEncontrados++;
      custoTotal += linha.total ?? 0;

      // `affectedRows` do MySQL num upsert: 1 = inseriu, 2 = atualizou,
      // 0 = a linha já estava idêntica (reenvio da mesma planilha).
      const [resultado] = await conexao.query<RowDataPacket[] & { affectedRows: number }>(
        `INSERT INTO estoque_fechamento_mensal
           (periodo, empresa, id_empresa, id_produto, codigo_auxiliar, descricao, ncm, unidade,
            marca, estoque, custo, total, cst_venda, produto_encontrado, empresa_encontrada)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           id_empresa = VALUES(id_empresa), codigo_auxiliar = VALUES(codigo_auxiliar),
           descricao = VALUES(descricao), ncm = VALUES(ncm), unidade = VALUES(unidade),
           marca = VALUES(marca), estoque = VALUES(estoque), custo = VALUES(custo),
           total = VALUES(total), cst_venda = VALUES(cst_venda),
           produto_encontrado = VALUES(produto_encontrado),
           empresa_encontrada = VALUES(empresa_encontrada)`,
        [
          linha.periodo,
          linha.empresa,
          idEmpresa,
          linha.idProduto,
          linha.codigoAuxiliar,
          linha.descricao,
          linha.ncm,
          linha.unidade,
          linha.marca,
          linha.estoque,
          linha.custo,
          linha.total,
          linha.cstVenda,
          produtoEncontrado,
          idEmpresa !== null,
        ],
      );

      if (resultado.affectedRows === 1) inseridas++;
      else atualizadas++;
    }

    const periodos = new Set(validas.map((l) => l.periodo));
    const resultado: ResultadoImportacao = {
      totalLinhas: planilha.linhas.length,
      inseridas,
      atualizadas,
      ignoradas,
      produtosNaoEncontrados,
      empresasNaoEncontradas,
      custoTotal: validas.length > 0 ? custoTotal : null,
      periodo: periodos.size === 1 ? ([...periodos][0] ?? null) : null,
    };

    await registrarImportacao(conexao, {
      ...resultado,
      tipo: 'fechamento_estoque',
      arquivo,
      usuarioId,
    });

    return resultado;
  });
}
```

- [ ] **Step 4: Rodar o teste para ver passar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueFechamentoMensal.test.ts
```

Esperado: PASSA, 10 casos.

- [ ] **Step 5: Escrever a rota**

Crie `apps/api/src/routes/estoqueFechamentoImportar.ts`. As Tasks 6 e 7 acrescentam endpoints **a este mesmo arquivo**:

```ts
import { Router } from 'express';
import multer from 'multer';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { importarFechamentoMensal } from '../services/estoqueFechamentoMensal.js';
import { PlanilhaForaDoModeloError } from '../services/planilha.js';

export const estoqueFechamentoImportarRouter = Router();

/**
 * As três telas de upload do Fechamento de Custo. Cada endpoint declara a
 * `ROTA` da **sua** tela: permissão de importar fechamento não libera
 * importar inventário.
 *
 * Gate por permissão e não por escopo de empresa — a planilha traz várias
 * empresas por natureza, e importar é operação administrativa, não
 * consulta. Ver Specs/spec_modulo_estoque.md, seção 3.6.
 */

const ROTA_FECHAMENTO = '/estoque/fechamento/importar';

// 25MB: o modelo de inventário físico usado em produção
// (EstoqueFinal_NK2_202608_V01.xlsx) tem 9,4MB, então o teto de 8MB das
// fotos de equipamento de TI não serve aqui.
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } });

estoqueFechamentoImportarRouter.use(authTenant);

/** Valida o arquivo enviado e devolve o buffer, ou lança 422 com a razão. */
function exigirPlanilha(arquivo: Express.Multer.File | undefined): Express.Multer.File {
  if (!arquivo) {
    throw new PlanilhaForaDoModeloError('Selecione um arquivo .xlsx antes de importar.');
  }
  if (!/\.xlsx$/i.test(arquivo.originalname)) {
    throw new PlanilhaForaDoModeloError('O arquivo precisa ser uma planilha .xlsx (Excel).');
  }
  return arquivo;
}

estoqueFechamentoImportarRouter.post(
  '/fechamento-mensal',
  requirePermissao(ROTA_FECHAMENTO, 'podeIncluir'),
  upload.single('arquivo'),
  async (req, res) => {
    const arquivo = exigirPlanilha(req.file);
    res.json(await importarFechamentoMensal(arquivo.buffer, arquivo.originalname, req.usuario!.id));
  },
);
```

- [ ] **Step 6: Montar a rota**

Em `apps/api/src/app.ts`, acrescente:

```ts
import { estoqueFechamentoImportarRouter } from './routes/estoqueFechamentoImportar.js';
```

e, junto aos demais `app.use` de estoque:

```ts
app.use('/api/estoque/fechamento/importar', estoqueFechamentoImportarRouter);
```

- [ ] **Step 7: Confirmar que a ação `podeIncluir` existe**

O `AcaoPermissao` do `packages/shared` precisa ter `podeIncluir`. Verifique:

```bash
grep -rn "AcaoPermissao" packages/shared/src/types/infra.ts
```

Se o nome da ação de inclusão for outro (`podeCriar`, por exemplo), use o
que existe **em todas** as rotas deste plano e anote a troca no spec, seção
3.2, no mesmo commit.

- [ ] **Step 8: Verificar**

```bash
npm run typecheck
npm run test --workspace=apps/api
```

Esperado: sem erro de tipo; suíte inteira passando.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/estoqueFechamentoMensal.ts \
        apps/api/src/services/estoqueFechamentoMensal.test.ts \
        apps/api/src/routes/estoqueFechamentoImportar.ts apps/api/src/app.ts
git commit -m "Fechamento Mensal passa a ser importado por planilha, resolvendo a empresa na entrada"
```

---

## Task 6: Importar Estoque FULL

**Files:**
- Create: `apps/api/src/services/estoqueFullImportado.ts`
- Create: `apps/api/src/services/estoqueFullImportado.test.ts`
- Modify: `apps/api/src/routes/estoqueFechamentoImportar.ts` (novo endpoint no router existente)

**Interfaces:**
- Consumes: os mesmos utilitários da Task 3 e o `registrarImportacao` da Task 4.
- Produces:
  - `interface LinhaFullValida { periodo; idEmpresa; conta; tipoSaldo; cdProduto; qtde }`
  - `function normalizarTipoSaldo(valor: string | null): string`
  - `function extrairLinhasFull(planilha: PlanilhaLida): { validas: LinhaFullValida[]; ignoradas: LinhaIgnorada[] }`
  - `async function importarEstoqueFull(buffer: Buffer, arquivo: string, usuarioId: number): Promise<ResultadoImportacao>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/api/src/services/estoqueFullImportado.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { extrairLinhasFull, normalizarTipoSaldo } from './estoqueFullImportado.js';
import { PlanilhaForaDoModeloError, type PlanilhaLida } from './planilha.js';

const CABECALHO = ['ID_EMPRESA', 'CONTA', 'PERIODO', 'TIPO_SALDO', 'CD_PRODUTO', 'DC_PRODUTO', 'QTDE'];

function planilha(linhas: (string | null)[][]): PlanilhaLida {
  return { cabecalho: CABECALHO, linhas };
}

const LINHA_OK = ['7', 'SHOPEE', '07/2026', 'Aptas para venda', '0012', 'PARAFUSO', '10'];

describe('normalizarTipoSaldo', () => {
  test('vazio vira Disponível para Faturamento', () => {
    expect(normalizarTipoSaldo('')).toBe('Disponível para Faturamento');
    expect(normalizarTipoSaldo(null)).toBe('Disponível para Faturamento');
  });

  test('traço vira Disponível para Faturamento', () => {
    expect(normalizarTipoSaldo('-')).toBe('Disponível para Faturamento');
  });

  test('classificação de verdade é preservada', () => {
    expect(normalizarTipoSaldo('Extraviadas')).toBe('Extraviadas');
  });
});

describe('extrairLinhasFull', () => {
  test('lê uma linha completa', () => {
    const { validas, ignoradas } = extrairLinhasFull(planilha([LINHA_OK]));

    expect(ignoradas).toEqual([]);
    expect(validas[0]).toEqual({
      periodo: '2026-07-01',
      idEmpresa: 7,
      conta: 'SHOPEE',
      tipoSaldo: 'Aptas para venda',
      cdProduto: '0012',
      qtde: 10,
    });
  });

  test('DC_PRODUTO é exigida no cabeçalho mas não é lida', () => {
    const { validas } = extrairLinhasFull(planilha([LINHA_OK]));

    expect(Object.keys(validas[0] ?? {})).not.toContain('descricao');
  });

  test('cabeçalho sem DC_PRODUTO derruba a importação', () => {
    const semDc = CABECALHO.filter((c) => c !== 'DC_PRODUTO');

    expect(() => extrairLinhasFull({ cabecalho: semDc, linhas: [] })).toThrow(PlanilhaForaDoModeloError);
  });

  test('mesmo produto com tipos de saldo diferentes gera duas linhas', () => {
    const extraviada = [...LINHA_OK];
    extraviada[3] = 'Extraviadas';

    const { validas } = extrairLinhasFull(planilha([LINHA_OK, extraviada]));

    expect(validas).toHaveLength(2);
    expect(validas.map((l) => l.tipoSaldo)).toEqual(['Aptas para venda', 'Extraviadas']);
  });

  test('id de empresa não numérico ignora a linha', () => {
    const ruim = [...LINHA_OK];
    ruim[0] = 'JNK';

    const { validas, ignoradas } = extrairLinhasFull(planilha([ruim]));

    expect(validas).toEqual([]);
    expect(ignoradas).toEqual([
      { linha: 2, motivo: 'ID_EMPRESA, CONTA ou CD_PRODUTO vazio/inválido.' },
    ]);
  });

  test('conta vazia ignora a linha', () => {
    const ruim = [...LINHA_OK];
    ruim[1] = '';

    expect(extrairLinhasFull(planilha([ruim])).ignoradas).toHaveLength(1);
  });

  test('período inválido ignora a linha com motivo próprio', () => {
    const ruim = [...LINHA_OK];
    ruim[2] = '2026-07';

    expect(extrairLinhasFull(planilha([ruim])).ignoradas[0]?.motivo).toBe(
      'PERIODO inválido (esperado MM/AAAA).',
    );
  });

  test('quantidade vazia vira nulo, não zero', () => {
    const semQtde = [...LINHA_OK];
    semQtde[6] = '';

    expect(extrairLinhasFull(planilha([semQtde])).validas[0]?.qtde).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueFullImportado.test.ts
```

Esperado: FALHA — o arquivo não existe.

- [ ] **Step 3: Escrever o serviço**

Crie `apps/api/src/services/estoqueFullImportado.ts`:

```ts
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../config/database.js';
import {
  registrarImportacao,
  type LinhaIgnorada,
  type ResultadoImportacao,
} from './estoqueImportacaoLog.js';
import {
  lerPlanilha,
  mapearColunas,
  parseNumero,
  parsePeriodo,
  parseTexto,
  type PlanilhaLida,
} from './planilha.js';

/**
 * Importação da planilha de Estoque FULL — o saldo por conta/canal
 * (Amazon, Shopee, Axado, lojas físicas). Ver
 * Specs/spec_modulo_estoque.md, seção 3.4.
 *
 * Diferente do Fechamento Mensal, esta planilha **só tem quantidade**:
 * o custo é atribuído depois, no Cálculo de Custo.
 *
 * `DC_PRODUTO` é exigida no cabeçalho mas não é gravada — a descrição de
 * referência é a do cadastro (`sysemp_produto`), não a que alguém digitou
 * na planilha.
 */

const COLUNAS = ['ID_EMPRESA', 'CONTA', 'PERIODO', 'TIPO_SALDO', 'CD_PRODUTO', 'DC_PRODUTO', 'QTDE'] as const;

export interface LinhaFullValida {
  periodo: string;
  idEmpresa: number;
  conta: string;
  tipoSaldo: string;
  cdProduto: string;
  qtde: number | null;
}

/** Vazio ou "-" na planilha significa saldo sem classificação específica. */
export function normalizarTipoSaldo(valor: string | null): string {
  const texto = valor?.trim() ?? '';
  return texto === '' || texto === '-' ? 'Disponível para Faturamento' : texto;
}

export function extrairLinhasFull(planilha: PlanilhaLida): {
  validas: LinhaFullValida[];
  ignoradas: LinhaIgnorada[];
} {
  const col = mapearColunas(planilha.cabecalho, COLUNAS);
  const validas: LinhaFullValida[] = [];
  const ignoradas: LinhaIgnorada[] = [];

  planilha.linhas.forEach((linha, i) => {
    const numeroLinha = i + 2;
    const em = (nome: string): string | null => linha[col[nome] ?? -1] ?? null;

    const idBruto = parseTexto(em('ID_EMPRESA'));
    const conta = parseTexto(em('CONTA'));
    const cdProduto = parseTexto(em('CD_PRODUTO'));
    const periodo = parsePeriodo(em('PERIODO'));

    if (!idBruto || !/^\d+$/.test(idBruto) || !conta || !cdProduto) {
      ignoradas.push({ linha: numeroLinha, motivo: 'ID_EMPRESA, CONTA ou CD_PRODUTO vazio/inválido.' });
      return;
    }
    if (!periodo) {
      ignoradas.push({ linha: numeroLinha, motivo: 'PERIODO inválido (esperado MM/AAAA).' });
      return;
    }

    validas.push({
      periodo,
      idEmpresa: Number(idBruto),
      conta,
      tipoSaldo: normalizarTipoSaldo(em('TIPO_SALDO')),
      cdProduto,
      qtde: parseNumero(em('QTDE')),
    });
  });

  return { validas, ignoradas };
}

async function codigosExistentes(conexao: PoolConnection, codigos: string[]): Promise<Set<string>> {
  const encontrados = new Set<string>();
  for (let i = 0; i < codigos.length; i += 1000) {
    const bloco = codigos.slice(i, i + 1000);
    const marcadores = bloco.map(() => '?').join(',');
    const [linhas] = await conexao.query<RowDataPacket[]>(
      `SELECT codigo_auxiliar FROM sysemp_produto WHERE codigo_auxiliar IN (${marcadores})`,
      bloco,
    );
    for (const l of linhas) encontrados.add(String(l.codigo_auxiliar));
  }
  return encontrados;
}

async function empresasExistentes(conexao: PoolConnection, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const marcadores = ids.map(() => '?').join(',');
  const [linhas] = await conexao.query<RowDataPacket[]>(
    `SELECT id_empresa FROM sysemp_empresa WHERE id_empresa IN (${marcadores})`,
    ids,
  );
  return new Set(linhas.map((l) => Number(l.id_empresa)));
}

export async function importarEstoqueFull(
  buffer: Buffer,
  arquivo: string,
  usuarioId: number,
): Promise<ResultadoImportacao> {
  const planilha = await lerPlanilha(buffer);
  const { validas, ignoradas } = extrairLinhasFull(planilha);

  return withTransaction(async (conexao) => {
    const produtos = await codigosExistentes(conexao, [...new Set(validas.map((l) => l.cdProduto))]);
    const empresas = await empresasExistentes(conexao, [...new Set(validas.map((l) => l.idEmpresa))]);

    let inseridas = 0;
    let atualizadas = 0;
    let produtosNaoEncontrados = 0;
    let empresasNaoEncontradas = 0;

    for (const linha of validas) {
      const produtoEncontrado = produtos.has(linha.cdProduto);
      const empresaEncontrada = empresas.has(linha.idEmpresa);
      if (!produtoEncontrado) produtosNaoEncontrados++;
      if (!empresaEncontrada) empresasNaoEncontradas++;

      const [resultado] = await conexao.query<RowDataPacket[] & { affectedRows: number }>(
        `INSERT INTO estoque_full_importado
           (periodo, id_empresa, conta, tipo_saldo, cd_produto, qtde, produto_encontrado, empresa_encontrada)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           qtde = VALUES(qtde),
           produto_encontrado = VALUES(produto_encontrado),
           empresa_encontrada = VALUES(empresa_encontrada)`,
        [
          linha.periodo,
          linha.idEmpresa,
          linha.conta,
          linha.tipoSaldo,
          linha.cdProduto,
          linha.qtde,
          produtoEncontrado,
          empresaEncontrada,
        ],
      );

      if (resultado.affectedRows === 1) inseridas++;
      else atualizadas++;
    }

    const periodos = new Set(validas.map((l) => l.periodo));
    const resultado: ResultadoImportacao = {
      totalLinhas: planilha.linhas.length,
      inseridas,
      atualizadas,
      ignoradas,
      produtosNaoEncontrados,
      empresasNaoEncontradas,
      custoTotal: null, // esta planilha não tem custo
      periodo: periodos.size === 1 ? ([...periodos][0] ?? null) : null,
    };

    await registrarImportacao(conexao, { ...resultado, tipo: 'estoque_full', arquivo, usuarioId });

    return resultado;
  });
}
```

- [ ] **Step 4: Rodar o teste para ver passar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueFullImportado.test.ts
```

Esperado: PASSA, 11 casos.

- [ ] **Step 5: Acrescentar o endpoint**

Em `apps/api/src/routes/estoqueFechamentoImportar.ts`, acrescente o import:

```ts
import { importarEstoqueFull } from '../services/estoqueFullImportado.js';
```

a constante de rota, junto de `ROTA_FECHAMENTO`:

```ts
const ROTA_ESTOQUE_FULL = '/estoque/fechamento/estoque-full';
```

e o endpoint, ao final do arquivo:

```ts
estoqueFechamentoImportarRouter.post(
  '/estoque-full',
  requirePermissao(ROTA_ESTOQUE_FULL, 'podeIncluir'),
  upload.single('arquivo'),
  async (req, res) => {
    const arquivo = exigirPlanilha(req.file);
    res.json(await importarEstoqueFull(arquivo.buffer, arquivo.originalname, req.usuario!.id));
  },
);
```

- [ ] **Step 6: Verificar**

```bash
npm run typecheck
npm run test --workspace=apps/api
```

Esperado: sem erro; suíte inteira passando.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/estoqueFullImportado.ts \
        apps/api/src/services/estoqueFullImportado.test.ts \
        apps/api/src/routes/estoqueFechamentoImportar.ts
git commit -m "Estoque FULL passa a ser importado por planilha, com conta e tipo de saldo na chave"
```

---

## Task 7: Importar Inventário Físico

**Files:**
- Create: `apps/api/src/services/estoqueInventarioFisico.ts`
- Create: `apps/api/src/services/estoqueInventarioFisico.test.ts`
- Modify: `apps/api/src/routes/estoqueFechamentoImportar.ts`

**Interfaces:**
- Consumes: os mesmos utilitários das Tasks 3 e 4.
- Produces:
  - `interface LinhaInventarioValida { periodo; idEmpresa; cdProduto; almox; marca; contagem1..5; contagemFinal; saldoSysemp; divergencia; analise; acao }`
  - `function extrairLinhasInventario(planilha: PlanilhaLida): { validas: LinhaInventarioValida[]; ignoradas: LinhaIgnorada[] }`
  - `async function importarInventarioFisico(buffer: Buffer, arquivo: string, usuarioId: number): Promise<ResultadoImportacao>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/api/src/services/estoqueInventarioFisico.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { extrairLinhasInventario } from './estoqueInventarioFisico.js';
import { PlanilhaForaDoModeloError, type PlanilhaLida } from './planilha.js';

const CABECALHO = [
  'ID_EMPRESA', 'PERIODO', 'CD_PRODUTO', 'DC_PRODUTO', 'MARCA', 'ALMOX',
  'CONTAGEM_1', 'CONTAGEM_2', 'CONTAGEM_3', 'CONTAGEM_4', 'CONTAGEM_5',
  'CONTAGEM_FINAL', 'SALDO_SYSEMP', 'DIVERGENCIA', 'ANALISE', 'ACAO',
];

function planilha(linhas: (string | null)[][]): PlanilhaLida {
  return { cabecalho: CABECALHO, linhas };
}

const LINHA_OK = [
  '7', '07/2026', '0012', 'PARAFUSO', 'ACME', 'PRINCIPAL',
  '10', '11', '10', '', '', '10', '12', '-2', 'Recontar', 'Ajustar no ERP',
];

describe('extrairLinhasInventario', () => {
  test('lê uma linha completa', () => {
    const { validas, ignoradas } = extrairLinhasInventario(planilha([LINHA_OK]));

    expect(ignoradas).toEqual([]);
    expect(validas[0]).toEqual({
      periodo: '2026-07-01',
      idEmpresa: 7,
      cdProduto: '0012',
      almox: 'PRINCIPAL',
      marca: 'ACME',
      contagem1: 10,
      contagem2: 11,
      contagem3: 10,
      contagem4: null,
      contagem5: null,
      contagemFinal: 10,
      saldoSysemp: 12,
      divergencia: -2,
      analise: 'Recontar',
      acao: 'Ajustar no ERP',
    });
  });

  test('divergência negativa é preservada com o sinal', () => {
    expect(extrairLinhasInventario(planilha([LINHA_OK])).validas[0]?.divergencia).toBe(-2);
  });

  test('rodada de contagem não feita vira nulo, não zero', () => {
    const { validas } = extrairLinhasInventario(planilha([LINHA_OK]));

    expect(validas[0]?.contagem4).toBeNull();
    expect(validas[0]?.contagem5).toBeNull();
  });

  test('contagem final zero é zero, e não ausência de contagem', () => {
    const zerada = [...LINHA_OK];
    zerada[11] = '0';

    expect(extrairLinhasInventario(planilha([zerada])).validas[0]?.contagemFinal).toBe(0);
  });

  test('mesmo produto em almoxarifados diferentes gera duas linhas', () => {
    const avarias = [...LINHA_OK];
    avarias[5] = 'AVARIAS';

    const { validas } = extrairLinhasInventario(planilha([LINHA_OK, avarias]));

    expect(validas.map((l) => l.almox)).toEqual(['PRINCIPAL', 'AVARIAS']);
  });

  test('almoxarifado vazio vira string vazia, que é o default da coluna', () => {
    const semAlmox = [...LINHA_OK];
    semAlmox[5] = '';

    expect(extrairLinhasInventario(planilha([semAlmox])).validas[0]?.almox).toBe('');
  });

  test('coluna faltando derruba a importação', () => {
    const semAcao = CABECALHO.filter((c) => c !== 'ACAO');

    expect(() => extrairLinhasInventario({ cabecalho: semAcao, linhas: [] })).toThrow(
      PlanilhaForaDoModeloError,
    );
  });

  test('id de empresa não numérico ignora a linha', () => {
    const ruim = [...LINHA_OK];
    ruim[0] = '';

    expect(extrairLinhasInventario(planilha([ruim])).ignoradas).toEqual([
      { linha: 2, motivo: 'ID_EMPRESA ou CD_PRODUTO vazio/inválido.' },
    ]);
  });

  test('período inválido ignora a linha com motivo próprio', () => {
    const ruim = [...LINHA_OK];
    ruim[1] = 'julho';

    expect(extrairLinhasInventario(planilha([ruim])).ignoradas[0]?.motivo).toBe(
      'PERIODO inválido (esperado MM/AAAA).',
    );
  });
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueInventarioFisico.test.ts
```

Esperado: FALHA — o arquivo não existe.

- [ ] **Step 3: Escrever o serviço**

Crie `apps/api/src/services/estoqueInventarioFisico.ts`:

```ts
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { withTransaction } from '../config/database.js';
import {
  registrarImportacao,
  type LinhaIgnorada,
  type ResultadoImportacao,
} from './estoqueImportacaoLog.js';
import {
  lerPlanilha,
  mapearColunas,
  parseNumero,
  parsePeriodo,
  parseTexto,
  type PlanilhaLida,
} from './planilha.js';

/**
 * Importação da planilha de Inventário Físico — a contagem física, com
 * até cinco rodadas mais a final. Ver Specs/spec_modulo_estoque.md,
 * seção 3.4.
 *
 * `almox` entra na chave porque PRINCIPAL e AVARIAS contam o mesmo
 * produto separadamente. O Fechamento contábil não distingue
 * almoxarifado, e é isso que obriga o comparativo (seção 3.9) a somar os
 * almoxarifados antes de comparar.
 */

const COLUNAS = [
  'ID_EMPRESA', 'PERIODO', 'CD_PRODUTO', 'DC_PRODUTO', 'MARCA', 'ALMOX',
  'CONTAGEM_1', 'CONTAGEM_2', 'CONTAGEM_3', 'CONTAGEM_4', 'CONTAGEM_5',
  'CONTAGEM_FINAL', 'SALDO_SYSEMP', 'DIVERGENCIA', 'ANALISE', 'ACAO',
] as const;

export interface LinhaInventarioValida {
  periodo: string;
  idEmpresa: number;
  cdProduto: string;
  almox: string;
  marca: string | null;
  contagem1: number | null;
  contagem2: number | null;
  contagem3: number | null;
  contagem4: number | null;
  contagem5: number | null;
  contagemFinal: number | null;
  saldoSysemp: number | null;
  divergencia: number | null;
  analise: string | null;
  acao: string | null;
}

export function extrairLinhasInventario(planilha: PlanilhaLida): {
  validas: LinhaInventarioValida[];
  ignoradas: LinhaIgnorada[];
} {
  const col = mapearColunas(planilha.cabecalho, COLUNAS);
  const validas: LinhaInventarioValida[] = [];
  const ignoradas: LinhaIgnorada[] = [];

  planilha.linhas.forEach((linha, i) => {
    const numeroLinha = i + 2;
    const em = (nome: string): string | null => linha[col[nome] ?? -1] ?? null;

    const idBruto = parseTexto(em('ID_EMPRESA'));
    const cdProduto = parseTexto(em('CD_PRODUTO'));
    const periodo = parsePeriodo(em('PERIODO'));

    if (!idBruto || !/^\d+$/.test(idBruto) || !cdProduto) {
      ignoradas.push({ linha: numeroLinha, motivo: 'ID_EMPRESA ou CD_PRODUTO vazio/inválido.' });
      return;
    }
    if (!periodo) {
      ignoradas.push({ linha: numeroLinha, motivo: 'PERIODO inválido (esperado MM/AAAA).' });
      return;
    }

    validas.push({
      periodo,
      idEmpresa: Number(idBruto),
      cdProduto,
      // A coluna tem DEFAULT '' e entra na chave única: nulo aqui
      // impediria a deduplicação de quem não informa almoxarifado.
      almox: parseTexto(em('ALMOX')) ?? '',
      marca: parseTexto(em('MARCA')),
      contagem1: parseNumero(em('CONTAGEM_1')),
      contagem2: parseNumero(em('CONTAGEM_2')),
      contagem3: parseNumero(em('CONTAGEM_3')),
      contagem4: parseNumero(em('CONTAGEM_4')),
      contagem5: parseNumero(em('CONTAGEM_5')),
      contagemFinal: parseNumero(em('CONTAGEM_FINAL')),
      saldoSysemp: parseNumero(em('SALDO_SYSEMP')),
      divergencia: parseNumero(em('DIVERGENCIA')),
      analise: parseTexto(em('ANALISE')),
      acao: parseTexto(em('ACAO')),
    });
  });

  return { validas, ignoradas };
}

async function codigosExistentes(conexao: PoolConnection, codigos: string[]): Promise<Set<string>> {
  const encontrados = new Set<string>();
  for (let i = 0; i < codigos.length; i += 1000) {
    const bloco = codigos.slice(i, i + 1000);
    const marcadores = bloco.map(() => '?').join(',');
    const [linhas] = await conexao.query<RowDataPacket[]>(
      `SELECT codigo_auxiliar FROM sysemp_produto WHERE codigo_auxiliar IN (${marcadores})`,
      bloco,
    );
    for (const l of linhas) encontrados.add(String(l.codigo_auxiliar));
  }
  return encontrados;
}

async function empresasExistentes(conexao: PoolConnection, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const marcadores = ids.map(() => '?').join(',');
  const [linhas] = await conexao.query<RowDataPacket[]>(
    `SELECT id_empresa FROM sysemp_empresa WHERE id_empresa IN (${marcadores})`,
    ids,
  );
  return new Set(linhas.map((l) => Number(l.id_empresa)));
}

export async function importarInventarioFisico(
  buffer: Buffer,
  arquivo: string,
  usuarioId: number,
): Promise<ResultadoImportacao> {
  const planilha = await lerPlanilha(buffer);
  const { validas, ignoradas } = extrairLinhasInventario(planilha);

  return withTransaction(async (conexao) => {
    const produtos = await codigosExistentes(conexao, [...new Set(validas.map((l) => l.cdProduto))]);
    const empresas = await empresasExistentes(conexao, [...new Set(validas.map((l) => l.idEmpresa))]);

    let inseridas = 0;
    let atualizadas = 0;
    let produtosNaoEncontrados = 0;
    let empresasNaoEncontradas = 0;

    for (const linha of validas) {
      const produtoEncontrado = produtos.has(linha.cdProduto);
      const empresaEncontrada = empresas.has(linha.idEmpresa);
      if (!produtoEncontrado) produtosNaoEncontrados++;
      if (!empresaEncontrada) empresasNaoEncontradas++;

      const [resultado] = await conexao.query<RowDataPacket[] & { affectedRows: number }>(
        `INSERT INTO estoque_inventario_fisico
           (periodo, id_empresa, cd_produto, almox, marca, contagem_1, contagem_2, contagem_3,
            contagem_4, contagem_5, contagem_final, saldo_sysemp, divergencia, analise, acao,
            produto_encontrado, empresa_encontrada)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           marca = VALUES(marca), contagem_1 = VALUES(contagem_1), contagem_2 = VALUES(contagem_2),
           contagem_3 = VALUES(contagem_3), contagem_4 = VALUES(contagem_4),
           contagem_5 = VALUES(contagem_5), contagem_final = VALUES(contagem_final),
           saldo_sysemp = VALUES(saldo_sysemp), divergencia = VALUES(divergencia),
           analise = VALUES(analise), acao = VALUES(acao),
           produto_encontrado = VALUES(produto_encontrado),
           empresa_encontrada = VALUES(empresa_encontrada)`,
        [
          linha.periodo, linha.idEmpresa, linha.cdProduto, linha.almox, linha.marca,
          linha.contagem1, linha.contagem2, linha.contagem3, linha.contagem4, linha.contagem5,
          linha.contagemFinal, linha.saldoSysemp, linha.divergencia, linha.analise, linha.acao,
          produtoEncontrado, empresaEncontrada,
        ],
      );

      if (resultado.affectedRows === 1) inseridas++;
      else atualizadas++;
    }

    const periodos = new Set(validas.map((l) => l.periodo));
    const resultado: ResultadoImportacao = {
      totalLinhas: planilha.linhas.length,
      inseridas,
      atualizadas,
      ignoradas,
      produtosNaoEncontrados,
      empresasNaoEncontradas,
      custoTotal: null,
      periodo: periodos.size === 1 ? ([...periodos][0] ?? null) : null,
    };

    await registrarImportacao(conexao, { ...resultado, tipo: 'inventario_fisico', arquivo, usuarioId });

    return resultado;
  });
}
```

- [ ] **Step 4: Rodar o teste para ver passar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueInventarioFisico.test.ts
```

Esperado: PASSA, 9 casos.

- [ ] **Step 5: Acrescentar o endpoint**

Em `apps/api/src/routes/estoqueFechamentoImportar.ts`, acrescente o import:

```ts
import { importarInventarioFisico } from '../services/estoqueInventarioFisico.js';
```

a constante de rota:

```ts
const ROTA_INVENTARIO = '/estoque/fechamento/inventario';
```

e o endpoint, ao final do arquivo:

```ts
estoqueFechamentoImportarRouter.post(
  '/inventario-fisico',
  requirePermissao(ROTA_INVENTARIO, 'podeIncluir'),
  upload.single('arquivo'),
  async (req, res) => {
    const arquivo = exigirPlanilha(req.file);
    res.json(await importarInventarioFisico(arquivo.buffer, arquivo.originalname, req.usuario!.id));
  },
);
```

- [ ] **Step 6: Verificar**

```bash
npm run typecheck
npm run test --workspace=apps/api
```

Esperado: sem erro; suíte inteira passando.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/estoqueInventarioFisico.ts \
        apps/api/src/services/estoqueInventarioFisico.test.ts \
        apps/api/src/routes/estoqueFechamentoImportar.ts
git commit -m "Inventario Fisico passa a ser importado por planilha, com almoxarifado na chave"
```

---

## Task 8: Grupos de empresa e a assimetria do escopo

**Files:**
- Create: `apps/api/src/services/estoqueFechamentoGrupos.ts`
- Create: `apps/api/src/services/estoqueFechamentoGrupos.test.ts`

**Interfaces:**
- Consumes: `EmpresaPermitida` de `services/escopoEmpresas.js`.
- Produces:
  - `interface EmpresaDoGrupo { idEmpresa: number; razaoSocial: string }`
  - `interface GrupoEmpresa { grupo: string; empresas: EmpresaDoGrupo[] }`
  - `class GrupoForaDoEscopoError extends Error` com `statusCode = 403`
  - `function filtrarGruposPorEscopo(grupos: GrupoEmpresa[], escopo: EmpresaPermitida[]): GrupoEmpresa[]`
  - `async function buscarGruposPermitidos(escopo: EmpresaPermitida[]): Promise<GrupoEmpresa[]>`
  - `async function exigirGrupoPermitido(grupo: string, escopo: EmpresaPermitida[]): Promise<GrupoEmpresa>`

  As Tasks 10, 11 e 12 recebem um `GrupoEmpresa` já autorizado.

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/api/src/services/estoqueFechamentoGrupos.test.ts`. **Leia a seção 3.6 do spec antes** — o comportamento testado aqui contraria o padrão das outras telas de propósito:

```ts
import { describe, expect, test } from 'vitest';
import type { EmpresaPermitida } from './escopoEmpresas.js';
import { filtrarGruposPorEscopo, type GrupoEmpresa } from './estoqueFechamentoGrupos.js';

/**
 * A assimetria desta tela, que o spec (seção 3.6) justifica: o escopo
 * filtra QUAIS GRUPOS aparecem, mas não recorta as empresas dentro de um
 * grupo autorizado. A Lista de Inventário é peça contábil entregue para
 * fora — se o recorte do usuário afetasse o resultado, dois usuários
 * gerariam listas diferentes para o mesmo grupo e período, e a diferença
 * passaria despercebida.
 */
const GRUPOS: GrupoEmpresa[] = [
  {
    grupo: 'JNK',
    empresas: [
      { idEmpresa: 1, razaoSocial: 'CASA J NAKAO LTDA' },
      { idEmpresa: 2, razaoSocial: 'FULL SHOPEE CASA J NAKAO' },
    ],
  },
  {
    grupo: 'NK2',
    empresas: [{ idEmpresa: 7, razaoSocial: 'NK2 COMERCIO LTDA' }],
  },
];

describe('filtrarGruposPorEscopo', () => {
  test('uma empresa no escopo já libera o grupo inteiro', () => {
    const escopo: EmpresaPermitida[] = [{ origem: 'SYSEMP', cdFilial: 1 }];

    const resultado = filtrarGruposPorEscopo(GRUPOS, escopo);

    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.grupo).toBe('JNK');
  });

  test('o grupo liberado vem com TODAS as suas empresas, não só as do escopo', () => {
    const escopo: EmpresaPermitida[] = [{ origem: 'SYSEMP', cdFilial: 1 }];

    const [jnk] = filtrarGruposPorEscopo(GRUPOS, escopo);

    expect(jnk?.empresas.map((e) => e.idEmpresa)).toEqual([1, 2]);
  });

  test('escopo vazio devolve lista vazia — falha fechada, nunca tudo', () => {
    expect(filtrarGruposPorEscopo(GRUPOS, [])).toEqual([]);
  });

  test('escopo só do KPL não libera empresa da SysEmp de mesmo código', () => {
    const escopo: EmpresaPermitida[] = [{ origem: 'KPL', cdFilial: 1 }];

    expect(filtrarGruposPorEscopo(GRUPOS, escopo)).toEqual([]);
  });

  test('escopo em dois grupos devolve os dois', () => {
    const escopo: EmpresaPermitida[] = [
      { origem: 'SYSEMP', cdFilial: 2 },
      { origem: 'SYSEMP', cdFilial: 7 },
    ];

    expect(filtrarGruposPorEscopo(GRUPOS, escopo).map((g) => g.grupo)).toEqual(['JNK', 'NK2']);
  });

  test('empresa do escopo que não está em grupo nenhum não inventa grupo', () => {
    const escopo: EmpresaPermitida[] = [{ origem: 'SYSEMP', cdFilial: 99 }];

    expect(filtrarGruposPorEscopo(GRUPOS, escopo)).toEqual([]);
  });

  test('lista de grupos vazia devolve vazio mesmo com escopo largo', () => {
    const escopo: EmpresaPermitida[] = [{ origem: 'SYSEMP', cdFilial: 1 }];

    expect(filtrarGruposPorEscopo([], escopo)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueFechamentoGrupos.test.ts
```

Esperado: FALHA — o arquivo não existe.

- [ ] **Step 3: Escrever o serviço**

Crie `apps/api/src/services/estoqueFechamentoGrupos.ts`:

```ts
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import type { EmpresaPermitida } from './escopoEmpresas.js';

/**
 * Grupos de empresa do Fechamento de Custo (JNK, CNK2, NK2 —
 * `sysemp_empresa.grupo_empresa`).
 *
 * **A exceção do módulo**, e está no spec por isso (seção 3.6): o escopo
 * do usuário filtra QUAIS GRUPOS ele enxerga, mas, autorizado o grupo, o
 * cálculo varre todas as empresas dele. A Lista de Inventário é peça
 * contábil entregue para fora; se o recorte de quem clicou afetasse o
 * resultado, dois usuários gerariam listas diferentes para o mesmo grupo
 * e período, e a diferença passaria despercebida — os totais parecem
 * plausíveis nos dois casos.
 *
 * NÃO "consertar" isso aplicando o escopo dentro do cálculo.
 */

export interface EmpresaDoGrupo {
  idEmpresa: number;
  razaoSocial: string;
}

export interface GrupoEmpresa {
  grupo: string;
  empresas: EmpresaDoGrupo[];
}

/** Grupo pedido que não está entre os que o usuário enxerga. */
export class GrupoForaDoEscopoError extends Error {
  statusCode = 403;
}

/**
 * Escopo vazio devolve lista vazia, e não a lista inteira: é a diferença
 * entre "não vê nada" e "vê tudo". Só a origem SYSEMP conta — ter a
 * empresa 4 do KPL não pode liberar a 4 da SysEmp, que é outra companhia.
 */
export function filtrarGruposPorEscopo(
  grupos: GrupoEmpresa[],
  escopo: EmpresaPermitida[],
): GrupoEmpresa[] {
  const permitidas = new Set(
    escopo.filter((e) => e.origem === 'SYSEMP').map((e) => e.cdFilial),
  );
  if (permitidas.size === 0) return [];

  return grupos.filter((g) => g.empresas.some((e) => permitidas.has(e.idEmpresa)));
}

interface EmpresaRow extends RowDataPacket {
  grupo_empresa: string;
  id_empresa: number;
  razao_social: string;
}

/** Todos os grupos existentes, com todas as suas empresas. Sem escopo. */
async function buscarTodosOsGrupos(): Promise<GrupoEmpresa[]> {
  const [linhas] = await pool.query<EmpresaRow[]>(
    `SELECT grupo_empresa, id_empresa, TRIM(razao_social) AS razao_social
       FROM sysemp_empresa
      WHERE grupo_empresa IS NOT NULL AND grupo_empresa <> ''
      ORDER BY grupo_empresa, razao_social`,
  );

  const porGrupo = new Map<string, GrupoEmpresa>();
  for (const l of linhas) {
    const chave = String(l.grupo_empresa);
    let grupo = porGrupo.get(chave);
    if (!grupo) {
      grupo = { grupo: chave, empresas: [] };
      porGrupo.set(chave, grupo);
    }
    grupo.empresas.push({ idEmpresa: Number(l.id_empresa), razaoSocial: String(l.razao_social) });
  }

  return [...porGrupo.values()];
}

export async function buscarGruposPermitidos(escopo: EmpresaPermitida[]): Promise<GrupoEmpresa[]> {
  return filtrarGruposPorEscopo(await buscarTodosOsGrupos(), escopo);
}

/**
 * Resolve o grupo pedido na tela, recusando o que o usuário não enxerga.
 * Toda rota do Fechamento que recebe `grupo` da query string passa por
 * aqui antes de tocar no banco.
 */
export async function exigirGrupoPermitido(
  grupo: string,
  escopo: EmpresaPermitida[],
): Promise<GrupoEmpresa> {
  const permitidos = await buscarGruposPermitidos(escopo);
  const encontrado = permitidos.find((g) => g.grupo === grupo);

  if (!encontrado) {
    throw new GrupoForaDoEscopoError('Sem permissão para este grupo de empresa.');
  }

  return encontrado;
}
```

- [ ] **Step 4: Rodar o teste para ver passar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueFechamentoGrupos.test.ts
```

Esperado: PASSA, 7 casos.

- [ ] **Step 5: Verificar que o erro 403 chega ao cliente**

O middleware de erro global preserva `statusCode` de erros 4xx (é o que
`ConfiguracaoAusenteError` já usa). Confirme:

```bash
grep -n "statusCode" apps/api/src/app.ts
```

Esperado: o handler de erro lê `statusCode` do erro. Se não ler, `GrupoForaDoEscopoError`
viraria 500 — nesse caso ajuste o handler para preservar `statusCode` entre 400 e 499,
e anote no spec seção 3.6 que a recusa é 403.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/estoqueFechamentoGrupos.ts \
        apps/api/src/services/estoqueFechamentoGrupos.test.ts
git commit -m "Grupo de empresa do fechamento passa a respeitar o escopo do usuario no seletor"
```

---

## Task 9: A regra de valorização

**Files:**
- Create: `apps/api/src/services/estoqueCustoFechamento.ts` (só a função pura nesta task)
- Create: `apps/api/src/services/estoqueCustoFechamento.test.ts`

**Interfaces:**
- Consumes: nada — função pura, sem banco.
- Produces:
  - `type OrigemCusto = 'FECHAMENTO' | 'ESTOQUE_FULL'`
  - `interface EntradaValorizacao { qtde: number | null; custoEstoque: number | null; precoVenda: number | null; percentualCustoVenda: number }`
  - `interface Valorizacao { vuCustoEstoque: number | null; vuCustoVenda: number | null; vuCusto: number | null; valorCustoTotal: number | null }`
  - `function valorizarLinhaFull(entrada: EntradaValorizacao): Valorizacao`

  A Task 10 consome `valorizarLinhaFull` para gravar as linhas `ESTOQUE_FULL`.

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/api/src/services/estoqueCustoFechamento.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { valorizarLinhaFull } from './estoqueCustoFechamento.js';

/**
 * A única parte do módulo com risco contábil de verdade. Um erro aqui
 * produz um custo errado que ninguém questiona, porque o número continua
 * parecendo razoável. Ver Specs/spec_modulo_estoque.md, seção 3.5.
 */
const PERCENTUAL = 50;

describe('valorizarLinhaFull', () => {
  test('usa o custo do Fechamento quando existe e é positivo', () => {
    const r = valorizarLinhaFull({ qtde: 10, custoEstoque: 3, precoVenda: 20, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCustoEstoque).toBe(3);
    expect(r.vuCustoVenda).toBeNull();
    expect(r.vuCusto).toBe(3);
    expect(r.valorCustoTotal).toBe(30);
  });

  test('o preço de venda não é consultado quando há custo — vuCustoVenda fica nulo', () => {
    const r = valorizarLinhaFull({ qtde: 1, custoEstoque: 3, precoVenda: 100, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCustoVenda).toBeNull();
  });

  test('custo zero cai para o percentual do preço de venda', () => {
    const r = valorizarLinhaFull({ qtde: 2, custoEstoque: 0, precoVenda: 20, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCustoEstoque).toBe(0);
    expect(r.vuCustoVenda).toBe(10);
    expect(r.vuCusto).toBe(10);
    expect(r.valorCustoTotal).toBe(20);
  });

  test('custo nulo cai para o percentual do preço de venda', () => {
    const r = valorizarLinhaFull({ qtde: 2, custoEstoque: null, precoVenda: 20, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCusto).toBe(10);
  });

  test('custo negativo também cai para o preço de venda', () => {
    const r = valorizarLinhaFull({ qtde: 1, custoEstoque: -5, precoVenda: 20, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCusto).toBe(10);
  });

  test('o percentual é percentual mesmo: 50 significa metade', () => {
    const r = valorizarLinhaFull({ qtde: 1, custoEstoque: null, precoVenda: 80, percentualCustoVenda: 50 });

    expect(r.vuCustoVenda).toBe(40);
  });

  test('percentual diferente de 50 é respeitado', () => {
    const r = valorizarLinhaFull({ qtde: 1, custoEstoque: null, precoVenda: 80, percentualCustoVenda: 25 });

    expect(r.vuCustoVenda).toBe(20);
  });

  test('sem custo e sem preço fica sem custo, e não custo zero', () => {
    const r = valorizarLinhaFull({ qtde: 5, custoEstoque: null, precoVenda: null, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCusto).toBeNull();
    expect(r.valorCustoTotal).toBeNull();
  });

  test('preço de venda zero conta como ausência de preço', () => {
    const r = valorizarLinhaFull({ qtde: 5, custoEstoque: null, precoVenda: 0, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCusto).toBeNull();
  });

  test('quantidade nula não vira zero: sem quantidade não há valor total', () => {
    const r = valorizarLinhaFull({ qtde: null, custoEstoque: 3, precoVenda: null, percentualCustoVenda: PERCENTUAL });

    expect(r.vuCusto).toBe(3);
    expect(r.valorCustoTotal).toBeNull();
  });

  test('quantidade zero é zero, e o valor total é zero — não nulo', () => {
    const r = valorizarLinhaFull({ qtde: 0, custoEstoque: 3, precoVenda: null, percentualCustoVenda: PERCENTUAL });

    expect(r.valorCustoTotal).toBe(0);
  });

  test('quantidade negativa (estorno) é preservada com o sinal', () => {
    const r = valorizarLinhaFull({ qtde: -2, custoEstoque: 3, precoVenda: null, percentualCustoVenda: PERCENTUAL });

    expect(r.valorCustoTotal).toBe(-6);
  });
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueCustoFechamento.test.ts
```

Esperado: FALHA — o arquivo não existe.

- [ ] **Step 3: Escrever a função pura**

Crie `apps/api/src/services/estoqueCustoFechamento.ts` com **apenas** este
conteúdo por enquanto; a Task 10 acrescenta a persistência ao mesmo arquivo:

```ts
/**
 * Cálculo de Custo de Fechamento. Ver Specs/spec_modulo_estoque.md,
 * seção 3.5.
 *
 * A regra de valorização mora numa função pura, separada da
 * persistência, porque é a única parte com risco contábil de verdade — e
 * é onde os testes se concentram.
 */

export type OrigemCusto = 'FECHAMENTO' | 'ESTOQUE_FULL';

export interface EntradaValorizacao {
  qtde: number | null;
  /** Custo do Fechamento do mesmo produto e período, de qualquer empresa. */
  custoEstoque: number | null;
  /** Preço da tabela configurada em FECHAMENTO_ID_TABELA_PRECO. */
  precoVenda: number | null;
  percentualCustoVenda: number;
}

export interface Valorizacao {
  vuCustoEstoque: number | null;
  vuCustoVenda: number | null;
  /** O que foi de fato adotado: o de estoque se positivo, senão o de venda. */
  vuCusto: number | null;
  valorCustoTotal: number | null;
}

/**
 * Valoriza uma linha do Estoque FULL, que só tem quantidade.
 *
 * Ordem: custo do Fechamento primeiro; não havendo custo, ou sendo ele
 * zero ou negativo, um percentual do preço de venda. Não havendo nem
 * preço, a linha fica **sem custo** — nula, e não zero. Zero disfarçado
 * some no total e ninguém percebe que faltou dado; nulo aparece no resumo
 * como "sem custo encontrado".
 */
export function valorizarLinhaFull(entrada: EntradaValorizacao): Valorizacao {
  const { qtde, custoEstoque, precoVenda, percentualCustoVenda } = entrada;

  const temCustoEstoque = custoEstoque !== null && custoEstoque > 0;
  const temPrecoVenda = precoVenda !== null && precoVenda > 0;

  const vuCustoVenda = !temCustoEstoque && temPrecoVenda
    ? (precoVenda * percentualCustoVenda) / 100
    : null;

  const vuCusto = temCustoEstoque ? custoEstoque : vuCustoVenda;

  return {
    vuCustoEstoque: custoEstoque,
    vuCustoVenda,
    vuCusto,
    valorCustoTotal: vuCusto !== null && qtde !== null ? qtde * vuCusto : null,
  };
}
```

- [ ] **Step 4: Rodar o teste para ver passar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueCustoFechamento.test.ts
```

Esperado: PASSA, 12 casos.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/estoqueCustoFechamento.ts \
        apps/api/src/services/estoqueCustoFechamento.test.ts
git commit -m "Valorizacao do Estoque FULL vira funcao pura, coberta por teste"
```

---

## Task 10: Executar e gravar o cálculo

**Files:**
- Modify: `apps/api/src/services/estoqueCustoFechamento.ts` (acrescenta ao arquivo da Task 9)
- Create: `apps/api/src/routes/estoqueFechamentoCusto.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `valorizarLinhaFull` (Task 9); `GrupoEmpresa`, `exigirGrupoPermitido`, `buscarGruposPermitidos` (Task 8); `obterParametrosFechamento`, `ParametrosFechamento` (Task 2); `withTransaction`; `buscarEmpresasPermitidas` de `services/escopoEmpresas.js`.
- Produces:
  - `interface ResumoCalculo { linhasFechamento; linhasEstoqueFull; usouCustoEstoque; usouCustoVenda; semCusto; totalGeral }`
  - `async function calcularCustoFechamento(periodo: string, grupo: GrupoEmpresa, parametros: ParametrosFechamento): Promise<ResumoCalculo>`
  - `async function buscarPeriodosDisponiveis(): Promise<string[]>`
  - `const estoqueFechamentoCustoRouter: Router` (a Task 11 acrescenta endpoints a este mesmo router)

- [ ] **Step 1: Acrescentar a persistência ao serviço**

Em `apps/api/src/services/estoqueCustoFechamento.ts`, acrescente no topo:

```ts
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool, withTransaction } from '../config/database.js';
import type { ParametrosFechamento } from './estoqueFechamentoParametros.js';
import type { GrupoEmpresa } from './estoqueFechamentoGrupos.js';
```

e ao final do arquivo:

```ts
export interface ResumoCalculo {
  linhasFechamento: number;
  linhasEstoqueFull: number;
  usouCustoEstoque: number;
  usouCustoVenda: number;
  semCusto: number;
  totalGeral: number;
}

/** Colunas de `estoque_custo_fechamento`, na ordem do INSERT em lote. */
const COLUNAS_CUSTO = [
  'periodo', 'grupo_empresa', 'id_empresa', 'nome_empresa', 'origem',
  'id_produto', 'codigo_auxiliar', 'descricao_produto', 'marca', 'unidade', 'ncm',
  'conta', 'tipo_saldo', 'qtde', 'vu_custo_estoque', 'vu_custo_venda', 'vu_custo',
  'valor_custo_total',
] as const;

type LinhaParaGravar = Record<(typeof COLUNAS_CUSTO)[number], unknown>;

async function gravarEmLotes(conexao: PoolConnection, linhas: LinhaParaGravar[]): Promise<void> {
  const TAMANHO_LOTE = 500;
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE);
    const grupoDeMarcadores = `(${COLUNAS_CUSTO.map(() => '?').join(',')})`;
    await conexao.query(
      `INSERT INTO estoque_custo_fechamento (${COLUNAS_CUSTO.join(',')})
       VALUES ${lote.map(() => grupoDeMarcadores).join(',')}`,
      lote.flatMap((l) => COLUNAS_CUSTO.map((c) => l[c])),
    );
  }
}

/** Custo do Fechamento por produto no período, de qualquer empresa. */
async function custoPorProduto(
  conexao: PoolConnection,
  periodo: string,
  idsProduto: number[],
): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();
  for (let i = 0; i < idsProduto.length; i += 1000) {
    const bloco = idsProduto.slice(i, i + 1000);
    const [linhas] = await conexao.query<RowDataPacket[]>(
      `SELECT id_produto, MAX(custo) AS custo
         FROM estoque_fechamento_mensal
        WHERE periodo = ? AND id_produto IN (${bloco.map(() => '?').join(',')})
        GROUP BY id_produto`,
      [periodo, ...bloco],
    );
    for (const l of linhas) {
      if (l.custo !== null) mapa.set(Number(l.id_produto), Number(l.custo));
    }
  }
  return mapa;
}

/** Preço da tabela configurada, por produto. Fallback da valorização. */
async function precoPorProduto(
  conexao: PoolConnection,
  idTabelaPreco: number,
  idsProduto: number[],
): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();
  for (let i = 0; i < idsProduto.length; i += 1000) {
    const bloco = idsProduto.slice(i, i + 1000);
    const [linhas] = await conexao.query<RowDataPacket[]>(
      `SELECT id_produto, MAX(preco_tabela) AS preco
         FROM sysemp_preco
        WHERE id_tb_preco = ? AND id_produto IN (${bloco.map(() => '?').join(',')})
        GROUP BY id_produto`,
      [idTabelaPreco, ...bloco],
    );
    for (const l of linhas) {
      if (l.preco !== null) mapa.set(Number(l.id_produto), Number(l.preco));
    }
  }
  return mapa;
}

interface CadastroProduto {
  idProduto: number;
  nomeProduto: string | null;
  marca: string | null;
  unidade: string | null;
  ncm: string | null;
}

/**
 * O Estoque FULL guarda `cd_produto`, não `id_produto`: sem resolver
 * contra `sysemp_produto.codigo_auxiliar` não há como achar o custo do
 * Fechamento nem o preço de venda. É daí que sai também a descrição,
 * marca, unidade e NCM da linha, que a planilha não traz.
 */
async function cadastroPorCodigo(
  conexao: PoolConnection,
  codigos: string[],
): Promise<Map<string, CadastroProduto>> {
  const mapa = new Map<string, CadastroProduto>();
  for (let i = 0; i < codigos.length; i += 1000) {
    const bloco = codigos.slice(i, i + 1000);
    const [linhas] = await conexao.query<RowDataPacket[]>(
      `SELECT id_produto, codigo_auxiliar, nome_produto, descricao_marca, unidade, ncm
         FROM sysemp_produto
        WHERE codigo_auxiliar IN (${bloco.map(() => '?').join(',')})`,
      bloco,
    );
    for (const l of linhas) {
      mapa.set(String(l.codigo_auxiliar), {
        idProduto: Number(l.id_produto),
        nomeProduto: l.nome_produto === null ? null : String(l.nome_produto),
        marca: l.descricao_marca === null ? null : String(l.descricao_marca),
        unidade: l.unidade === null ? null : String(l.unidade),
        ncm: l.ncm === null ? null : String(l.ncm),
      });
    }
  }
  return mapa;
}

/**
 * Recalcula um par (período, grupo). **Apaga o cálculo anterior desse par
 * e grava de novo** — não acumula histórico de re-execuções, só a data da
 * última em `data_calculo_custo`. Intencional: o cálculo é derivado das
 * planilhas, e o que vale é o estado atual delas.
 *
 * Varre TODAS as empresas do grupo, não só as do escopo de quem clicou.
 * Ver `estoqueFechamentoGrupos.ts` e o spec, seção 3.6.
 */
export async function calcularCustoFechamento(
  periodo: string,
  grupo: GrupoEmpresa,
  parametros: ParametrosFechamento,
): Promise<ResumoCalculo> {
  const idsEmpresa = grupo.empresas.map((e) => e.idEmpresa);
  const nomePorId = new Map(grupo.empresas.map((e) => [e.idEmpresa, e.razaoSocial]));
  const marcadoresEmpresa = idsEmpresa.map(() => '?').join(',');

  return withTransaction(async (conexao) => {
    await conexao.query(
      'DELETE FROM estoque_custo_fechamento WHERE periodo = ? AND grupo_empresa = ?',
      [periodo, grupo.grupo],
    );

    const paraGravar: LinhaParaGravar[] = [];

    // ---- 1. FECHAMENTO: cópia direta, já tem custo próprio ----
    const [linhasFechamento] = await conexao.query<RowDataPacket[]>(
      `SELECT id_empresa, id_produto, codigo_auxiliar, descricao, marca, unidade, ncm, estoque, custo, total
         FROM estoque_fechamento_mensal
        WHERE periodo = ? AND id_empresa IN (${marcadoresEmpresa})`,
      [periodo, ...idsEmpresa],
    );

    for (const f of linhasFechamento) {
      const custo = f.custo === null ? null : Number(f.custo);
      paraGravar.push({
        periodo,
        grupo_empresa: grupo.grupo,
        id_empresa: f.id_empresa,
        nome_empresa: nomePorId.get(Number(f.id_empresa)) ?? null,
        origem: 'FECHAMENTO' satisfies OrigemCusto,
        id_produto: f.id_produto,
        codigo_auxiliar: f.codigo_auxiliar,
        descricao_produto: f.descricao,
        marca: f.marca,
        unidade: f.unidade,
        ncm: f.ncm,
        conta: null,
        tipo_saldo: null,
        qtde: f.estoque,
        vu_custo_estoque: custo,
        vu_custo_venda: null,
        vu_custo: custo,
        valor_custo_total: f.total,
      });
    }

    // ---- 2. ESTOQUE FULL: valorizado ----
    const [linhasFull] = await conexao.query<RowDataPacket[]>(
      `SELECT id_empresa, conta, tipo_saldo, cd_produto, qtde
         FROM estoque_full_importado
        WHERE periodo = ? AND id_empresa IN (${marcadoresEmpresa})`,
      [periodo, ...idsEmpresa],
    );

    const cadastro = await cadastroPorCodigo(
      conexao,
      [...new Set(linhasFull.map((r) => String(r.cd_produto)))],
    );
    const idsProduto = [...new Set([...cadastro.values()].map((c) => c.idProduto))];
    const custos = await custoPorProduto(conexao, periodo, idsProduto);
    const precos = await precoPorProduto(conexao, parametros.idTabelaPreco, idsProduto);

    let usouCustoEstoque = 0;
    let usouCustoVenda = 0;
    let semCusto = 0;

    for (const r of linhasFull) {
      const codigo = String(r.cd_produto);
      const produto = cadastro.get(codigo) ?? null;

      const valorizacao = valorizarLinhaFull({
        qtde: r.qtde === null ? null : Number(r.qtde),
        custoEstoque: produto ? (custos.get(produto.idProduto) ?? null) : null,
        precoVenda: produto ? (precos.get(produto.idProduto) ?? null) : null,
        percentualCustoVenda: parametros.percentualCustoVenda,
      });

      if (valorizacao.vuCusto === null) semCusto++;
      else if (valorizacao.vuCustoVenda !== null) usouCustoVenda++;
      else usouCustoEstoque++;

      paraGravar.push({
        periodo,
        grupo_empresa: grupo.grupo,
        id_empresa: r.id_empresa,
        nome_empresa: nomePorId.get(Number(r.id_empresa)) ?? null,
        origem: 'ESTOQUE_FULL' satisfies OrigemCusto,
        id_produto: produto?.idProduto ?? null,
        codigo_auxiliar: codigo,
        descricao_produto: produto?.nomeProduto ?? null,
        marca: produto?.marca ?? null,
        unidade: produto?.unidade ?? null,
        ncm: produto?.ncm ?? null,
        conta: r.conta,
        tipo_saldo: r.tipo_saldo,
        qtde: r.qtde,
        vu_custo_estoque: valorizacao.vuCustoEstoque,
        vu_custo_venda: valorizacao.vuCustoVenda,
        vu_custo: valorizacao.vuCusto,
        valor_custo_total: valorizacao.valorCustoTotal,
      });
    }

    await gravarEmLotes(conexao, paraGravar);

    return {
      linhasFechamento: linhasFechamento.length,
      linhasEstoqueFull: linhasFull.length,
      usouCustoEstoque,
      usouCustoVenda,
      semCusto,
      totalGeral: paraGravar.reduce((soma, l) => soma + Number(l.valor_custo_total ?? 0), 0),
    };
  });
}

/** Períodos que já têm Fechamento importado — é o que a tela oferece. */
export async function buscarPeriodosDisponiveis(): Promise<string[]> {
  const [linhas] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT DATE_FORMAT(periodo, '%Y-%m-%d') AS periodo
       FROM estoque_fechamento_mensal
      ORDER BY periodo DESC`,
  );
  return linhas.map((l) => String(l.periodo));
}
```

- [ ] **Step 2: Verificar que os testes da Task 9 continuam passando**

```bash
npm run test --workspace=apps/api -- src/services/estoqueCustoFechamento.test.ts
npm run typecheck
```

Esperado: os 12 casos da valorização continuam passando; typecheck limpo.

Se o `satisfies OrigemCusto` reclamar, é sinal de que `LinhaParaGravar` está
com tipo estreito demais — mantenha os valores como `unknown` no
`Record` e o `satisfies` só documenta o literal.

- [ ] **Step 3: Escrever a rota de cálculo**

Crie `apps/api/src/routes/estoqueFechamentoCusto.ts`. A Task 11 acrescenta
endpoints **a este mesmo arquivo**:

```ts
import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import {
  buscarPeriodosDisponiveis,
  calcularCustoFechamento,
} from '../services/estoqueCustoFechamento.js';
import { buscarGruposPermitidos, exigirGrupoPermitido } from '../services/estoqueFechamentoGrupos.js';
import { obterParametrosFechamento } from '../services/estoqueFechamentoParametros.js';

export const estoqueFechamentoCustoRouter = Router();

const ROTA = '/estoque/fechamento/custo';

estoqueFechamentoCustoRouter.use(authTenant);

/** Período chega como AAAA-MM-01; recusa qualquer outra coisa antes do SQL. */
function exigirPeriodo(valor: unknown): string {
  const texto = String(valor ?? '');
  if (!/^\d{4}-\d{2}-01$/.test(texto)) {
    const erro = new Error('Período inválido.') as Error & { statusCode: number };
    erro.statusCode = 400;
    throw erro;
  }
  return texto;
}

estoqueFechamentoCustoRouter.get('/filtros', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
  const [grupos, periodos] = await Promise.all([
    buscarGruposPermitidos(escopo),
    buscarPeriodosDisponiveis(),
  ]);

  res.json({ grupos: grupos.map((g) => g.grupo), periodos });
});

// Calcular grava tabela (apaga o cálculo anterior do par e regrava), por
// isso pede podeIncluir e não podeVisualizar. Não é consulta.
estoqueFechamentoCustoRouter.post('/calcular', requirePermissao(ROTA, 'podeIncluir'), async (req, res) => {
  const periodo = exigirPeriodo(req.body?.periodo);
  const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
  const grupo = await exigirGrupoPermitido(String(req.body?.grupo ?? ''), escopo);
  const parametros = await obterParametrosFechamento();

  res.json({
    resumo: await calcularCustoFechamento(periodo, grupo, parametros),
    percentualCustoVenda: parametros.percentualCustoVenda,
  });
});
```

- [ ] **Step 4: Montar a rota**

Em `apps/api/src/app.ts`:

```ts
import { estoqueFechamentoCustoRouter } from './routes/estoqueFechamentoCusto.js';
```

```ts
app.use('/api/estoque/fechamento/custo', estoqueFechamentoCustoRouter);
```

- [ ] **Step 5: Verificar**

```bash
npm run typecheck
npm run test --workspace=apps/api
```

Esperado: sem erro; suíte inteira passando.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/estoqueCustoFechamento.ts \
        apps/api/src/routes/estoqueFechamentoCusto.ts apps/api/src/app.ts
git commit -m "Calculo de custo junta Fechamento e Estoque FULL por periodo e grupo"
```

---

## Task 11: Grade paginada e as duas exportações

**Files:**
- Modify: `apps/api/src/services/estoqueCustoFechamento.ts`
- Modify: `apps/api/src/routes/estoqueFechamentoCusto.ts`

**Interfaces:**
- Consumes: tudo da Task 10.
- Produces:
  - `interface LinhaCusto extends RowDataPacket { … }`
  - `async function buscarCalculoPaginado(periodo, grupo, pagina, tamanhoPagina): Promise<{ linhas: LinhaCusto[]; total: number; totalGeral: number }>`
  - `async function buscarCalculoCompleto(periodo, grupo): Promise<LinhaCusto[]>`
  - `async function buscarListaInventario(periodo, grupo): Promise<LinhaInventarioContabil[]>`
  - `function ultimoDiaDoMes(periodo: string): Date`

- [ ] **Step 1: Acrescentar as consultas ao serviço**

Ao final de `apps/api/src/services/estoqueCustoFechamento.ts`:

```ts
export interface LinhaCusto extends RowDataPacket {
  id_empresa: number | null;
  nome_empresa: string | null;
  origem: string;
  id_produto: number | null;
  codigo_auxiliar: string | null;
  descricao_produto: string | null;
  marca: string | null;
  unidade: string | null;
  ncm: string | null;
  conta: string | null;
  tipo_saldo: string | null;
  qtde: number | null;
  vu_custo_estoque: number | null;
  vu_custo_venda: number | null;
  vu_custo: number | null;
  valor_custo_total: number | null;
}

const SELECT_CUSTO = `
  SELECT id_empresa, nome_empresa, origem, id_produto, codigo_auxiliar, descricao_produto,
         marca, unidade, ncm, conta, tipo_saldo, qtde, vu_custo_estoque, vu_custo_venda,
         vu_custo, valor_custo_total
    FROM estoque_custo_fechamento
   WHERE periodo = ? AND grupo_empresa = ?
   ORDER BY origem, nome_empresa, descricao_produto`;

/**
 * Uma página da grade, mais o total de registros e o **custo total geral
 * somado direto no banco**.
 *
 * O total geral nunca sai da página: no portal PHP anterior o limite da
 * grade chegou a cortar linha de um total exibido, e o número continuava
 * parecendo plausível. Ver Specs/spec_modulo_estoque.md, seção 3.8.
 */
export async function buscarCalculoPaginado(
  periodo: string,
  grupo: GrupoEmpresa,
  pagina: number,
  tamanhoPagina: number,
): Promise<{ linhas: LinhaCusto[]; total: number; totalGeral: number }> {
  const [totais] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(valor_custo_total), 0) AS total_geral
       FROM estoque_custo_fechamento
      WHERE periodo = ? AND grupo_empresa = ?`,
    [periodo, grupo.grupo],
  );

  const [linhas] = await pool.query<LinhaCusto[]>(`${SELECT_CUSTO} LIMIT ? OFFSET ?`, [
    periodo,
    grupo.grupo,
    tamanhoPagina,
    (pagina - 1) * tamanhoPagina,
  ]);

  return {
    linhas,
    total: Number(totais[0]?.total ?? 0),
    totalGeral: Number(totais[0]?.total_geral ?? 0),
  };
}

/** Todas as linhas do par (período, grupo), para a exportação da grade. */
export async function buscarCalculoCompleto(
  periodo: string,
  grupo: GrupoEmpresa,
): Promise<LinhaCusto[]> {
  const [linhas] = await pool.query<LinhaCusto[]>(SELECT_CUSTO, [periodo, grupo.grupo]);
  return linhas;
}

export interface LinhaInventarioContabil extends RowDataPacket {
  codigo_auxiliar: string | null;
  descricao_produto: string | null;
  unidade: string | null;
  ncm: string | null;
  qtde: number | null;
  vu_custo: number | null;
  valor_custo_total: number | null;
}

/**
 * A Lista de Inventário — formato fixo para a contabilidade. Sai sempre
 * de uma consulta nova, sem limite, e nunca da página carregada.
 */
export async function buscarListaInventario(
  periodo: string,
  grupo: GrupoEmpresa,
): Promise<LinhaInventarioContabil[]> {
  const [linhas] = await pool.query<LinhaInventarioContabil[]>(
    `SELECT codigo_auxiliar, descricao_produto, unidade, ncm, qtde, vu_custo, valor_custo_total
       FROM estoque_custo_fechamento
      WHERE periodo = ? AND grupo_empresa = ?
      ORDER BY codigo_auxiliar`,
    [periodo, grupo.grupo],
  );
  return linhas;
}

/** Último dia do mês do período — a DataFechamento da Lista de Inventário. */
export function ultimoDiaDoMes(periodo: string): Date {
  const [ano, mes] = periodo.split('-').map(Number);
  // Dia 0 do mês seguinte é o último dia deste mês.
  return new Date(Number(ano), Number(mes), 0);
}
```

- [ ] **Step 2: Acrescentar um teste para `ultimoDiaDoMes`**

Em `apps/api/src/services/estoqueCustoFechamento.test.ts`, acrescente o
import e o bloco:

```ts
import { ultimoDiaDoMes, valorizarLinhaFull } from './estoqueCustoFechamento.js';

describe('ultimoDiaDoMes', () => {
  test('mês de 31 dias', () => {
    expect(ultimoDiaDoMes('2026-07-01').getDate()).toBe(31);
  });

  test('mês de 30 dias', () => {
    expect(ultimoDiaDoMes('2026-04-01').getDate()).toBe(30);
  });

  test('fevereiro comum', () => {
    expect(ultimoDiaDoMes('2026-02-01').getDate()).toBe(28);
  });

  test('fevereiro bissexto', () => {
    expect(ultimoDiaDoMes('2024-02-01').getDate()).toBe(29);
  });

  test('dezembro não vaza para o ano seguinte', () => {
    const data = ultimoDiaDoMes('2026-12-01');

    expect(data.getDate()).toBe(31);
    expect(data.getMonth()).toBe(11);
    expect(data.getFullYear()).toBe(2026);
  });
});
```

- [ ] **Step 3: Rodar o teste**

```bash
npm run test --workspace=apps/api -- src/services/estoqueCustoFechamento.test.ts
```

Esperado: PASSA, 17 casos (12 da valorização + 5 do último dia).

- [ ] **Step 4: Acrescentar os endpoints de grade e exportação**

Em `apps/api/src/routes/estoqueFechamentoCusto.ts`, acrescente o import do
exceljs no topo do arquivo:

```ts
import ExcelJS from 'exceljs';
```

e amplie o import do serviço para incluir as funções novas:

```ts
import {
  buscarCalculoCompleto,
  buscarCalculoPaginado,
  buscarListaInventario,
  buscarPeriodosDisponiveis,
  calcularCustoFechamento,
  ultimoDiaDoMes,
} from '../services/estoqueCustoFechamento.js';
```

Acrescente ao final do arquivo:

```ts
estoqueFechamentoCustoRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const periodo = exigirPeriodo(query.periodo);
  const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
  const grupo = await exigirGrupoPermitido(String(query.grupo ?? ''), escopo);

  const pagina = Math.max(1, Number(query.pagina) || 1);
  const tamanhoPagina = Math.min(200, Math.max(1, Number(query.tamanhoPagina) || 50));

  const { linhas, total, totalGeral } = await buscarCalculoPaginado(
    periodo,
    grupo,
    pagina,
    tamanhoPagina,
  );

  res.json({ linhas, total, totalGeral, pagina, tamanhoPagina, dataFechamento: ultimoDiaDoMes(periodo) });
});

/** Formata a célula como Texto, para código não perder zero à esquerda. */
const TEXTO = { width: 18, style: { numFmt: '@' } };

estoqueFechamentoCustoRouter.get('/exportar', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const periodo = exigirPeriodo(query.periodo);
  const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
  const grupo = await exigirGrupoPermitido(String(query.grupo ?? ''), escopo);

  const linhas = await buscarCalculoCompleto(periodo, grupo);
  const dataFechamento = ultimoDiaDoMes(periodo);

  const qtde = { width: 14, style: { numFmt: '#,##0.0000' } };
  const valor = { width: 16, style: { numFmt: '#,##0.0000' } };

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Custo de Fechamento');
  sheet.columns = [
    { header: 'DATA DO FECHAMENTO', key: 'data_fechamento', width: 20 },
    { header: 'ORIGEM', key: 'origem', width: 16 },
    { header: 'EMPRESA', key: 'nome_empresa', width: 40 },
    { header: 'CODIGO', key: 'codigo_auxiliar', ...TEXTO },
    { header: 'PRODUTO', key: 'descricao_produto', width: 45 },
    { header: 'MARCA', key: 'marca', width: 20 },
    { header: 'UNIDADE', key: 'unidade', width: 10 },
    { header: 'NCM', key: 'ncm', ...TEXTO },
    { header: 'CONTA', key: 'conta', width: 16 },
    { header: 'SITUACAO', key: 'tipo_saldo', width: 26 },
    { header: 'QTDE', key: 'qtde', ...qtde },
    { header: 'VU CUSTO ESTOQUE', key: 'vu_custo_estoque', ...valor },
    { header: 'VU CUSTO VENDA', key: 'vu_custo_venda', ...valor },
    { header: 'VU CUSTO ADOTADO', key: 'vu_custo', ...valor },
    { header: 'VALOR CUSTO TOTAL', key: 'valor_custo_total', ...valor },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.addRows(linhas.map((l) => ({ ...l, data_fechamento: dataFechamento })));
  sheet.getColumn('data_fechamento').numFmt = 'dd/mm/yyyy';

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="custo-fechamento-${grupo.grupo}-${periodo.slice(0, 7)}.xlsx"`,
  );
  await workbook.xlsx.write(res);
  res.end();
});

/**
 * Lista de Inventário: formato fixo, é o que a contabilidade entrega para
 * fora. Código e NCM saem como Texto — código só com dígitos perde zero à
 * esquerda se o Excel o tratar como número ("0012" vira "12"), e o
 * arquivo chega quebrado.
 */
estoqueFechamentoCustoRouter.get(
  '/lista-inventario',
  requirePermissao(ROTA, 'podeVisualizar'),
  async (req, res) => {
    const query = req.query as Record<string, string | undefined>;
    const periodo = exigirPeriodo(query.periodo);
    const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
    const grupo = await exigirGrupoPermitido(String(query.grupo ?? ''), escopo);

    const linhas = await buscarListaInventario(periodo, grupo);
    const dataFechamento = ultimoDiaDoMes(periodo);

    const valor = { width: 16, style: { numFmt: '#,##0.00' } };

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Lista de Inventario');
    sheet.columns = [
      { header: 'CodigoProduto', key: 'codigo_auxiliar', ...TEXTO },
      { header: 'NomeProduto', key: 'descricao_produto', width: 45 },
      { header: 'UnidadeMedida', key: 'unidade', width: 14 },
      { header: 'NCM', key: 'ncm', ...TEXTO },
      { header: 'DataFechamento', key: 'data_fechamento', width: 18 },
      { header: 'Quantidade', key: 'qtde', width: 14, style: { numFmt: '#,##0.00' } },
      { header: 'ValorUnitario', key: 'vu_custo', ...valor },
      { header: 'ValorTotal', key: 'valor_custo_total', ...valor },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.addRows(linhas.map((l) => ({ ...l, data_fechamento: dataFechamento })));
    sheet.getColumn('data_fechamento').numFmt = 'dd/mm/yyyy';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="lista-inventario-${grupo.grupo}-${periodo.slice(0, 7)}.xlsx"`,
    );
    await workbook.xlsx.write(res);
    res.end();
  },
);
```

- [ ] **Step 5: Verificar**

```bash
npm run typecheck
npm run test --workspace=apps/api
```

Esperado: sem erro; suíte inteira passando.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/estoqueCustoFechamento.ts \
        apps/api/src/services/estoqueCustoFechamento.test.ts \
        apps/api/src/routes/estoqueFechamentoCusto.ts
git commit -m "Calculo de custo ganha grade paginada e as duas exportacoes em xlsx"
```

---

## Task 12: Comparar Inventário × Fechamento

**Files:**
- Create: `apps/api/src/services/estoqueFechamentoComparativo.ts`
- Create: `apps/api/src/services/estoqueFechamentoComparativo.test.ts`
- Create: `apps/api/src/routes/estoqueFechamentoComparativo.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: `GrupoEmpresa`, `exigirGrupoPermitido`, `buscarGruposPermitidos` (Task 8); `buscarPeriodosDisponiveis` (Task 10).
- Produces:
  - `interface ItemFechamento { idEmpresa: number; codigo: string; descricao: string | null; marca: string | null; estoque: number | null; custo: number | null }`
  - `interface ItemInventario { idEmpresa: number; codigo: string; marca: string | null; contagemFinal: number | null }`
  - `interface LinhaComparativo { … }`
  - `function compararQuantidades(fechamento: ItemFechamento[], inventario: ItemInventario[], nomePorEmpresa: Map<number, string>): LinhaComparativo[]`
  - `async function buscarComparativo(periodo, grupo, soDivergencias): Promise<{ linhas; totalRegistros; totalDivergencias; valorTotalDivergencias }>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `apps/api/src/services/estoqueFechamentoComparativo.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { compararQuantidades } from './estoqueFechamentoComparativo.js';

/**
 * O Fechamento contábil não distingue almoxarifado; o inventário físico
 * conta PRINCIPAL e AVARIAS separadamente. Somar antes de comparar é o
 * que impede o comparativo de acusar divergência que não existe.
 * Ver Specs/spec_modulo_estoque.md, seção 3.9.
 */
const NOMES = new Map([[7, 'NK2 COMERCIO LTDA']]);

describe('compararQuantidades', () => {
  test('quantidades iguais não divergem', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: 'PARAFUSO', marca: 'ACME', estoque: 10, custo: 2 }],
      [{ idEmpresa: 7, codigo: '0012', marca: 'ACME', contagemFinal: 10 }],
      NOMES,
    );

    expect(linhas[0]?.divergencia).toBe(0);
    expect(linhas[0]?.valorDivergencia).toBe(0);
  });

  test('soma os almoxarifados do inventário antes de comparar', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: 'PARAFUSO', marca: null, estoque: 10, custo: 2 }],
      [
        { idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 7 },
        { idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 3 },
      ],
      NOMES,
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.qtdeInventario).toBe(10);
    expect(linhas[0]?.divergencia).toBe(0);
  });

  test('contagem física maior que o livro dá divergência positiva', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: null, marca: null, estoque: 8, custo: 2 }],
      [{ idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 10 }],
      NOMES,
    );

    expect(linhas[0]?.divergencia).toBe(2);
    expect(linhas[0]?.valorDivergencia).toBe(4);
  });

  test('contagem física menor que o livro dá divergência negativa', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: null, marca: null, estoque: 10, custo: 2 }],
      [{ idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 8 }],
      NOMES,
    );

    expect(linhas[0]?.divergencia).toBe(-2);
    expect(linhas[0]?.valorDivergencia).toBe(-4);
  });

  test('item só no inventário aparece, com fechamento zero', () => {
    const linhas = compararQuantidades(
      [],
      [{ idEmpresa: 7, codigo: '0099', marca: 'ACME', contagemFinal: 5 }],
      NOMES,
    );

    expect(linhas[0]?.qtdeFechamento).toBe(0);
    expect(linhas[0]?.qtdeInventario).toBe(5);
    expect(linhas[0]?.divergencia).toBe(5);
  });

  test('item só no fechamento aparece, com inventário zero', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0077', descricao: 'PORCA', marca: null, estoque: 4, custo: 1 }],
      [],
      NOMES,
    );

    expect(linhas[0]?.qtdeInventario).toBe(0);
    expect(linhas[0]?.divergencia).toBe(-4);
  });

  test('sem custo, o valor da divergência fica nulo em vez de zero', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: null, marca: null, estoque: 8, custo: null }],
      [{ idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 10 }],
      NOMES,
    );

    expect(linhas[0]?.divergencia).toBe(2);
    expect(linhas[0]?.valorDivergencia).toBeNull();
  });

  test('mesmo código em empresas diferentes não se mistura', () => {
    const nomes = new Map([
      [7, 'NK2'],
      [8, 'JNK'],
    ]);
    const linhas = compararQuantidades(
      [
        { idEmpresa: 7, codigo: '0012', descricao: null, marca: null, estoque: 10, custo: 1 },
        { idEmpresa: 8, codigo: '0012', descricao: null, marca: null, estoque: 20, custo: 1 },
      ],
      [{ idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 10 }],
      nomes,
    );

    expect(linhas).toHaveLength(2);
    expect(linhas.find((l) => l.idEmpresa === 8)?.divergencia).toBe(-20);
  });

  test('o nome da empresa vem do grupo, não da planilha', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: null, marca: null, estoque: 1, custo: null }],
      [],
      NOMES,
    );

    expect(linhas[0]?.nomeEmpresa).toBe('NK2 COMERCIO LTDA');
  });

  test('várias linhas de fechamento do mesmo código na mesma empresa somam', () => {
    const linhas = compararQuantidades(
      [
        { idEmpresa: 7, codigo: '0012', descricao: 'PARAFUSO', marca: null, estoque: 6, custo: 2 },
        { idEmpresa: 7, codigo: '0012', descricao: 'PARAFUSO', marca: null, estoque: 4, custo: 2 },
      ],
      [{ idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 10 }],
      NOMES,
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.qtdeFechamento).toBe(10);
  });

  test('contagem final nula conta como zero contado, não como ausência', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: null, marca: null, estoque: 5, custo: null }],
      [{ idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: null }],
      NOMES,
    );

    expect(linhas[0]?.qtdeInventario).toBe(0);
    expect(linhas[0]?.divergencia).toBe(-5);
  });
});
```

- [ ] **Step 2: Rodar o teste para ver falhar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueFechamentoComparativo.test.ts
```

Esperado: FALHA — o arquivo não existe.

- [ ] **Step 3: Escrever o serviço**

Crie `apps/api/src/services/estoqueFechamentoComparativo.ts`:

```ts
import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import type { GrupoEmpresa } from './estoqueFechamentoGrupos.js';

/**
 * Comparar Inventário Físico × Fechamento Mensal. Tela 100% de leitura,
 * sem tabela própria: calcula na hora a partir das duas importações.
 * Ver Specs/spec_modulo_estoque.md, seção 3.9.
 *
 * O Fechamento contábil **não distingue almoxarifado**; o inventário
 * físico conta PRINCIPAL e AVARIAS separadamente. Por isso a agregação
 * acontece aqui, na função pura, e não no SQL: é ela que o teste cobre.
 */

export interface ItemFechamento {
  idEmpresa: number;
  codigo: string;
  descricao: string | null;
  marca: string | null;
  estoque: number | null;
  custo: number | null;
}

export interface ItemInventario {
  idEmpresa: number;
  codigo: string;
  marca: string | null;
  contagemFinal: number | null;
}

export interface LinhaComparativo {
  idEmpresa: number;
  nomeEmpresa: string | null;
  codigo: string;
  descricao: string | null;
  marca: string | null;
  qtdeFechamento: number;
  qtdeInventario: number;
  /** Inventário − Fechamento: positivo = contagem física maior que o livro. */
  divergencia: number;
  vuCusto: number | null;
  valorDivergencia: number | null;
}

interface Acumulado {
  idEmpresa: number;
  codigo: string;
  descricao: string | null;
  marca: string | null;
  qtdeFechamento: number;
  qtdeInventario: number;
  custo: number | null;
}

export function compararQuantidades(
  fechamento: ItemFechamento[],
  inventario: ItemInventario[],
  nomePorEmpresa: Map<number, string>,
): LinhaComparativo[] {
  const porChave = new Map<string, Acumulado>();

  const obter = (idEmpresa: number, codigo: string): Acumulado => {
    const chave = `${idEmpresa}|${codigo}`;
    let item = porChave.get(chave);
    if (!item) {
      item = {
        idEmpresa,
        codigo,
        descricao: null,
        marca: null,
        qtdeFechamento: 0,
        qtdeInventario: 0,
        custo: null,
      };
      porChave.set(chave, item);
    }
    return item;
  };

  for (const f of fechamento) {
    const item = obter(f.idEmpresa, f.codigo);
    item.qtdeFechamento += f.estoque ?? 0;
    item.descricao ??= f.descricao;
    item.marca ??= f.marca;
    // Primeiro custo não nulo encontrado — todas as linhas do mesmo
    // produto no período carregam o mesmo custo do Fechamento.
    item.custo ??= f.custo;
  }

  for (const i of inventario) {
    const item = obter(i.idEmpresa, i.codigo);
    item.qtdeInventario += i.contagemFinal ?? 0;
    item.marca ??= i.marca;
  }

  return [...porChave.values()].map((item) => {
    const divergencia = item.qtdeInventario - item.qtdeFechamento;
    return {
      idEmpresa: item.idEmpresa,
      nomeEmpresa: nomePorEmpresa.get(item.idEmpresa) ?? null,
      codigo: item.codigo,
      descricao: item.descricao,
      marca: item.marca,
      qtdeFechamento: item.qtdeFechamento,
      qtdeInventario: item.qtdeInventario,
      divergencia,
      vuCusto: item.custo,
      // Sem custo, o valor fica em branco e não zero: zero afirmaria que
      // a divergência não custa nada, o que é outra informação.
      valorDivergencia: item.custo === null ? null : divergencia * item.custo,
    };
  });
}

export async function buscarComparativo(
  periodo: string,
  grupo: GrupoEmpresa,
  soDivergencias: boolean,
): Promise<{
  linhas: LinhaComparativo[];
  totalRegistros: number;
  totalDivergencias: number;
  valorTotalDivergencias: number;
}> {
  const idsEmpresa = grupo.empresas.map((e) => e.idEmpresa);
  const marcadores = idsEmpresa.map(() => '?').join(',');
  const nomePorEmpresa = new Map(grupo.empresas.map((e) => [e.idEmpresa, e.razaoSocial]));

  const [linhasFechamento] = await pool.query<RowDataPacket[]>(
    `SELECT id_empresa, codigo_auxiliar, descricao, marca, estoque, custo
       FROM estoque_fechamento_mensal
      WHERE periodo = ? AND id_empresa IN (${marcadores})
        AND codigo_auxiliar IS NOT NULL AND codigo_auxiliar <> ''`,
    [periodo, ...idsEmpresa],
  );

  // Sem GROUP BY de propósito: a soma entre almoxarifados acontece na
  // função pura acima, que é a que o teste cobre.
  const [linhasInventario] = await pool.query<RowDataPacket[]>(
    `SELECT id_empresa, cd_produto, marca, contagem_final
       FROM estoque_inventario_fisico
      WHERE periodo = ? AND id_empresa IN (${marcadores})`,
    [periodo, ...idsEmpresa],
  );

  const todas = compararQuantidades(
    linhasFechamento.map((f) => ({
      idEmpresa: Number(f.id_empresa),
      codigo: String(f.codigo_auxiliar),
      descricao: f.descricao === null ? null : String(f.descricao),
      marca: f.marca === null ? null : String(f.marca),
      estoque: f.estoque === null ? null : Number(f.estoque),
      custo: f.custo === null ? null : Number(f.custo),
    })),
    linhasInventario.map((i) => ({
      idEmpresa: Number(i.id_empresa),
      codigo: String(i.cd_produto),
      marca: i.marca === null ? null : String(i.marca),
      contagemFinal: i.contagem_final === null ? null : Number(i.contagem_final),
    })),
    nomePorEmpresa,
  );

  const divergentes = todas.filter((l) => l.divergencia !== 0);

  return {
    linhas: (soDivergencias ? divergentes : todas).sort(
      (a, b) => a.codigo.localeCompare(b.codigo) || a.idEmpresa - b.idEmpresa,
    ),
    totalRegistros: todas.length,
    totalDivergencias: divergentes.length,
    valorTotalDivergencias: divergentes.reduce((soma, l) => soma + (l.valorDivergencia ?? 0), 0),
  };
}
```

- [ ] **Step 4: Rodar o teste para ver passar**

```bash
npm run test --workspace=apps/api -- src/services/estoqueFechamentoComparativo.test.ts
```

Esperado: PASSA, 11 casos.

- [ ] **Step 5: Escrever a rota**

Crie `apps/api/src/routes/estoqueFechamentoComparativo.ts`:

```ts
import { Router } from 'express';
import { authTenant } from '../middlewares/authTenant.js';
import { requirePermissao } from '../middlewares/requirePermissao.js';
import { buscarEmpresasPermitidas } from '../services/escopoEmpresas.js';
import { buscarPeriodosDisponiveis } from '../services/estoqueCustoFechamento.js';
import { buscarComparativo } from '../services/estoqueFechamentoComparativo.js';
import { buscarGruposPermitidos, exigirGrupoPermitido } from '../services/estoqueFechamentoGrupos.js';

export const estoqueFechamentoComparativoRouter = Router();

const ROTA = '/estoque/fechamento/comparativo';

estoqueFechamentoComparativoRouter.use(authTenant);

function exigirPeriodo(valor: unknown): string {
  const texto = String(valor ?? '');
  if (!/^\d{4}-\d{2}-01$/.test(texto)) {
    const erro = new Error('Período inválido.') as Error & { statusCode: number };
    erro.statusCode = 400;
    throw erro;
  }
  return texto;
}

estoqueFechamentoComparativoRouter.get(
  '/filtros',
  requirePermissao(ROTA, 'podeVisualizar'),
  async (req, res) => {
    const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
    const [grupos, periodos] = await Promise.all([
      buscarGruposPermitidos(escopo),
      buscarPeriodosDisponiveis(),
    ]);

    res.json({ grupos: grupos.map((g) => g.grupo), periodos });
  },
);

estoqueFechamentoComparativoRouter.get('/', requirePermissao(ROTA, 'podeVisualizar'), async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const periodo = exigirPeriodo(query.periodo);
  const escopo = await buscarEmpresasPermitidas(req.usuario!.id);
  const grupo = await exigirGrupoPermitido(String(query.grupo ?? ''), escopo);

  res.json(await buscarComparativo(periodo, grupo, query.modo === 'divergencia'));
});
```

- [ ] **Step 6: Montar a rota**

Em `apps/api/src/app.ts`:

```ts
import { estoqueFechamentoComparativoRouter } from './routes/estoqueFechamentoComparativo.js';
```

```ts
app.use('/api/estoque/fechamento/comparativo', estoqueFechamentoComparativoRouter);
```

- [ ] **Step 7: Verificar**

```bash
npm run typecheck
npm run test --workspace=apps/api
```

Esperado: sem erro; suíte inteira passando.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/services/estoqueFechamentoComparativo.ts \
        apps/api/src/services/estoqueFechamentoComparativo.test.ts \
        apps/api/src/routes/estoqueFechamentoComparativo.ts apps/api/src/app.ts
git commit -m "Comparativo soma os almoxarifados do inventario antes de confrontar o fechamento"
```

---

## Task 13: As três telas de importação

**Files:**
- Create: `apps/portal/src/pages/estoque/fechamento/FormularioImportacao.tsx`
- Create: `apps/portal/src/pages/estoque/fechamento/ImportarFechamentoPage.tsx`
- Create: `apps/portal/src/pages/estoque/fechamento/ImportarEstoqueFullPage.tsx`
- Create: `apps/portal/src/pages/estoque/fechamento/ImportarInventarioPage.tsx`

**Interfaces:**
- Consumes: `useApi` de `../../../lib/useApi`; os endpoints `POST /estoque/fechamento/importar/{fechamento-mensal,estoque-full,inventario-fisico}` (Tasks 5, 6, 7).
- Produces: `function FormularioImportacao(props: PropsFormularioImportacao)` e as três páginas, consumidas pelo `App.tsx` na Task 17.

- [ ] **Step 1: Escrever o componente compartilhado**

Crie `apps/portal/src/pages/estoque/fechamento/FormularioImportacao.tsx`:

```tsx
import { useState } from 'react';
import { useApi } from '../../../lib/useApi';

/**
 * Formulário das três telas de upload do Fechamento de Custo. As telas
 * diferem só no título, no texto de ajuda, nas colunas esperadas e no
 * endpoint — a mecânica de enviar, mostrar o resumo e listar as linhas
 * ignoradas é a mesma.
 */

interface LinhaIgnorada {
  linha: number;
  motivo: string;
}

interface ResultadoImportacao {
  totalLinhas: number;
  inseridas: number;
  atualizadas: number;
  ignoradas: LinhaIgnorada[];
  produtosNaoEncontrados: number;
  empresasNaoEncontradas: number;
  custoTotal: number | null;
  periodo: string | null;
}

export interface PropsFormularioImportacao {
  titulo: string;
  descricao: string;
  /** Caminho a partir de /estoque/fechamento/importar. */
  endpoint: string;
  /** Colunas que a planilha precisa ter, exibidas como ajuda. */
  colunas: string[];
}

function inteiro(v: number): string {
  return v.toLocaleString('pt-BR');
}

function moeda(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function periodoLegivel(periodo: string | null): string {
  if (!periodo) return '—';
  const [ano, mes] = periodo.split('-');
  return `${mes}/${ano}`;
}

export function FormularioImportacao({ titulo, descricao, endpoint, colunas }: PropsFormularioImportacao) {
  const api = useApi();

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);

  async function enviar() {
    if (!arquivo) return;

    setEnviando(true);
    setErro(null);
    setResultado(null);

    try {
      const corpo = new FormData();
      corpo.append('arquivo', arquivo);
      setResultado(
        await api<ResultadoImportacao>(`/estoque/fechamento/importar/${endpoint}`, {
          method: 'POST',
          body: corpo,
        }),
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const cartao = (rotulo: string, valor: string, alerta = false) => (
    <div key={rotulo} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className={`mt-1 text-lg font-semibold ${alerta ? 'text-amber-700' : 'text-slate-900'}`}>{valor}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{titulo}</h1>
        <p className="text-sm text-slate-500">{descricao}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              setArquivo(e.target.files?.[0] ?? null);
              setResultado(null);
              setErro(null);
            }}
            className="text-sm"
          />
          <button
            type="button"
            onClick={enviar}
            disabled={!arquivo || enviando}
            className="min-h-[40px] rounded-lg bg-slate-900 px-4 text-sm text-white disabled:opacity-50"
          >
            {enviando ? 'Importando…' : 'Importar planilha'}
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Colunas esperadas (a ordem não importa): {colunas.join(', ')}.
        </p>
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      {resultado && (
        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            Importação concluída — período {periodoLegivel(resultado.periodo)}.
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {cartao('Linhas na planilha', inteiro(resultado.totalLinhas))}
            {cartao('Inseridas', inteiro(resultado.inseridas))}
            {cartao('Atualizadas', inteiro(resultado.atualizadas))}
            {cartao('Ignoradas', inteiro(resultado.ignoradas.length), resultado.ignoradas.length > 0)}
            {cartao(
              'Produtos não encontrados',
              inteiro(resultado.produtosNaoEncontrados),
              resultado.produtosNaoEncontrados > 0,
            )}
            {cartao(
              'Empresas não encontradas',
              inteiro(resultado.empresasNaoEncontradas),
              resultado.empresasNaoEncontradas > 0,
            )}
          </div>

          {resultado.custoTotal !== null && (
            <div className="grid grid-cols-1 gap-3">{cartao('Custo total da planilha', `R$ ${moeda(resultado.custoTotal)}`)}</div>
          )}

          {(resultado.produtosNaoEncontrados > 0 || resultado.empresasNaoEncontradas > 0) && (
            <p className="text-xs text-slate-500">
              Linha que não bate com o cadastro é importada assim mesmo, só marcada — a informação continua
              válida ainda que o produto não esteja sincronizado.
            </p>
          )}

          {resultado.ignoradas.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Linha</th>
                    <th className="px-3 py-2 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.ignoradas.map((i) => (
                    <tr key={i.linha} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">{i.linha}</td>
                      <td className="px-3 py-2 text-slate-600">{i.motivo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Escrever a tela de Fechamento Mensal**

Crie `apps/portal/src/pages/estoque/fechamento/ImportarFechamentoPage.tsx`:

```tsx
import { FormularioImportacao } from './FormularioImportacao';

export function ImportarFechamentoPage() {
  return (
    <FormularioImportacao
      titulo="Importar Fechamento Mensal"
      descricao="Planilha contábil do fechamento de estoque, que já traz o custo de cada produto. Reenviar a mesma planilha atualiza os valores em vez de duplicar."
      endpoint="fechamento-mensal"
      colunas={[
        'EMPRESA',
        'ID Produto',
        'Código Auxiliar',
        'Descrição',
        'NCM',
        'Un',
        'Marca',
        'Estoque',
        'Custo',
        'Total',
        'CST Venda',
        'Mês/Ano',
      ]}
    />
  );
}
```

- [ ] **Step 3: Escrever a tela de Estoque FULL**

Crie `apps/portal/src/pages/estoque/fechamento/ImportarEstoqueFullPage.tsx`:

```tsx
import { FormularioImportacao } from './FormularioImportacao';

export function ImportarEstoqueFullPage() {
  return (
    <FormularioImportacao
      titulo="Importar Estoque FULL"
      descricao="Saldo por conta e canal (Amazon, Shopee, Axado, lojas físicas). Só tem quantidade — o custo é atribuído depois, no Cálculo de Custo."
      endpoint="estoque-full"
      colunas={['ID_EMPRESA', 'CONTA', 'PERIODO', 'TIPO_SALDO', 'CD_PRODUTO', 'DC_PRODUTO', 'QTDE']}
    />
  );
}
```

- [ ] **Step 4: Escrever a tela de Inventário Físico**

Crie `apps/portal/src/pages/estoque/fechamento/ImportarInventarioPage.tsx`:

```tsx
import { FormularioImportacao } from './FormularioImportacao';

export function ImportarInventarioPage() {
  return (
    <FormularioImportacao
      titulo="Importar Inventário Físico"
      descricao="Contagem física do estoque, com até cinco rodadas mais a contagem final. O mesmo produto pode aparecer em almoxarifados diferentes."
      endpoint="inventario-fisico"
      colunas={[
        'ID_EMPRESA',
        'PERIODO',
        'CD_PRODUTO',
        'DC_PRODUTO',
        'MARCA',
        'ALMOX',
        'CONTAGEM_1',
        'CONTAGEM_2',
        'CONTAGEM_3',
        'CONTAGEM_4',
        'CONTAGEM_5',
        'CONTAGEM_FINAL',
        'SALDO_SYSEMP',
        'DIVERGENCIA',
        'ANALISE',
        'ACAO',
      ]}
    />
  );
}
```

- [ ] **Step 5: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erro. As páginas ainda não estão roteadas — isso é a Task 17.

- [ ] **Step 6: Commit**

```bash
git add apps/portal/src/pages/estoque/fechamento/
git commit -m "Portal ganha as tres telas de importacao de planilha do fechamento"
```

---

## Task 14: Tela de Cálculo de Custo

**Files:**
- Create: `apps/portal/src/pages/estoque/fechamento/CustoFechamentoPage.tsx`

**Interfaces:**
- Consumes: `useApi`, `useApiDownload`; `GET /estoque/fechamento/custo/filtros`, `POST /estoque/fechamento/custo/calcular`, `GET /estoque/fechamento/custo`, `GET /estoque/fechamento/custo/exportar`, `GET /estoque/fechamento/custo/lista-inventario` (Tasks 10 e 11).
- Produces: `function CustoFechamentoPage()`, consumida pelo `App.tsx` na Task 17.

- [ ] **Step 1: Escrever a página**

Crie `apps/portal/src/pages/estoque/fechamento/CustoFechamentoPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useApi, useApiDownload } from '../../../lib/useApi';

interface LinhaCusto {
  id_empresa: number | null;
  nome_empresa: string | null;
  origem: string;
  codigo_auxiliar: string | null;
  descricao_produto: string | null;
  marca: string | null;
  unidade: string | null;
  ncm: string | null;
  conta: string | null;
  tipo_saldo: string | null;
  qtde: number | null;
  vu_custo_estoque: number | null;
  vu_custo_venda: number | null;
  vu_custo: number | null;
  valor_custo_total: number | null;
}

interface ResumoCalculo {
  linhasFechamento: number;
  linhasEstoqueFull: number;
  usouCustoEstoque: number;
  usouCustoVenda: number;
  semCusto: number;
  totalGeral: number;
}

const TAMANHO_PAGINA = 50;

function num(v: number | null, casas = 4): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function inteiro(v: number): string {
  return v.toLocaleString('pt-BR');
}

function periodoLegivel(periodo: string): string {
  const [ano, mes] = periodo.split('-');
  return `${mes}/${ano}`;
}

export function CustoFechamentoPage() {
  const api = useApi();
  const baixar = useApiDownload();

  const [opcoes, setOpcoes] = useState<{ grupos: string[]; periodos: string[] }>({ grupos: [], periodos: [] });
  const [grupo, setGrupo] = useState('');
  const [periodo, setPeriodo] = useState('');

  const [linhas, setLinhas] = useState<LinhaCusto[]>([]);
  const [total, setTotal] = useState(0);
  const [totalGeral, setTotalGeral] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [dataFechamento, setDataFechamento] = useState<string | null>(null);

  const [resumo, setResumo] = useState<ResumoCalculo | null>(null);
  const [percentual, setPercentual] = useState<number | null>(null);

  const [carregando, setCarregando] = useState(false);
  const [calculando, setCalculando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<typeof opcoes>('/estoque/fechamento/custo/filtros')
      .then(setOpcoes)
      .catch((e: Error) => setErro(e.message));
  }, [api]);

  const carregar = useCallback(
    async (paginaAlvo: number) => {
      if (!grupo || !periodo) return;

      setCarregando(true);
      setErro(null);
      try {
        const params = new URLSearchParams({
          grupo,
          periodo,
          pagina: String(paginaAlvo),
          tamanhoPagina: String(TAMANHO_PAGINA),
        });
        const dados = await api<{
          linhas: LinhaCusto[];
          total: number;
          totalGeral: number;
          dataFechamento: string;
        }>(`/estoque/fechamento/custo?${params.toString()}`);

        setLinhas(dados.linhas);
        setTotal(dados.total);
        setTotalGeral(dados.totalGeral);
        setDataFechamento(dados.dataFechamento);
        setPagina(paginaAlvo);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setCarregando(false);
      }
    },
    [api, grupo, periodo],
  );

  useEffect(() => {
    setResumo(null);
    carregar(1).catch(console.error);
  }, [carregar]);

  async function calcular() {
    setCalculando(true);
    setErro(null);
    try {
      const dados = await api<{ resumo: ResumoCalculo; percentualCustoVenda: number }>(
        '/estoque/fechamento/custo/calcular',
        { method: 'POST', body: { grupo, periodo } },
      );
      setResumo(dados.resumo);
      setPercentual(dados.percentualCustoVenda);
      await carregar(1);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCalculando(false);
    }
  }

  async function exportar(caminho: string, nomeArquivo: string) {
    setBaixando(caminho);
    try {
      const params = new URLSearchParams({ grupo, periodo });
      await baixar(`/estoque/fechamento/custo${caminho}?${params.toString()}`, { nomeArquivo });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBaixando(null);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA));
  const podeAgir = grupo !== '' && periodo !== '';
  const sufixo = podeAgir ? `${grupo}-${periodo.slice(0, 7)}` : '';

  const cartao = (rotulo: string, valor: string, alerta = false) => (
    <div key={rotulo} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className={`mt-1 text-lg font-semibold ${alerta ? 'text-amber-700' : 'text-slate-900'}`}>{valor}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Cálculo de Custo de Fechamento</h1>
        <p className="text-sm text-slate-500">
          Junta o Fechamento Mensal (que já tem custo próprio) com o Estoque FULL, valorizado pelo custo do
          Fechamento ou, na falta dele, por um percentual do preço de venda. Recalcular substitui o cálculo
          anterior deste grupo e período.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Selecione o grupo…</option>
          {opcoes.grupos.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Selecione o período…</option>
          {opcoes.periodos.map((p) => (
            <option key={p} value={p}>
              {periodoLegivel(p)}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={calcular}
          disabled={!podeAgir || calculando}
          className="min-h-[40px] rounded-lg bg-slate-900 px-4 text-sm text-white disabled:opacity-50"
        >
          {calculando ? 'Calculando…' : 'Calcular custo'}
        </button>

        <button
          type="button"
          onClick={() => exportar('/lista-inventario', `lista-inventario-${sufixo}.xlsx`)}
          disabled={!podeAgir || total === 0 || baixando !== null}
          className="min-h-[40px] rounded-lg border border-slate-300 px-4 text-sm text-slate-700 disabled:opacity-50"
        >
          {baixando === '/lista-inventario' ? 'Gerando…' : 'Gerar Lista de Inventário'}
        </button>

        <button
          type="button"
          onClick={() => exportar('/exportar', `custo-fechamento-${sufixo}.xlsx`)}
          disabled={!podeAgir || total === 0 || baixando !== null}
          className="min-h-[40px] rounded-lg border border-slate-300 px-4 text-sm text-slate-700 disabled:opacity-50"
        >
          {baixando === '/exportar' ? 'Exportando…' : 'Exportar Excel'}
        </button>
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      {resumo && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {cartao('Linhas do Fechamento', inteiro(resumo.linhasFechamento))}
          {cartao('Linhas do Estoque FULL', inteiro(resumo.linhasEstoqueFull))}
          {cartao('Usou custo de estoque', inteiro(resumo.usouCustoEstoque))}
          {cartao(
            percentual === null ? 'Usou preço de venda' : `Usou ${percentual}% do preço de venda`,
            inteiro(resumo.usouCustoVenda),
          )}
          {cartao('Sem custo encontrado', inteiro(resumo.semCusto), resumo.semCusto > 0)}
          {cartao('Custo total geral', `R$ ${num(resumo.totalGeral, 2)}`)}
        </div>
      )}

      {podeAgir && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {cartao('Registros no período/grupo', inteiro(total))}
          {cartao('Custo total geral (somado no banco)', `R$ ${num(totalGeral, 2)}`)}
          {cartao(
            'Data do fechamento',
            dataFechamento ? new Date(dataFechamento).toLocaleDateString('pt-BR') : '—',
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Origem</th>
              <th className="px-3 py-2 font-medium">Empresa</th>
              <th className="px-3 py-2 font-medium">Cód.</th>
              <th className="px-3 py-2 font-medium">Produto</th>
              <th className="px-3 py-2 font-medium">Marca</th>
              <th className="px-3 py-2 font-medium">Un.</th>
              <th className="px-3 py-2 font-medium">NCM</th>
              <th className="px-3 py-2 font-medium">Conta</th>
              <th className="px-3 py-2 font-medium">Situação</th>
              <th className="px-3 py-2 text-right font-medium">Qtde</th>
              <th className="px-3 py-2 text-right font-medium">VU Custo Estoque</th>
              <th className="px-3 py-2 text-right font-medium">VU Custo Venda</th>
              <th className="px-3 py-2 text-right font-medium">VU Custo Adotado</th>
              <th className="px-3 py-2 text-right font-medium">Valor Custo Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-6 text-center text-slate-500">
                  {carregando
                    ? 'Carregando…'
                    : podeAgir
                      ? 'Nenhum registro calculado para este grupo e período ainda — clique em "Calcular custo".'
                      : 'Selecione o grupo e o período.'}
                </td>
              </tr>
            )}
            {linhas.map((l, i) => (
              <tr key={`${l.origem}-${l.id_empresa}-${l.codigo_auxiliar}-${i}`} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      l.origem === 'FECHAMENTO' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {l.origem === 'FECHAMENTO' ? 'Fechamento' : 'Estoque FULL'}
                  </span>
                </td>
                <td className="px-3 py-2">{l.nome_empresa ?? '—'}</td>
                <td className="px-3 py-2">{l.codigo_auxiliar ?? '—'}</td>
                <td className="px-3 py-2">{l.descricao_produto ?? '—'}</td>
                <td className="px-3 py-2">{l.marca ?? '—'}</td>
                <td className="px-3 py-2">{l.unidade ?? '—'}</td>
                <td className="px-3 py-2">{l.ncm ?? '—'}</td>
                <td className="px-3 py-2">{l.conta ?? '—'}</td>
                <td className="px-3 py-2">{l.tipo_saldo ?? '—'}</td>
                <td className="px-3 py-2 text-right">{num(l.qtde)}</td>
                <td className="px-3 py-2 text-right">{num(l.vu_custo_estoque)}</td>
                <td className="px-3 py-2 text-right">{num(l.vu_custo_venda)}</td>
                <td className="px-3 py-2 text-right">{num(l.vu_custo)}</td>
                <td className="px-3 py-2 text-right">{num(l.valor_custo_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > TAMANHO_PAGINA && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            Página {pagina} de {totalPaginas} · {inteiro(total)} registros
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

Esperado: sem erro.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/src/pages/estoque/fechamento/CustoFechamentoPage.tsx
git commit -m "Portal ganha a tela de calculo de custo, com grade paginada e as duas exportacoes"
```

---

## Task 15: Tela do Comparativo

**Files:**
- Create: `apps/portal/src/pages/estoque/fechamento/ComparativoPage.tsx`

**Interfaces:**
- Consumes: `useApi`; `GET /estoque/fechamento/comparativo/filtros` e `GET /estoque/fechamento/comparativo` (Task 12).
- Produces: `function ComparativoPage()`, consumida pelo `App.tsx` na Task 17.

- [ ] **Step 1: Escrever a página**

Crie `apps/portal/src/pages/estoque/fechamento/ComparativoPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../../lib/useApi';

interface LinhaComparativo {
  idEmpresa: number;
  nomeEmpresa: string | null;
  codigo: string;
  descricao: string | null;
  marca: string | null;
  qtdeFechamento: number;
  qtdeInventario: number;
  divergencia: number;
  vuCusto: number | null;
  valorDivergencia: number | null;
}

function num(v: number | null, casas = 4): string {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function inteiro(v: number): string {
  return v.toLocaleString('pt-BR');
}

function periodoLegivel(periodo: string): string {
  const [ano, mes] = periodo.split('-');
  return `${mes}/${ano}`;
}

export function ComparativoPage() {
  const api = useApi();

  const [opcoes, setOpcoes] = useState<{ grupos: string[]; periodos: string[] }>({ grupos: [], periodos: [] });
  const [grupo, setGrupo] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [soDivergencias, setSoDivergencias] = useState(false);

  const [linhas, setLinhas] = useState<LinhaComparativo[]>([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalDivergencias, setTotalDivergencias] = useState(0);
  const [valorTotalDivergencias, setValorTotalDivergencias] = useState(0);

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api<typeof opcoes>('/estoque/fechamento/comparativo/filtros')
      .then(setOpcoes)
      .catch((e: Error) => setErro(e.message));
  }, [api]);

  const carregar = useCallback(async () => {
    if (!grupo || !periodo) {
      setLinhas([]);
      return;
    }

    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams({ grupo, periodo });
      if (soDivergencias) params.set('modo', 'divergencia');

      const dados = await api<{
        linhas: LinhaComparativo[];
        totalRegistros: number;
        totalDivergencias: number;
        valorTotalDivergencias: number;
      }>(`/estoque/fechamento/comparativo?${params.toString()}`);

      setLinhas(dados.linhas);
      setTotalRegistros(dados.totalRegistros);
      setTotalDivergencias(dados.totalDivergencias);
      setValorTotalDivergencias(dados.valorTotalDivergencias);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [api, grupo, periodo, soDivergencias]);

  useEffect(() => {
    carregar().catch(console.error);
  }, [carregar]);

  const cartao = (rotulo: string, valor: string, alerta = false) => (
    <div key={rotulo} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className={`mt-1 text-lg font-semibold ${alerta ? 'text-amber-700' : 'text-slate-900'}`}>{valor}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Comparar Inventário × Fechamento</h1>
        <p className="text-sm text-slate-500">
          Confronta a contagem física com o estoque do livro. A contagem é somada entre almoxarifados antes de
          comparar, porque o Fechamento não distingue almoxarifado. Divergência positiva significa contagem
          física maior que o livro.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={grupo}
          onChange={(e) => setGrupo(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Selecione o grupo…</option>
          {opcoes.grupos.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>

        <select
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Selecione o período…</option>
          {opcoes.periodos.map((p) => (
            <option key={p} value={p}>
              {periodoLegivel(p)}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={soDivergencias}
            onChange={(e) => setSoDivergencias(e.target.checked)}
          />
          Só divergências
        </label>
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      {grupo && periodo && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {cartao('Itens comparados', inteiro(totalRegistros))}
          {cartao('Itens com divergência', inteiro(totalDivergencias), totalDivergencias > 0)}
          {cartao('Valor total das divergências', `R$ ${num(valorTotalDivergencias, 2)}`, valorTotalDivergencias !== 0)}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Empresa</th>
              <th className="px-3 py-2 font-medium">Cód.</th>
              <th className="px-3 py-2 font-medium">Produto</th>
              <th className="px-3 py-2 font-medium">Marca</th>
              <th className="px-3 py-2 text-right font-medium">Qtde Fechamento</th>
              <th className="px-3 py-2 text-right font-medium">Qtde Inventário</th>
              <th className="px-3 py-2 text-right font-medium">Divergência</th>
              <th className="px-3 py-2 text-right font-medium">VU Custo</th>
              <th className="px-3 py-2 text-right font-medium">Valor da Divergência</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                  {carregando
                    ? 'Carregando…'
                    : grupo && periodo
                      ? 'Nenhum item para este grupo e período — importe o Fechamento e o Inventário Físico.'
                      : 'Selecione o grupo e o período.'}
                </td>
              </tr>
            )}
            {linhas.map((l) => (
              <tr key={`${l.idEmpresa}-${l.codigo}`} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2">{l.nomeEmpresa ?? '—'}</td>
                <td className="px-3 py-2">{l.codigo}</td>
                <td className="px-3 py-2">{l.descricao ?? '—'}</td>
                <td className="px-3 py-2">{l.marca ?? '—'}</td>
                <td className="px-3 py-2 text-right">{num(l.qtdeFechamento)}</td>
                <td className="px-3 py-2 text-right">{num(l.qtdeInventario)}</td>
                <td
                  className={`px-3 py-2 text-right ${
                    l.divergencia === 0 ? '' : l.divergencia > 0 ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {num(l.divergencia)}
                </td>
                <td className="px-3 py-2 text-right">{num(l.vuCusto)}</td>
                <td className="px-3 py-2 text-right">{num(l.valorDivergencia, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erro.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/src/pages/estoque/fechamento/ComparativoPage.tsx
git commit -m "Portal ganha a tela de comparativo entre inventario e fechamento"
```

---

## Task 16: Tela de Logs de Importação

**Files:**
- Create: `apps/portal/src/pages/estoque/fechamento/LogsImportacaoPage.tsx`

**Interfaces:**
- Consumes: `useApi`; `GET /estoque/fechamento/logs` (Task 4).
- Produces: `function LogsImportacaoPage()`, consumida pelo `App.tsx` na Task 17.

- [ ] **Step 1: Escrever a página**

Crie `apps/portal/src/pages/estoque/fechamento/LogsImportacaoPage.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../../../lib/useApi';

interface LinhaLog {
  id: number;
  tipo: string;
  arquivo: string | null;
  periodo: string | null;
  total_linhas: number;
  inseridas: number;
  atualizadas: number;
  ignoradas: number;
  produtos_nao_encontrados: number;
  empresas_nao_encontradas: number;
  custo_total: number | null;
  observacoes: string | null;
  usuario: string | null;
  executado_em: string;
}

const ROTULO_TIPO: Record<string, string> = {
  fechamento_estoque: 'Fechamento Mensal',
  estoque_full: 'Estoque FULL',
  inventario_fisico: 'Inventário Físico',
};

function inteiro(v: number): string {
  return v.toLocaleString('pt-BR');
}

function moeda(v: number | null): string {
  if (v === null) return '—';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function periodoLegivel(periodo: string | null): string {
  if (!periodo) return '—';
  const data = new Date(periodo);
  return `${String(data.getUTCMonth() + 1).padStart(2, '0')}/${data.getUTCFullYear()}`;
}

export function LogsImportacaoPage() {
  const api = useApi();

  const [tipo, setTipo] = useState('');
  const [linhas, setLinhas] = useState<LinhaLog[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams();
      if (tipo) params.set('tipo', tipo);

      const dados = await api<{ linhas: LinhaLog[] }>(`/estoque/fechamento/logs?${params.toString()}`);
      setLinhas(dados.linhas);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [api, tipo]);

  useEffect(() => {
    carregar().catch(console.error);
  }, [carregar]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Logs de Importação</h1>
        <p className="text-sm text-slate-500">
          Histórico das importações de planilha do Fechamento de Custo — as 300 execuções mais recentes.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="min-h-[40px] rounded-lg border border-slate-300 px-3 text-sm"
        >
          <option value="">Todos os tipos</option>
          {Object.entries(ROTULO_TIPO).map(([chave, rotulo]) => (
            <option key={chave} value={chave}>
              {rotulo}
            </option>
          ))}
        </select>
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">Quando</th>
              <th className="px-3 py-2 font-medium">Tipo</th>
              <th className="px-3 py-2 font-medium">Arquivo</th>
              <th className="px-3 py-2 font-medium">Período</th>
              <th className="px-3 py-2 text-right font-medium">Linhas</th>
              <th className="px-3 py-2 text-right font-medium">Inseridas</th>
              <th className="px-3 py-2 text-right font-medium">Atualizadas</th>
              <th className="px-3 py-2 text-right font-medium">Ignoradas</th>
              <th className="px-3 py-2 text-right font-medium">Prod. não achados</th>
              <th className="px-3 py-2 text-right font-medium">Emp. não achadas</th>
              <th className="px-3 py-2 text-right font-medium">Custo total</th>
              <th className="px-3 py-2 font-medium">Usuário</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-6 text-center text-slate-500">
                  {carregando ? 'Carregando…' : 'Nenhuma importação registrada ainda.'}
                </td>
              </tr>
            )}
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0 align-top">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(l.executado_em).toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2">{ROTULO_TIPO[l.tipo] ?? l.tipo}</td>
                <td className="px-3 py-2">
                  {l.arquivo ?? '—'}
                  {l.observacoes && (
                    <div className="mt-1 max-w-md whitespace-pre-line text-xs text-slate-500">{l.observacoes}</div>
                  )}
                </td>
                <td className="px-3 py-2">{periodoLegivel(l.periodo)}</td>
                <td className="px-3 py-2 text-right">{inteiro(l.total_linhas)}</td>
                <td className="px-3 py-2 text-right">{inteiro(l.inseridas)}</td>
                <td className="px-3 py-2 text-right">{inteiro(l.atualizadas)}</td>
                <td className={`px-3 py-2 text-right ${l.ignoradas > 0 ? 'font-semibold text-amber-700' : ''}`}>
                  {inteiro(l.ignoradas)}
                </td>
                <td
                  className={`px-3 py-2 text-right ${l.produtos_nao_encontrados > 0 ? 'font-semibold text-amber-700' : ''}`}
                >
                  {inteiro(l.produtos_nao_encontrados)}
                </td>
                <td
                  className={`px-3 py-2 text-right ${l.empresas_nao_encontradas > 0 ? 'font-semibold text-amber-700' : ''}`}
                >
                  {inteiro(l.empresas_nao_encontradas)}
                </td>
                <td className="px-3 py-2 text-right">{moeda(l.custo_total)}</td>
                <td className="px-3 py-2">{l.usuario ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sem erro.

- [ ] **Step 3: Commit**

```bash
git add apps/portal/src/pages/estoque/fechamento/LogsImportacaoPage.tsx
git commit -m "Portal ganha a tela de logs das importacoes de planilha"
```

---

## Task 17: Ligar as rotas e tornar as telas visíveis

Esta é a tarefa que faz as seis telas existirem para o portal. As duas
pontas — rota no `App.tsx` e linha em `telas_modulo` — **sobem no mesmo
commit**: a linha em `telas_modulo` já aparece no menu, então só pode ser
seedada depois que a rota existir.

**Files:**
- Modify: `apps/portal/src/App.tsx`
- Create: `apps/api/db/031_estoque_fechamento_seed.sql`

**Interfaces:**
- Consumes: as seis páginas (Tasks 13 a 16) e os quatro routers (Tasks 4, 5, 10, 12).
- Produces: as seis rotas do portal e as seis linhas em `telas_modulo`.

- [ ] **Step 1: Acrescentar as rotas no App.tsx**

Em `apps/portal/src/App.tsx`, junto dos imports de estoque:

```tsx
import { ComparativoPage } from './pages/estoque/fechamento/ComparativoPage';
import { CustoFechamentoPage } from './pages/estoque/fechamento/CustoFechamentoPage';
import { ImportarEstoqueFullPage } from './pages/estoque/fechamento/ImportarEstoqueFullPage';
import { ImportarFechamentoPage } from './pages/estoque/fechamento/ImportarFechamentoPage';
import { ImportarInventarioPage } from './pages/estoque/fechamento/ImportarInventarioPage';
import { LogsImportacaoPage } from './pages/estoque/fechamento/LogsImportacaoPage';
```

e, logo abaixo de `<Route path="/estoque/saldos" … />`:

```tsx
<Route path="/estoque/fechamento/importar" element={<ImportarFechamentoPage />} />
<Route path="/estoque/fechamento/estoque-full" element={<ImportarEstoqueFullPage />} />
<Route path="/estoque/fechamento/inventario" element={<ImportarInventarioPage />} />
<Route path="/estoque/fechamento/custo" element={<CustoFechamentoPage />} />
<Route path="/estoque/fechamento/comparativo" element={<ComparativoPage />} />
<Route path="/estoque/fechamento/logs" element={<LogsImportacaoPage />} />
```

- [ ] **Step 2: Escrever o seed das telas**

Crie `apps/api/db/031_estoque_fechamento_seed.sql`:

```sql
-- As seis telas do Fechamento de Custo no modulo Estoque.
-- Ver Specs/spec_modulo_estoque.md, secao 3.2.
--
-- A linha em telas_modulo ja aparece no menu, entao so pode ser seedada
-- depois que a rota existir no App.tsx e o router em app.ts - as duas
-- pontas sobem no mesmo commit/deploy.
--
-- Isto NAO concede permissao a ninguem, nem a administrador: as telas
-- ficam invisiveis ate alguem marca-las em Configurador -> Perfis ->
-- Salvar. Nenhuma migration do projeto concede permissao - e decisao de
-- negocio, nao de deploy.

INSERT INTO telas_modulo (modulo_id, nome_tela, rota_tela)
SELECT m.id, t.nome_tela, t.rota_tela
FROM modulos_sistema m
JOIN (
    SELECT 'Importar Fechamento Mensal' AS nome_tela, '/estoque/fechamento/importar' AS rota_tela
    UNION ALL SELECT 'Importar Estoque FULL', '/estoque/fechamento/estoque-full'
    UNION ALL SELECT 'Importar Inventario Fisico', '/estoque/fechamento/inventario'
    UNION ALL SELECT 'Calculo de Custo de Fechamento', '/estoque/fechamento/custo'
    UNION ALL SELECT 'Comparar Inventario x Fechamento', '/estoque/fechamento/comparativo'
    UNION ALL SELECT 'Logs de Importacao', '/estoque/fechamento/logs'
) t ON m.chave_modulo = 'ESTOQUE'
WHERE NOT EXISTS (
    SELECT 1 FROM telas_modulo existente
    WHERE existente.modulo_id = m.id AND existente.rota_tela = t.rota_tela
);
```

- [ ] **Step 3: Aplicar e verificar**

```bash
npm run db:migrate
npm run typecheck
npm run test --workspace=apps/api
```

Esperado: `031` aplicada; typecheck limpo; suíte passando.

- [ ] **Step 4: Conferir as telas no portal**

Suba os dois processos, em terminais separados:

```bash
npm run dev:api
```

```bash
npm run dev:portal
```

Entre no portal, vá em **Configurador → Perfis**, marque as seis telas novas
no seu perfil e salve. Sem isso elas não aparecem — nem para administrador.

Depois, percorra as seis telas e confirme:

1. As três de importação carregam e mostram as colunas esperadas.
2. Cálculo de Custo lista grupos e períodos nos dois seletores.
3. Comparativo lista grupos e períodos.
4. Logs de Importação carrega (vazio é resultado válido).

Se o seletor de grupos vier vazio, o usuário não tem empresa vinculada em
`usuarios_empresas` — é a falha fechada funcionando, não um bug. Vincule
as empresas ao usuário e recarregue.

- [ ] **Step 5: Commit**

```bash
git add apps/portal/src/App.tsx apps/api/db/031_estoque_fechamento_seed.sql
git commit -m "Seis telas do Fechamento de Custo passam a existir no menu do Estoque"
```

---

## Task 18: Carga do histórico do banco antigo

**Files:**
- Create: `apps/api/src/scripts/migrarFechamentoLegado.ts`
- Modify: `apps/api/package.json` (novo script)
- Modify: `apps/api/.env.example` (documenta as variáveis do banco legado)

**Interfaces:**
- Consumes: `pool` de `../config/database.js` (destino); `mysql2/promise` direto (origem).
- Produces: o comando `npm run migracao:fechamento --workspace=apps/api`.

- [ ] **Step 1: Escrever o script**

Crie `apps/api/src/scripts/migrarFechamentoLegado.ts`:

```ts
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../config/database.js';

/**
 * Carga única do histórico de Fechamento de Custo do portal PHP anterior
 * (`jnakao-digital-ocean`) para este banco. Ver
 * Specs/spec_modulo_estoque.md, seção 3.12.
 *
 * Os dois bancos são clusters diferentes em produção, então abrimos um
 * segundo pool para o antigo, lido de variáveis de ambiente passadas na
 * execução — nenhuma credencial no repositório.
 *
 *   LEGADO_DB_HOST=... LEGADO_DB_USER=... LEGADO_DB_PASSWORD=... \
 *   LEGADO_DB_NAME=defaultdb \
 *   npm run migracao:fechamento --workspace=apps/api -- --dry-run
 *
 * Opções:
 *   --dry-run          não grava nada; relata contagens e chaves órfãs
 *   --periodo=AAAA-MM  carrega só um período
 *
 * Usa o **mesmo upsert das importações**: reexecutar não duplica.
 */

interface Opcoes {
  dryRun: boolean;
  periodo: string | null;
}

function lerOpcoes(argv: string[]): Opcoes {
  const periodoArg = argv.find((a) => a.startsWith('--periodo='))?.split('=')[1] ?? null;

  if (periodoArg !== null && !/^\d{4}-\d{2}$/.test(periodoArg)) {
    throw new Error('--periodo espera AAAA-MM (ex: --periodo=2026-07).');
  }

  return { dryRun: argv.includes('--dry-run'), periodo: periodoArg };
}

function exigirEnv(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente ${nome} não definida — ela aponta para o banco antigo.`);
  }
  return valor;
}

function conectarLegado() {
  return mysql.createPool({
    host: exigirEnv('LEGADO_DB_HOST'),
    port: Number(process.env.LEGADO_DB_PORT ?? 3306),
    user: exigirEnv('LEGADO_DB_USER'),
    password: exigirEnv('LEGADO_DB_PASSWORD'),
    database: exigirEnv('LEGADO_DB_NAME'),
    timezone: '-03:00',
    connectionLimit: 4,
    ssl: process.env.LEGADO_DB_CA_CERT
      ? { ca: process.env.LEGADO_DB_CA_CERT, rejectUnauthorized: true }
      : undefined,
  });
}

/** Cláusula de período, aplicada igual em todas as tabelas. */
function filtroPeriodo(opcoes: Opcoes, coluna = 'periodo'): { where: string; params: string[] } {
  if (!opcoes.periodo) return { where: '', params: [] };
  return { where: ` WHERE ${coluna} = ?`, params: [`${opcoes.periodo}-01`] };
}

const TAMANHO_LOTE = 500;

async function emLotes<T>(itens: T[], acao: (lote: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
    await acao(itens.slice(i, i + TAMANHO_LOTE));
  }
}

async function main() {
  const opcoes = lerOpcoes(process.argv.slice(2));
  const legado = conectarLegado();

  console.log(
    `Carga do Fechamento de Custo — ${opcoes.dryRun ? 'DRY RUN (nada será gravado)' : 'GRAVANDO'}` +
      `${opcoes.periodo ? `, período ${opcoes.periodo}` : ', todos os períodos'}`,
  );

  try {
    // ---- Cadastro do destino, para o dry-run apontar chaves órfãs ----
    const [empresasDestino] = await pool.query<RowDataPacket[]>(
      'SELECT id_empresa, TRIM(razao_social) AS razao_social FROM sysemp_empresa',
    );
    const idEmpresaPorRazao = new Map(
      empresasDestino.map((e) => [String(e.razao_social), Number(e.id_empresa)]),
    );
    const idsEmpresa = new Set(empresasDestino.map((e) => Number(e.id_empresa)));

    const [produtosDestino] = await pool.query<RowDataPacket[]>(
      'SELECT id_produto, codigo_auxiliar FROM sysemp_produto',
    );
    const idsProduto = new Set(produtosDestino.map((p) => Number(p.id_produto)));
    const codigosProduto = new Set(
      produtosDestino.filter((p) => p.codigo_auxiliar !== null).map((p) => String(p.codigo_auxiliar)),
    );

    // ---- 1. Fechamento Mensal ----
    const f = filtroPeriodo(opcoes);
    const [fechamento] = await legado.query<RowDataPacket[]>(
      `SELECT periodo, empresa, id_produto, codigo_auxiliar, descricao, ncm, unidade, marca,
              estoque, custo, total, cst_venda, produto_encontrado
         FROM tb_fechamento_estoque_mensal${f.where}`,
      f.params,
    );

    const razoesOrfas = new Set(
      fechamento
        .map((r) => String(r.empresa).trim())
        .filter((razao) => !idEmpresaPorRazao.has(razao)),
    );
    const produtosOrfaos = fechamento.filter((r) => !idsProduto.has(Number(r.id_produto))).length;

    console.log(
      `\ntb_fechamento_estoque_mensal: ${fechamento.length} linha(s)` +
        `\n  razões sociais sem empresa no destino: ${razoesOrfas.size}` +
        (razoesOrfas.size > 0 ? ` → ${[...razoesOrfas].slice(0, 10).join(' | ')}` : '') +
        `\n  linhas com id_produto sem cadastro no destino: ${produtosOrfaos}`,
    );

    if (!opcoes.dryRun) {
      await emLotes(fechamento, async (lote) => {
        const marcadores = lote.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
        await pool.query(
          `INSERT INTO estoque_fechamento_mensal
             (periodo, empresa, id_empresa, id_produto, codigo_auxiliar, descricao, ncm, unidade,
              marca, estoque, custo, total, cst_venda, produto_encontrado, empresa_encontrada)
           VALUES ${marcadores}
           ON DUPLICATE KEY UPDATE
             id_empresa = VALUES(id_empresa), codigo_auxiliar = VALUES(codigo_auxiliar),
             descricao = VALUES(descricao), ncm = VALUES(ncm), unidade = VALUES(unidade),
             marca = VALUES(marca), estoque = VALUES(estoque), custo = VALUES(custo),
             total = VALUES(total), cst_venda = VALUES(cst_venda),
             produto_encontrado = VALUES(produto_encontrado),
             empresa_encontrada = VALUES(empresa_encontrada)`,
          lote.flatMap((r) => {
            const razao = String(r.empresa).trim();
            const idEmpresa = idEmpresaPorRazao.get(razao) ?? null;
            return [
              r.periodo, razao, idEmpresa, r.id_produto, r.codigo_auxiliar, r.descricao, r.ncm,
              r.unidade, r.marca, r.estoque, r.custo, r.total, r.cst_venda,
              idsProduto.has(Number(r.id_produto)), idEmpresa !== null,
            ];
          }),
        );
      });
    }

    // ---- 2. Estoque FULL ----
    const [full] = await legado.query<RowDataPacket[]>(
      `SELECT periodo, id_empresa, conta, tipo_saldo, cd_produto, qtde
         FROM tb_estoque_full_importado${f.where}`,
      f.params,
    );

    console.log(
      `\ntb_estoque_full_importado: ${full.length} linha(s)` +
        `\n  linhas com empresa sem cadastro no destino: ${full.filter((r) => !idsEmpresa.has(Number(r.id_empresa))).length}` +
        `\n  linhas com cd_produto sem cadastro no destino: ${full.filter((r) => !codigosProduto.has(String(r.cd_produto))).length}`,
    );

    if (!opcoes.dryRun) {
      await emLotes(full, async (lote) => {
        const marcadores = lote.map(() => '(?,?,?,?,?,?,?,?)').join(',');
        await pool.query(
          `INSERT INTO estoque_full_importado
             (periodo, id_empresa, conta, tipo_saldo, cd_produto, qtde, produto_encontrado, empresa_encontrada)
           VALUES ${marcadores}
           ON DUPLICATE KEY UPDATE
             qtde = VALUES(qtde), produto_encontrado = VALUES(produto_encontrado),
             empresa_encontrada = VALUES(empresa_encontrada)`,
          lote.flatMap((r) => [
            r.periodo, r.id_empresa, r.conta, r.tipo_saldo, r.cd_produto, r.qtde,
            codigosProduto.has(String(r.cd_produto)), idsEmpresa.has(Number(r.id_empresa)),
          ]),
        );
      });
    }

    // ---- 3. Inventário Físico ----
    const [inventario] = await legado.query<RowDataPacket[]>(
      `SELECT periodo, id_empresa, cd_produto, almox, marca, contagem_1, contagem_2, contagem_3,
              contagem_4, contagem_5, contagem_final, saldo_sysemp, divergencia, analise, acao
         FROM tb_inventario_fisico${f.where}`,
      f.params,
    );

    console.log(`\ntb_inventario_fisico: ${inventario.length} linha(s)`);

    if (!opcoes.dryRun) {
      await emLotes(inventario, async (lote) => {
        const marcadores = lote.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
        await pool.query(
          `INSERT INTO estoque_inventario_fisico
             (periodo, id_empresa, cd_produto, almox, marca, contagem_1, contagem_2, contagem_3,
              contagem_4, contagem_5, contagem_final, saldo_sysemp, divergencia, analise, acao,
              produto_encontrado, empresa_encontrada)
           VALUES ${marcadores}
           ON DUPLICATE KEY UPDATE
             marca = VALUES(marca), contagem_1 = VALUES(contagem_1), contagem_2 = VALUES(contagem_2),
             contagem_3 = VALUES(contagem_3), contagem_4 = VALUES(contagem_4),
             contagem_5 = VALUES(contagem_5), contagem_final = VALUES(contagem_final),
             saldo_sysemp = VALUES(saldo_sysemp), divergencia = VALUES(divergencia),
             analise = VALUES(analise), acao = VALUES(acao),
             produto_encontrado = VALUES(produto_encontrado),
             empresa_encontrada = VALUES(empresa_encontrada)`,
          lote.flatMap((r) => [
            r.periodo, r.id_empresa, r.cd_produto, r.almox ?? '', r.marca,
            r.contagem_1, r.contagem_2, r.contagem_3, r.contagem_4, r.contagem_5,
            r.contagem_final, r.saldo_sysemp, r.divergencia, r.analise, r.acao,
            codigosProduto.has(String(r.cd_produto)), idsEmpresa.has(Number(r.id_empresa)),
          ]),
        );
      });
    }

    // ---- 4. Cálculo de custo já rodado ----
    const [custo] = await legado.query<RowDataPacket[]>(
      `SELECT data_calculo_custo, periodo, grupo_empresa, id_empresa, nome_empresa, origem,
              id_produto, codigo_auxiliar, descricao_produto, marca, unidade, ncm, conta,
              tipo_saldo, qtde, vu_custo_estoque, vu_custo_venda, vu_custo, valor_custo_total
         FROM tb_calculo_custo_fechamento${f.where}`,
      f.params,
    );

    console.log(`\ntb_calculo_custo_fechamento: ${custo.length} linha(s)`);

    if (!opcoes.dryRun) {
      // A tabela não tem chave única — a idempotência vem de apagar o par
      // (periodo, grupo) antes de inserir, igual ao que o recálculo faz.
      const pares = new Set(custo.map((r) => `${String(r.periodo)}|${String(r.grupo_empresa)}`));
      for (const par of pares) {
        const [periodo, grupo] = par.split('|');
        await pool.query(
          'DELETE FROM estoque_custo_fechamento WHERE periodo = ? AND grupo_empresa = ?',
          [periodo, grupo],
        );
      }

      await emLotes(custo, async (lote) => {
        const marcadores = lote.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
        await pool.query(
          `INSERT INTO estoque_custo_fechamento
             (data_calculo_custo, periodo, grupo_empresa, id_empresa, nome_empresa, origem,
              id_produto, codigo_auxiliar, descricao_produto, marca, unidade, ncm, conta,
              tipo_saldo, qtde, vu_custo_estoque, vu_custo_venda, vu_custo, valor_custo_total)
           VALUES ${marcadores}`,
          lote.flatMap((r) => [
            r.data_calculo_custo, r.periodo, r.grupo_empresa, r.id_empresa, r.nome_empresa, r.origem,
            r.id_produto, r.codigo_auxiliar, r.descricao_produto, r.marca, r.unidade, r.ncm, r.conta,
            r.tipo_saldo, r.qtde, r.vu_custo_estoque, r.vu_custo_venda, r.vu_custo, r.valor_custo_total,
          ]),
        );
      });
    }

    // ---- 5. Log de importação ----
    const logFiltro = filtroPeriodo(opcoes);
    const [logs] = await legado.query<RowDataPacket[]>(
      `SELECT tipo, arquivo, periodo, total_linhas, inseridas, atualizadas, ignoradas,
              produtos_nao_encontrados, empresas_nao_encontradas, custo_total, observacoes,
              usuario, executado_em
         FROM tb_importacao_log${logFiltro.where}`,
      logFiltro.params,
    );

    console.log(`\ntb_importacao_log: ${logs.length} linha(s)`);

    if (!opcoes.dryRun) {
      // O log antigo guardava o nome do usuário em texto; aqui a coluna é
      // uma FK. Não dá para adivinhar o id, então fica nulo e o nome vai
      // para observacoes, preservando quem executou.
      await pool.query('DELETE FROM estoque_importacao_log WHERE usuario_id IS NULL');

      await emLotes(logs, async (lote) => {
        const marcadores = lote.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
        await pool.query(
          `INSERT INTO estoque_importacao_log
             (tipo, arquivo, periodo, total_linhas, inseridas, atualizadas, ignoradas,
              produtos_nao_encontrados, empresas_nao_encontradas, custo_total, observacoes,
              usuario_id, executado_em)
           VALUES ${marcadores}`,
          lote.flatMap((r) => [
            r.tipo, r.arquivo, r.periodo, r.total_linhas, r.inseridas, r.atualizadas, r.ignoradas,
            r.produtos_nao_encontrados, r.empresas_nao_encontradas, r.custo_total,
            [r.usuario ? `Executado no portal anterior por: ${String(r.usuario)}` : null, r.observacoes]
              .filter(Boolean)
              .join('\n') || null,
            null,
            r.executado_em,
          ]),
        );
      });
    }

    console.log(
      opcoes.dryRun
        ? '\nDry run concluído. Confira as chaves órfãs acima antes de rodar sem --dry-run.'
        : '\nCarga concluída.',
    );
  } finally {
    await legado.end();
    await pool.end();
  }
}

main().catch((erro) => {
  console.error('Falha na carga:', erro);
  process.exit(1);
});
```

**Sobre o `DELETE` do log:** ele existe para a reexecução não duplicar
histórico, e só apaga linhas com `usuario_id IS NULL`, que são exatamente as
que este script cria. Log gerado por importação feita no portal novo tem
`usuario_id` preenchido e não é tocado.

- [ ] **Step 2: Registrar o comando**

Em `apps/api/package.json`, na seção `scripts`, junto dos demais scripts
operacionais:

```json
    "migracao:fechamento": "tsx src/scripts/migrarFechamentoLegado.ts",
```

- [ ] **Step 3: Documentar as variáveis**

Ao final de `apps/api/.env.example`:

```
# Carga única do histórico de Fechamento de Custo do portal PHP anterior
# (npm run migracao:fechamento). Não são usadas pela aplicação — só pelo
# script, e só na hora de rodar a carga. Deixe em branco no dia a dia.
LEGADO_DB_HOST=
LEGADO_DB_PORT=25060
LEGADO_DB_USER=
LEGADO_DB_PASSWORD=
LEGADO_DB_NAME=defaultdb
LEGADO_DB_CA_CERT=
```

- [ ] **Step 4: Verificar tipos e o dry-run**

```bash
npm run typecheck
```

Esperado: sem erro.

Com as variáveis do banco antigo definidas no ambiente:

```bash
npm run migracao:fechamento --workspace=apps/api -- --dry-run
```

Esperado: a saída lista as cinco tabelas com as contagens e as chaves órfãs,
sem gravar nada. **Confira as chaves órfãs antes de rodar sem `--dry-run`** —
`id_produto` e `id_empresa` vêm da SysEmp nos dois bancos e deveriam
coincidir; um número alto de órfãos significa que essa premissa não vale, e
aí a carga precisa ser reavaliada em vez de executada.

Sem as variáveis definidas, o script deve falhar com a mensagem nomeando a
variável que falta — confirme isso também.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/scripts/migrarFechamentoLegado.ts \
        apps/api/package.json apps/api/.env.example
git commit -m "Historico de fechamento do portal antigo passa a ter script de carga idempotente"
```

---

## Fechamento da entrega

- [ ] **Verificação final**

```bash
npm run build:shared
npm run typecheck
npm run test --workspace=apps/api
npm run build
```

Esperado: os quatro comandos passam. Só afirme que a entrega está pronta
depois de ver a saída dos quatro — evidência antes de asserção.

- [ ] **Conferir o spec contra o que foi construído**

Releia `Specs/spec_modulo_estoque.md`, seção 3, comparando com o código.
Onde a implementação divergiu ou foi além, atualize o spec **agora**, num
commit próprio. Pontos que costumam divergir:

- números das migrations, se `029`–`031` já estavam ocupados;
- nome da ação de permissão, se não for `podeIncluir`;
- nome da coluna de usuário em `usuarios`, usada no log.

- [ ] **Liberar as telas**

Configurador → Perfis → marcar as seis telas → Salvar. Sem esse passo
manual as telas não existem para ninguém, nem para administrador. Nenhuma
migration faz isso, e não deve fazer.
