# Especificação Técnica: Módulo Integração

## 1. Contexto e Origem

Este spec adapta pra arquitetura do jnk-portal (monorepo TS + MySQL, ver
`Specs/spec_infra_portal_base_monorepo.md`) a camada de **integração com
sistemas externos** já construída e em produção em
`C:\GitHub\jnakao-digital-ocean` — sincronização com o ERP **SysEmp** (API
REST própria do cliente) e com o **Mercado Livre** (OAuth2 + API de pedidos),
mais a camada de ETL que consome esses dados sincronizados pra alimentar
relatórios (margem, faturamento).

**Nada abaixo está implementado ainda — este documento é pra validação antes
de qualquer código.** Depois de aprovado, vira o novo módulo `INTEGRACAO` no
Hub de Aplicativos.

Diferente do módulo TI (que foi um porte quase 1:1), aqui a origem já é
**MySQL** — não há tradução de dialeto de banco. A mudança real é de
**runtime**: PHP síncrono rodando dentro do ciclo de uma request HTTP (com
todas as gambiarras que isso força) vira Node com sincronização rodando como
job de background de verdade.

### 1.1. O que é reaproveitado sem mudança de lógica

- **O modelo de fila da SysEmp** (`tb_sysemp_fila` → 3 passos: listar fila,
  buscar detalhe por `id_registro`, confirmar). É a peça de arquitetura mais
  importante do projeto original e já é genérica o suficiente (qualquer
  `tipo_tabela`) — só faltou implementar consumidores pra além de Notas
  Fiscais e Estoque.
- **A regra "offset sempre 0"** na fila: confirmar um evento o remove da
  lista `PENDENTE` do lado da SysEmp, então a lista encolhe sozinha —
  avançar offset pularia registros que "subiram" de posição.
- **As decisões de robustez a dado sujo/fora de ordem**: preços com valor
  fora do `DECIMAL` viram `NULL` (não derrubam o lote inteiro); pedidos e
  notas fiscais sem FK entre cabeçalho e item (a sync roda em janelas, um
  item pode chegar antes do cabeçalho "vizinho"); soft delete (nunca
  hard-delete) pra tudo que a fila marca como excluído.
- **O fluxo OAuth2 + PKCE do Mercado Livre**, gestão de `refresh_token` de
  uso único, e o retry de HTTP 429 com backoff.
- **O `grupo_empresa` calculado por `id_empresa`** (classificação
  JNK/CNK2/NK2, não vem da SysEmp) e a lógica de `ETL_FATCOM`/`ETL_EMPRESA`/
  `ETL_PRODUTO` como camada de consumo pronta pra Excel/Power BI.

### 1.2. O que muda de propósito

- **A divisão fila x lote foi mantida como no projeto original na v1**
  (não migrar tudo pra fila de uma vez — decidido na validação desta
  spec, ver seção 7.1): Notas Fiscais e Estoque nasceram via fila;
  Produtos, Parceiros, Preços e Pedidos vieram via lote/offset (ou faixa
  de data/id, conforme o endpoint); Empresas e Representantes continuam
  como busca completa periódica. As três engines foram portadas
  fielmente. **Depois da v1**, Pedidos, Parceiros e Preços migraram pra
  fila — a divisão atual está na seção 3.3.
- **O "modo HTTP em lote com auto-continuação client-side"** (a página
  ficava chamando a si mesma via cURL bloqueante pra nunca estourar o
  timeout de ~100s de uma request PHP) deixa de existir. Em Node, a
  sincronização roda como job de background de verdade — nada amarrado ao
  ciclo de vida de uma request HTTP.
- **O log duplo** (`SyncLogger` persistido + `ProgressLogger` visual
  efêmero, que existiam porque streaming não é confiável em PHP-FPM) vira
  **um log persistido só**, consultado tanto pela tela de histórico quanto
  por um endpoint SSE de acompanhamento ao vivo — Node faz streaming HTTP
  de verdade, sem a necessidade do hack.
- **Agendamento automático fica fora desta v1** (decidido na validação —
  ver seção 7.8): só gatilho manual, no Painel, por enquanto. A
  arquitetura já deixa isso plugável depois (job de sincronização é uma
  função isolada de qualquer disparo — cron ou clique dão no mesmo lugar),
  então adicionar `node-cron` mais tarde não exige redesenho.

---

## 2. Módulo no Hub de Aplicativos

| Campo | Valor |
|---|---|
| `nome` | Integração |
| `chave_modulo` | `INTEGRACAO` |
| `icone` | `Workflow` (Lucide) |
| `descricao` | Sincronização com o ERP SysEmp e o Mercado Livre, e a camada de dados pronta pra relatórios (ETL). |

Telas (`telas_modulo`):

| Tela | `rota_tela` |
|---|---|
| Painel de Integrações | `/integracao/painel` |
| Histórico de Execuções | `/integracao/execucoes` |
| Fila SysEmp | `/integracao/fila` |
| Parâmetros de Fila SysEmp | `/integracao/parametros-fila` |
| Conexão Mercado Livre | `/integracao/mercado-livre` |

---

## 3. Arquitetura de Sincronização

### 3.1. Cliente SysEmp (`apps/api/src/services/sysempClient.ts`)

Porta direta de `src/SysempClient.php`:

- Autenticação por header fixo `Token: <token>` (não é Bearer/OAuth — token
  estático, configurado em Parâmetros do Sistema, seção 6).
- Todas as chamadas são `POST`, corpo JSON.
- Timeout configurável, default **80s** (herdado — o valor foi calibrado
  contra `/listarParceiros` em teste real contra um limite de hospedagem de
  ~100s; mantém-se generoso mesmo não tendo mais essa restrição, já que a
  sync roda em background, não mais preso a um ciclo de request).
- **Sem retry automático** (diferente do cliente do Mercado Livre — decisão
  deliberada preservada: erro vira exceção, quem decide se tenta de novo é
  o próprio motor de sincronização, registrando o erro no log).
- Qualquer resposta fora de `200-299`, corpo não-JSON, ou
  `{"status": false, ...}` (200 OK mas erro de negócio do lado da SysEmp)
  vira erro tratado pelo chamador.

### 3.2. Motor de Fila (genérico) — `apps/api/src/services/sysempFila.ts`

Porta de `src/SyncFilaSysemp.php` + `src/SysempIntegracao.php`. O motor em
si é genérico por `tipo_tabela` (mesmo desenho do original), mas nesta v1
só tem consumidor registrado pra Notas Fiscais e Estoque — ver seção 3.3.

```typescript
interface ConfigFilaEntidade {
  chave: string;              // ex: 'notas_fiscais', 'estoque', 'produtos'
  tipoTabela: number;         // 0-9, código da SysEmp
  endpointDetalhe: string;    // ex: '/listarNotasFiscais'
  campoIdDetalhe: string;     // ex: 'id_nota_saida'
  limitePagina: number;
  // função específica da entidade: recebe o registro de detalhe já
  // buscado e grava nas tabelas de destino (upsert/soft-delete conforme
  // a entidade — ver seção 3.3)
  gravar: (pdo: PoolConnection, detalhe: unknown, acao: 'I' | 'U' | 'D') => Promise<void>;
}
```

Passo a passo (idêntico ao original, ver `Specs/../spec/IntegracaoSysEmp.md`
do projeto de origem):

1. **Importar página da fila**: `POST {endpoint_fila}` (default
   `/listarFila`) com `{"offset": "0", "limit": N, "tipo_tabela": X,
   "status": "PENDENTE"}`. Upsert idempotente em `sysemp_fila` por
   `id_fila` — **nunca sobrescreve** `consumido`/`consumido_em`/
   `erro_consumo`/`confirmado_sysemp` num registro já existente (só os
   metadados vindos da SysEmp), senão reimportar resetaria progresso já
   feito.
2. **Consumir cada linha pendente** (`consumido=0 OR confirmado_sysemp=0`):
   se `acao='D'` → soft delete local (chama `gravar(..., 'D')`); se `I`/`U`
   → `POST {endpoint_detalhe}` com `{[campo_id_detalhe]: id_registro}` e
   chama `gravar(..., acao)`. Erro aqui não trava o lote — fica
   `erro_consumo` preenchido, `consumido=0`, reprocessado na próxima
   chamada (idempotente por `id_fila`).
3. **Confirmar**: `POST /updateFilaApi` com `{"id_fila": "<id>"}`, **fora**
   da transação do passo 2 — se falhar, só fica `confirmado_sysemp=0` pra
   reenviar a confirmação depois, sem re-buscar o detalhe.
4. **Offset sempre 0** — nunca avança (ver seção 1.1).

`gravar()` é a única parte específica de cada entidade — ver seção 3.3 para
o mapeamento completo `tipo_tabela → configuração`.

### 3.3. Entidades via fila

Notas Fiscais e Estoque nasceram na fila (era o escopo da v1 — seção
7.1); Pedidos, Parceiros e Preços migraram depois do lote pra cá, sem
mexer no motor. Só Produto (seção 3.4) e as buscas completas (seção 3.5)
seguem fora da fila.

| `tipo_tabela` | Entidade | `endpoint_detalhe` | `campo_id_detalhe` | Grava em |
|---|---|---|---|---|
| 2 | NF Venda | `/listarNotasFiscais` | `id_nota_saida` | `sysemp_nota_fiscal` + `sysemp_nota_fiscal_item` |
| 3 | NF Compra | `/listarNotasFiscais` | `id_nota_saida` | mesmas tabelas de NF Venda (`entrada_saida='E'`) |
| 4 | Parceiro | `/listarParceiros` | `id_registro` (a migration 015 seedou `codigo`, não confirmado, com a linha inativa; **produção corrigiu para `id_registro` e ativou**, pela tela 5.4) | `sysemp_parceiro` |
| 6 | Preço | `/listarPrecoVenda` | `id_produto` | `sysemp_preco` |
| 7 | Pedido de Venda | `/listarPedidos` + `/listarPedidosItens` | `id_nota_saida` (via `buscarDetalhe`) | `sysemp_pedido` + `sysemp_pedido_item` |
| 9 | Saldo Estoque | `/listarSaldoEstoqueFisico` | `protocolo_estoque` | `sysemp_estoque_fisico` |

**O que a migration seeda é só o valor inicial** — a linha é editável na
tela 5.4, e produção diverge das migrations. Medido em 02/09/2026:
`limite_pagina` é 10000 em Estoque, 500 em NF, 300 em Parceiros e 50 em
Pedidos; Parceiros teve o `campo_id_detalhe` corrigido e foi ativado por
lá. Ao investigar comportamento de sincronização, **ler a linha no banco,
não a migration**.

Nas entidades que sobrescrevem `buscarDetalhe` (Pedido e Preço),
`endpoint_detalhe` e `campo_id_detalhe` viram **campos documentais**: o
consumidor chama o endpoint fixo no código e ignora a config. Editá-los
na tela não muda nada — o card de Pedido, por exemplo, mostra
`/listarNotasFiscais` como endpoint de detalhe, valor errado que passou
despercebido justamente por não ser lido. `ativo` e `limite_pagina`, ao
contrário, são lidos pelo motor e valem pra todas.

Regras específicas de cada consumidor:

- **Nota Fiscal**: cabeçalho e itens vêm juntos no mesmo JSON de detalhe.
  Itens: soft-delete de todos antes do upsert, "revivendo" só os que vêm
  na resposta atual (item que não voltar mais fica `deleted=true`).
- **Estoque**: chave natural `(id_produto, id_empresa)` → upsert direto
  (`ON DUPLICATE KEY UPDATE`), não delete+insert.
- **Parceiro**: sem sub-tabelas (cliente/fornecedor/transportadora são
  flags booleanas na mesma linha). `sysemp_parceiro` não tem coluna
  `deleted` — evento `acao='D'` reaproveita a flag `ativo`.
- **Preço**: **um evento devolve N linhas** — `/listarPrecoVenda` traz o
  produto em cada combinação de empresa × tabela de preço × condição de
  pagamento (11 linhas pro `id_produto` 13, medido em produção). O motor
  genérico só repassaria `retorno[0]`, então o consumidor sobrescreve
  `buscarDetalhe` e empacota a lista inteira. Sem chave natural por linha
  → **delete + insert** do conjunto do produto a cada evento (o mesmo
  DELETE atende `acao='D'`, que só não reinsere), o que torna
  reprocessar o mesmo `id_fila` idempotente. Valores `>= 1e14` ou não
  numéricos (lixo de cadastro no ERP de origem) viram `NULL` em vez de
  derrubar o INSERT inteiro.
- **Pedido de Venda**: cabeçalho e itens vêm de dois endpoints separados,
  e `/listarPedidos` **não aceita busca por id sozinho** — exige
  `data_inicial`/`data_final` (HTTP 400 sem eles, confirmado em
  produção). Daí o `buscarDetalhe` próprio: janela de ±2 dias em volta de
  `datahora_criacao_sysemp` e filtro pelo `id_nota_saida` na resposta.
  Sem FK entre `sysemp_pedido` e `sysemp_pedido_item` de propósito.

Migrar mais uma entidade pra fila é registrar uma linha em
`sysemp_fila_config` (seção 4.1) + a função `gravar()` correspondente,
sem mexer no motor. O consumidor se registra por **side-effect do
import** em `services/integracaoRegistry.ts` — sem esse import ele não
existe em runtime.

### 3.4. Entidades via lote — Produtos

Sem fila — pagina do seu próprio jeito, herdado do projeto original
(mesmo padrão de motor genérico da seção 3.2 mas sem a etapa de
fila/confirmação — só busca e grava):

| Entidade | Endpoint(s) | Paginação | Grava em |
|---|---|---|---|
| Produto | `/listarProdutos` | offset de registro (avança pela `qtde` retornada; para em `qtde: 0`) | `sysemp_produto` + sub-tabelas |

Regras específicas, preservadas do original:

- **Produto**: resposta vem com sub-listas de origem/categoria fiscal/
  estoque por empresa — grava faz delete+insert dos filhos daquele lote
  (não upsert incremental). Campos booleanos vêm como `"t"/"f"`
  (convertidos pra `true/false`); numéricos vazios (`""`) viram `NULL`
  explicitamente.

### 3.5. Empresas e Representantes — busca completa periódica

`/listarEmpresas` e `/listarRepresentantes` devolvem o cadastro inteiro
numa chamada, sem paginação nenhuma. Busca tudo, upsert em
`sysemp_empresa`/`sysemp_representante`. `grupo_empresa` (classificação
JNK/CNK2/NK2) não vem da SysEmp — calculado por `id_empresa`, mesmo
mapeamento fixo do projeto original (confirmado na validação — seção 7.2).

### 3.6. Agendamento — manual nesta v1

**Sem `node-cron`/agendamento automático nesta v1** (decidido na
validação — seção 7.8): cada entidade só sincroniza quando alguém clica
"Sincronizar agora" no Painel. A função de sincronização de cada entidade
já fica isolada de quem a disparou (não sabe se foi clique ou cron), então
plugar um agendador automático depois é aditivo — não exige redesenho, só
registrar os jobs.

### 3.7. Log e observabilidade

Uma tabela só (`integracao_log` + `integracao_log_detalhe`, ver seção
4.1), consultada por dois caminhos:

- **Histórico** (`/integracao/execucoes`): grid com filtro por entidade,
  igual `admin/sync_status.php`, sem necessidade de polling agressivo —
  execução já terminada não muda mais.
- **Acompanhamento ao vivo**: endpoint SSE (`GET
  /api/integracao/execucoes/:id/stream`) que empurra cada nova linha de
  `integracao_log_detalhe` pro navegador conforme é gravada, enquanto a
  execução estiver com `status='iniciado'`. Resolve de forma nativa (sem
  gambiarra) o que o `ProgressLogger` do projeto original tentava fazer
  via flush de HTML — não precisa de tabela nem de mecanismo paralelo.

Cancelamento cooperativo preservado: `status='cancelado'` checado a cada
página/lote pelo job em execução — não mata o processo, só para de gravar
e finaliza como `cancelado` no próximo ponto de checagem.

---

## 4. Modelo de Dados

Convenção do spec base: `snake_case`, `utf8mb4_0900_ai_ci`, `BOOLEAN`,
`DATETIME DEFAULT CURRENT_TIMESTAMP`, sem prefixo `tb_`. Prefixo por
**origem**: `sysemp_` para entidades vindas da SysEmp, `ml_` para Mercado
Livre (mesmo nome do projeto original), `integracao_` para infraestrutura
cross-cutting (log), `etl_` para a camada de consumo.

> **Nota sobre `ETL_FATCOM`/`ETL_EMPRESA`/`ETL_PRODUTO`:** no projeto
> original, nome de tabela e colunas ficam em MAIÚSCULO **de propósito**,
> espelhando as procedures `spETL_*` que já existiam no SQL Server legado
> do cliente — relatórios/Excel/Power BI já prontos continuam funcionando
> apontando pra cá. Esta spec usa `snake_case` (seção abaixo), decisão já
> validada (seção 7.3) — se algum relatório externo publicado depender dos
> nomes em maiúsculo, isso precisa ser revisto antes do deploy.

### 4.1. Infraestrutura de Sincronização

```sql
CREATE TABLE integracao_log (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    entidade        VARCHAR(50) NOT NULL, -- 'produtos', 'estoque', 'ml_pedidos', 'etl_fatcom' ...
    status          VARCHAR(20) NOT NULL DEFAULT 'iniciado', -- iniciado | sucesso | erro | cancelado
    qtde_registros  INT UNSIGNED NULL,
    mensagem        TEXT NULL,
    duracao_ms      INT UNSIGNED NULL,
    executado_em    DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entidade (entidade),
    INDEX idx_executado_em (executado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE integracao_log_detalhe (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    id_log          INT NOT NULL,
    pagina          INT UNSIGNED NULL, -- offset/página/id_fila processado, quando aplicável
    qtde_registros  INT UNSIGNED NULL,
    status          VARCHAR(10) NOT NULL, -- ok | erro
    mensagem        TEXT NULL,
    duracao_ms      INT UNSIGNED NULL,
    request_body    TEXT NULL, -- JSON enviado à SysEmp/ML nesta página, para depuração
    criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_log) REFERENCES integracao_log(id) ON DELETE CASCADE,
    INDEX idx_log (id_log)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Configuração por entidade baseada em fila — editável na tela sem deploy.
-- Uma linha só funciona se também existir código de consumo (gravar())
-- registrado pra aquele tipo_tabela.
CREATE TABLE sysemp_fila_config (
    chave                 VARCHAR(50) PRIMARY KEY, -- 'notas_fiscais', 'estoque', 'produtos' ...
    nome                  VARCHAR(150) NOT NULL,
    tipo_tabela           SMALLINT UNSIGNED NOT NULL,
    endpoint_fila         VARCHAR(150) NOT NULL DEFAULT '/listarFila',
    endpoint_detalhe      VARCHAR(150) NULL,
    campo_id_detalhe      VARCHAR(50) NULL,
    endpoint_confirmacao  VARCHAR(150) NOT NULL DEFAULT '/updateFilaApi',
    limite_pagina         INT UNSIGNED NOT NULL DEFAULT 50,
    ativo                 BOOLEAN DEFAULT TRUE,
    observacoes           VARCHAR(255) NULL,
    atualizado_em         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Fila de eventos da SysEmp (id_fila é global, não reinicia por tipo_tabela).
-- "consumido" é controle LOCAL — a SysEmp não expõe endpoint pra marcar
-- processado do lado dela, então id_fila como PK + upsert idempotente é o
-- que garante não reprocessar/duplicar ao reimportar a mesma página.
CREATE TABLE sysemp_fila (
    id_fila                        INT PRIMARY KEY, -- vem da SysEmp, sequência global
    tipo_tabela                    SMALLINT UNSIGNED NOT NULL,
    desc_tipo_tabela                VARCHAR(100) NULL,
    acao                            CHAR(1) NOT NULL, -- I | U | D
    desc_acao                       VARCHAR(60) NULL,
    id_registro                     INT NOT NULL,
    status_sysemp                   VARCHAR(20) NULL,
    datahora_criacao_sysemp         DATETIME NULL,
    datahora_processamento_sysemp   DATETIME NULL,
    consumido                       BOOLEAN DEFAULT FALSE,
    consumido_em                    DATETIME NULL,
    erro_consumo                    VARCHAR(500) NULL,
    confirmado_sysemp                BOOLEAN DEFAULT FALSE,
    confirmado_em                    DATETIME NULL,
    erro_confirmacao                 VARCHAR(500) NULL,
    importado_em                     DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em                    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tipo_consumido (tipo_tabela, consumido),
    INDEX idx_tipo_confirmado (tipo_tabela, confirmado_sysemp),
    INDEX idx_id_registro (id_registro)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 4.2. Entidades SysEmp

```sql
CREATE TABLE sysemp_empresa (
    id_empresa      INT PRIMARY KEY, -- vem da SysEmp
    razao_social    VARCHAR(255) NOT NULL,
    fantasia        VARCHAR(255) NULL,
    cnpj            VARCHAR(20) NULL,
    insc_estadual   VARCHAR(30) NULL,
    endereco        VARCHAR(255) NULL,
    numero          VARCHAR(20) NULL,
    bairro          VARCHAR(100) NULL,
    cep             VARCHAR(15) NULL,
    cidade          VARCHAR(100) NULL,
    uf              CHAR(2) NULL,
    telefone        VARCHAR(30) NULL,
    email           VARCHAR(150) NULL,
    ativa           BOOLEAN DEFAULT TRUE,
    grupo_empresa   VARCHAR(5) NULL, -- JNK/CNK2/NK2, calculado por id_empresa (não vem da SysEmp) — ver seção 7.2
    filial_id       INT NULL, -- link opcional pra filiais do jnk-portal, atribuído manualmente por um admin — ver seção 7.4
    synced_at       DATETIME NOT NULL,
    criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (filial_id) REFERENCES filiais(id) ON DELETE SET NULL,
    INDEX idx_cnpj (cnpj),
    INDEX idx_ativa (ativa),
    INDEX idx_grupo_empresa (grupo_empresa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sysemp_representante (
    id_representante    INT PRIMARY KEY, -- vem da SysEmp (codigo_representante_vendas)
    nome_representante  VARCHAR(255) NOT NULL,
    ativo               BOOLEAN DEFAULT TRUE,
    synced_at           DATETIME NOT NULL,
    criado_em           DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Produto: cadastro + 3 sub-tabelas por empresa (origem fiscal, categoria
-- fiscal, estoque mínimo/máximo) — um produto pode ter valores diferentes
-- desses campos em cada empresa onde é vendido.
CREATE TABLE sysemp_produto (
    id_produto                    INT PRIMARY KEY, -- vem da SysEmp
    codigo_auxiliar               VARCHAR(50) NULL,
    nome_produto                  VARCHAR(255) NOT NULL,
    unidade                       VARCHAR(10) NULL,
    tipo_produto                  VARCHAR(100) NULL,
    cod_produto_pai               INT NULL, -- referência informativa, sem FK (pode chegar fora de ordem)
    codigo_barras                 VARCHAR(50) NULL,
    codigo_marca                  VARCHAR(50) NULL,
    descricao_marca               VARCHAR(255) NULL,
    codigo_categoria              VARCHAR(50) NULL,
    descricao_categoria           VARCHAR(255) NULL,
    codigo_grupo                  VARCHAR(50) NULL,
    descricao_grupo               VARCHAR(255) NULL,
    codigo_subgrupo               VARCHAR(50) NULL,
    descricao_subgrupo            VARCHAR(255) NULL,
    produto_kit                   BOOLEAN DEFAULT FALSE, -- "t"/"f" na resposta da SysEmp
    produto_temfilhos             BOOLEAN DEFAULT FALSE,
    ncm                           VARCHAR(20) NULL,
    peso_liquido                  DECIMAL(12,4) NULL,
    altura                        DECIMAL(12,4) NULL,
    largura                       DECIMAL(12,4) NULL,
    comprimento                   DECIMAL(12,4) NULL,
    qtde_embalagem                DECIMAL(12,4) NULL,
    ativo                         BOOLEAN DEFAULT TRUE,
    synced_at   DATETIME NOT NULL,
    criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_codigo_barras (codigo_barras),
    INDEX idx_codigo_auxiliar (codigo_auxiliar),
    INDEX idx_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sysemp_produto_origem (
    id_produto         INT NOT NULL,
    id_empresa         INT NOT NULL,
    origem_mercadoria  TINYINT UNSIGNED NULL, -- código de origem da mercadoria (ICMS)
    synced_at          DATETIME NOT NULL,
    PRIMARY KEY (id_produto, id_empresa),
    FOREIGN KEY (id_produto) REFERENCES sysemp_produto(id_produto) ON DELETE CASCADE,
    FOREIGN KEY (id_empresa) REFERENCES sysemp_empresa(id_empresa) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sysemp_produto_categoria_fiscal (
    id_produto     INT NOT NULL,
    id_empresa     INT NOT NULL,
    id_tes_saida   INT NULL,
    synced_at      DATETIME NOT NULL,
    PRIMARY KEY (id_produto, id_empresa),
    FOREIGN KEY (id_produto) REFERENCES sysemp_produto(id_produto) ON DELETE CASCADE,
    FOREIGN KEY (id_empresa) REFERENCES sysemp_empresa(id_empresa) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sysemp_produto_estoque (
    id_produto        INT NOT NULL,
    id_empresa        INT NOT NULL,
    estoque_maximo    DECIMAL(14,4) NULL,
    estoque_minimo    DECIMAL(14,4) NULL,
    synced_at         DATETIME NOT NULL,
    PRIMARY KEY (id_produto, id_empresa),
    FOREIGN KEY (id_produto) REFERENCES sysemp_produto(id_produto) ON DELETE CASCADE,
    FOREIGN KEY (id_empresa) REFERENCES sysemp_empresa(id_empresa) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Parceiro: tabela única — cliente/fornecedor/transportadora são flags na
-- mesma linha (um parceiro pode acumular vários papéis ao mesmo tempo).
CREATE TABLE sysemp_parceiro (
    id_parceiro             INT PRIMARY KEY, -- vem da SysEmp (campo "codigo")
    class_cliente           BOOLEAN DEFAULT FALSE,
    class_fornecedor        BOOLEAN DEFAULT FALSE,
    class_transportadora    BOOLEAN DEFAULT FALSE,
    razao_social            VARCHAR(255) NOT NULL,
    fantasia                VARCHAR(255) NULL,
    cpf_cnpj                VARCHAR(20) NULL,
    tipo_pessoa             VARCHAR(20) NULL, -- "Física" / "Jurídica"
    insc_estadual           VARCHAR(30) NULL,
    insc_municipal          VARCHAR(30) NULL,
    contato_nome            VARCHAR(150) NULL,
    sexo                    CHAR(1) NULL,
    data_nascimento         DATE NULL,
    telefone1               VARCHAR(30) NULL,
    telefone2               VARCHAR(30) NULL,
    data_cadastro           DATE NULL,
    logradouro              VARCHAR(255) NULL,
    logradouro_numero       VARCHAR(20) NULL,
    logradouro_complemento  VARCHAR(100) NULL,
    logradouro_bairro       VARCHAR(100) NULL,
    logradouro_municipio    VARCHAR(100) NULL,
    logradouro_uf           CHAR(2) NULL,
    logradouro_cep          VARCHAR(15) NULL,
    logradouro_referencia   VARCHAR(255) NULL,
    logradouro_codigo_ibge  VARCHAR(20) NULL,
    ativo                   BOOLEAN DEFAULT TRUE,
    synced_at   DATETIME NOT NULL,
    criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cpf_cnpj (cpf_cnpj),
    INDEX idx_razao_social (razao_social),
    INDEX idx_class_cliente (class_cliente),
    INDEX idx_class_fornecedor (class_fornecedor),
    INDEX idx_class_transportadora (class_transportadora),
    INDEX idx_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Preço: sem chave natural por linha (mesma condição pode repetir com
-- valores diferentes) — delete+insert por produto, não upsert. Sem FK pra
-- sysemp_produto de propósito (pode chegar antes do cadastro do produto).
-- id_empresa/id_condpagto vieram com a migração pra fila (022): são eles
-- que distinguem as N linhas que um evento devolve pro mesmo produto.
CREATE TABLE sysemp_preco (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    id_produto              INT NOT NULL, -- do evento de fila, não do "codigo_produto" da resposta
    id_empresa              INT NULL,
    id_tb_preco             INT NULL,
    id_condpagto            INT NULL,
    nome_tabela             VARCHAR(150) NULL,
    nome_condicao           VARCHAR(150) NULL,
    preco_tabela            DECIMAL(18,4) NULL,
    preco_promocao          DECIMAL(18,4) NULL,
    data_inicio_promocao    DATE NULL,
    data_termino_promocao   DATE NULL,
    synced_at               DATETIME NOT NULL,
    criado_em               DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_id_produto (id_produto),
    INDEX idx_id_tb_preco (id_tb_preco)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Pedido de Venda: cabeçalho + itens. Sem FK entre as duas (mesma razão de
-- Preço — chegada fora de ordem entre janelas/páginas da fila).
CREATE TABLE sysemp_pedido (
    id_nota_saida               INT PRIMARY KEY, -- vem da SysEmp
    id_empresa                  INT NULL, -- vem como "codigo_empresa"
    numero_pedido_sysemp        VARCHAR(30) NULL,
    numero_pedido_marketplace   VARCHAR(100) NULL,
    data_pedido                 DATE NULL,
    tipo_pedido                 VARCHAR(30) NULL, -- FATURADO, CANCELADO etc
    id_parceiro_cliente         INT NULL, -- vem como "codigo_cliente"
    id_parceiro_vendedor        INT NULL, -- vem como "codigo_vendedor"
    id_parceiro_transportadora  INT NULL, -- vem como "codigo_transportadora"
    valor_total_nota            DECIMAL(14,4) NULL,
    valor_frete                 DECIMAL(14,4) NULL,
    valor_comissao              DECIMAL(14,4) NULL,
    valor_desconto              DECIMAL(14,4) NULL,
    data_venda                  DATE NULL,
    canal_venda                 VARCHAR(150) NULL,
    data_entrega                DATE NULL,
    mensagem_nota                VARCHAR(255) NULL,
    synced_at   DATETIME NOT NULL,
    criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_data_pedido (data_pedido),
    INDEX idx_tipo_pedido (tipo_pedido),
    INDEX idx_id_empresa (id_empresa),
    INDEX idx_id_parceiro_cliente (id_parceiro_cliente)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sysemp_pedido_item (
    id                       INT AUTO_INCREMENT PRIMARY KEY,
    id_nota_saida            INT NOT NULL, -- liga a sysemp_pedido.id_nota_saida (sem FK, ver acima)
    id_empresa               INT NULL,
    numero_pedido_sysemp     VARCHAR(30) NULL,
    id_produto               INT NULL,
    quantidade               DECIMAL(14,4) NULL,
    valor_unitario_liquido   DECIMAL(14,4) NULL,
    valor_unitario_bruto     DECIMAL(14,4) NULL,
    valor_frete              DECIMAL(14,4) NULL,
    valor_comissao           DECIMAL(14,4) NULL,
    quantidade_reservada     DECIMAL(14,4) NULL,
    synced_at                DATETIME NOT NULL,
    INDEX idx_id_nota_saida (id_nota_saida),
    INDEX idx_id_produto (id_produto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Nota Fiscal (emitida ou recebida — entrada_saida 'S'/'E'). Cabeçalho +
-- itens vêm juntos no mesmo JSON de detalhe. Soft delete: nunca apaga a
-- linha, só marca deleted=true (evento acao='D' da fila, ou item que
-- sumiu numa releitura). Sem FK entre as duas, mesma razão de Pedido.
CREATE TABLE sysemp_nota_fiscal (
    id_nota_saida             INT PRIMARY KEY, -- vem da SysEmp
    marketplace_pedido        VARCHAR(50) NULL, -- número do pedido no marketplace de origem, quando houver
    id_empresa                INT NULL,
    nota_serie_danfe          VARCHAR(10) NULL,
    nota_numero               VARCHAR(30) NULL,
    id_cliente                INT NULL,
    entrada_saida             CHAR(1) NULL, -- 'S' emitida / 'E' recebida
    nota_cfop                 VARCHAR(10) NULL,
    nota_cadastro             DATE NULL,
    nota_emissao              DATE NULL,
    nota_saida                DATE NULL,
    cfop_descricao            VARCHAR(255) NULL,
    status_nota               VARCHAR(10) NULL,
    total_produtos            DECIMAL(14,4) NULL,
    total_servicos            DECIMAL(14,4) NULL,
    total_produtos_servicos   DECIMAL(14,4) NULL,
    vr_frete                  DECIMAL(14,4) NULL,
    valor_frete_seller        DECIMAL(14,4) NULL,
    valor_comissao            DECIMAL(14,4) NULL,
    vr_outros                 DECIMAL(14,4) NULL,
    vr_acrescimo              DECIMAL(14,4) NULL,
    vr_desconto               DECIMAL(14,4) NULL,
    valor_nota                DECIMAL(14,4) NULL,
    volume_qtde               DECIMAL(14,4) NULL,
    volume_especie            VARCHAR(50) NULL,
    volume_numero             VARCHAR(30) NULL,
    volume_marca               VARCHAR(50) NULL,
    volume_peso_liquido        DECIMAL(14,4) NULL,
    volume_peso_bruto          DECIMAL(14,4) NULL,
    id_transportadora          INT NULL,
    chave_nfe                  VARCHAR(50) NULL,
    data_cancelamento_nfe      DATETIME NULL,
    autorizacao_datahora       DATETIME NULL,
    protocolo_nfe               VARCHAR(50) NULL,
    protocolo_nfe_canc          VARCHAR(50) NULL,
    valor_icms                  DECIMAL(14,4) NULL,
    icms_st                     DECIMAL(14,4) NULL,
    valor_ipi                   DECIMAL(14,4) NULL,
    base_icms                   DECIMAL(14,4) NULL,
    base_icms_sub                DECIMAL(14,4) NULL,
    base_ipi                     DECIMAL(14,4) NULL,
    valor_pis                    DECIMAL(14,4) NULL,
    valor_cofins                 DECIMAL(14,4) NULL,
    vr_seguro                    DECIMAL(14,4) NULL,
    vr_gnre                      DECIMAL(14,4) NULL,
    id_finalidade_venda          INT NULL,
    finalidade_venda              VARCHAR(100) NULL,
    id_vendedor                   INT NULL,
    id_vendedor2                  INT NULL,
    canal_venda                    VARCHAR(150) NULL,
    v_fcp_uf_dest                  DECIMAL(14,4) NULL,
    v_icms_uf_dest                  DECIMAL(14,4) NULL,
    v_icms_uf_remet                 DECIMAL(14,4) NULL,
    finalidade_nfe                  VARCHAR(10) NULL,
    observacao_nf                    VARCHAR(500) NULL,
    ref_chave                        VARCHAR(50) NULL,
    ref_numero_docfiscal              VARCHAR(30) NULL,
    ref_serie_docfiscal                VARCHAR(10) NULL,
    deleted     BOOLEAN DEFAULT FALSE,
    synced_at   DATETIME NOT NULL,
    criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_nota_emissao (nota_emissao),
    INDEX idx_entrada_saida (entrada_saida),
    INDEX idx_status_nota (status_nota),
    INDEX idx_id_empresa (id_empresa),
    INDEX idx_id_cliente (id_cliente),
    INDEX idx_chave_nfe (chave_nfe),
    INDEX idx_deleted (deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE sysemp_nota_fiscal_item (
    id_nota_saida         INT NOT NULL, -- liga a sysemp_nota_fiscal.id_nota_saida (sem FK, ver acima)
    item                  INT NOT NULL, -- número da linha dentro da NF
    id_produto            INT NULL,
    qtde                  DECIMAL(14,4) NULL,
    vr_unitario_bruto     DECIMAL(14,4) NULL,
    vr_total_bruto        DECIMAL(14,4) NULL,
    vr_acrescimo          DECIMAL(14,4) NULL,
    vr_desconto           DECIMAL(14,4) NULL,
    item_cfop             VARCHAR(10) NULL,
    item_cfop_descricao   VARCHAR(255) NULL,
    gera_financeiro       BOOLEAN NULL,
    unidade               VARCHAR(10) NULL,
    id_nota_origem        INT NULL,
    item_origem           INT NULL,
    chave_origem          VARCHAR(50) NULL,
    pedido_venda          VARCHAR(30) NULL, -- referência informativa (numero_pedido_sysemp), sem FK
    ncm                   VARCHAR(20) NULL,
    cst                   VARCHAR(10) NULL,
    base_icms             DECIMAL(14,4) NULL,
    aliquota_icms         DECIMAL(9,4) NULL,
    reducao               DECIMAL(9,4) NULL,
    base_ipi              DECIMAL(14,4) NULL,
    ipi_percentual        DECIMAL(9,4) NULL,
    base_pis              DECIMAL(14,4) NULL,
    aliq_pis              DECIMAL(9,4) NULL,
    base_cofins           DECIMAL(14,4) NULL,
    aliq_cofins           DECIMAL(9,4) NULL,
    difal                 DECIMAL(14,4) NULL,
    fecp                  DECIMAL(14,4) NULL,
    v_icms_uf_dest        DECIMAL(14,4) NULL,
    v_icms_uf_remet       DECIMAL(14,4) NULL,
    v_fcp_uf_dest         DECIMAL(14,4) NULL,
    v_fcp_st              DECIMAL(14,4) NULL,
    vr_frete              DECIMAL(14,4) NULL,
    frete_seller          DECIMAL(14,4) NULL,
    vr_seguro             DECIMAL(14,4) NULL,
    vr_outros             DECIMAL(14,4) NULL,
    valor_ipi              DECIMAL(14,4) NULL,
    valor_icms              DECIMAL(14,4) NULL,
    valor_pis                DECIMAL(14,4) NULL,
    valor_cofins              DECIMAL(14,4) NULL,
    icms_st                    DECIMAL(14,4) NULL,
    valor_comissao_ml           DECIMAL(14,4) NULL,
    vr_item_liquido              DECIMAL(14,4) NULL,
    deleted   BOOLEAN DEFAULT FALSE, -- item que não veio mais numa releitura da NF
    synced_at DATETIME NOT NULL,
    PRIMARY KEY (id_nota_saida, item),
    INDEX idx_id_produto (id_produto),
    INDEX idx_pedido_venda (pedido_venda),
    INDEX idx_deleted (deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Estoque Físico: chave natural (id_produto, id_empresa) → upsert direto.
CREATE TABLE sysemp_estoque_fisico (
    id_produto                INT NOT NULL, -- vem como "codigo_produto"
    id_empresa                INT NOT NULL,
    protocolo_estoque          VARCHAR(30) NULL,
    codigo_produto_pai         INT NULL,
    estoque_minimo             DECIMAL(14,4) NULL,
    estoque_maximo             DECIMAL(14,4) NULL,
    saldo_disponivel           DECIMAL(14,4) NULL,
    estoque_reservado          DECIMAL(14,4) NULL,
    estoque_principal          DECIMAL(14,4) NULL,
    estoque_importacao         DECIMAL(14,4) NULL,
    estoque_avarias            DECIMAL(14,4) NULL,
    estoque_loja               DECIMAL(14,4) NULL,
    estoque_assistencia        DECIMAL(14,4) NULL,
    estoque_armazem_externo    DECIMAL(14,4) NULL,
    custo_formacao             DECIMAL(14,4) NULL,
    custo_medio                DECIMAL(14,4) NULL,
    deleted     BOOLEAN DEFAULT FALSE,
    synced_at   DATETIME NOT NULL,
    criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id_produto, id_empresa),
    INDEX idx_id_empresa (id_empresa),
    INDEX idx_protocolo_estoque (protocolo_estoque),
    INDEX idx_deleted (deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 4.3. Mercado Livre

```sql
-- Conta vendedora autorizada via OAuth. Uma linha por conta (suporta mais
-- de uma conta no mesmo app). App ID/Secret/Redirect URI ficam em
-- Parâmetros do Sistema (seção 6) — aqui só os tokens.
CREATE TABLE ml_conta (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id_ml      BIGINT NOT NULL, -- id do vendedor no ML
    nickname        VARCHAR(100) NOT NULL DEFAULT '',
    access_token    TEXT NOT NULL,
    refresh_token   TEXT NOT NULL,
    expira_em       DATETIME NOT NULL, -- validade do access_token (~6h)
    scopes          VARCHAR(255) NOT NULL DEFAULT '',
    criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_ml_user (user_id_ml)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Pedidos do Mercado Livre. Upsert por id_pedido (único no ML inteiro).
-- Frete/estorno somados de payments[]; frete detalhado exige
-- /shipments/{id} — fora de escopo desta v1 (fase futura).
CREATE TABLE ml_pedido (
    id_pedido               BIGINT PRIMARY KEY, -- id da order no ML
    user_id_ml               BIGINT NOT NULL, -- conta vendedora (ml_conta)
    pack_id                  BIGINT NULL, -- carrinho/pacote que agrupa orders
    status                   VARCHAR(30) NOT NULL, -- paid, cancelled, ...
    status_detalhe           VARCHAR(80) NULL,
    canal                    VARCHAR(30) NOT NULL DEFAULT '', -- marketplace | mshops
    data_criacao             DATETIME NOT NULL,
    data_fechamento          DATETIME NULL,
    data_ultima_atualizacao  DATETIME NULL,
    valor_total              DECIMAL(14,2) NOT NULL DEFAULT 0,
    valor_pago               DECIMAL(14,2) NOT NULL DEFAULT 0,
    frete                    DECIMAL(14,2) NOT NULL DEFAULT 0, -- payments[].shipping_cost
    valor_devolvido          DECIMAL(14,2) NOT NULL DEFAULT 0, -- payments[].transaction_amount_refunded
    moeda                    CHAR(3) NOT NULL DEFAULT 'BRL',
    comprador_id              BIGINT NULL,
    comprador_nickname        VARCHAR(100) NOT NULL DEFAULT '',
    shipping_id                BIGINT NULL,
    tags                       VARCHAR(500) NOT NULL DEFAULT '',
    atualizado_em              DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ml_ped_conta_data (user_id_ml, data_criacao),
    INDEX idx_ml_ped_data (data_criacao),
    INDEX idx_ml_ped_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE ml_pedido_item (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    id_pedido       BIGINT NOT NULL,
    item_id         VARCHAR(20) NOT NULL, -- MLB...
    variacao_id     BIGINT NULL,
    titulo          VARCHAR(255) NOT NULL DEFAULT '',
    sku             VARCHAR(100) NOT NULL DEFAULT '', -- seller_sku — elo com sysemp_produto
    categoria       VARCHAR(30) NOT NULL DEFAULT '',
    qtde            INT NOT NULL DEFAULT 0,
    preco_unitario  DECIMAL(14,2) NOT NULL DEFAULT 0,
    preco_cheio     DECIMAL(14,2) NULL, -- antes de desconto
    taxa_venda      DECIMAL(14,2) NULL, -- sale_fee do ML, por unidade
    moeda           CHAR(3) NOT NULL DEFAULT 'BRL',
    INDEX idx_ml_item_pedido (id_pedido),
    INDEX idx_ml_item_sku (sku),
    INDEX idx_ml_item_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 4.4. Camada de Consumo (ETL)

Não fala com nenhuma API — só transforma tabelas já sincronizadas em
tabelas "fáceis de consumir" (Excel/Power BI/relatório futuro), sempre
upsert por chave de negócio, **nunca deleta**.

```sql
CREATE TABLE etl_empresa (
    recno         INT AUTO_INCREMENT PRIMARY KEY,
    origem_dados  VARCHAR(6) NOT NULL, -- 'SYSEMP' nesta v1
    grupo         VARCHAR(5) NOT NULL, -- sysemp_empresa.grupo_empresa
    cd_filial     INT NOT NULL,
    dc_filial     VARCHAR(80) NOT NULL,
    dc_fantasia   VARCHAR(25) NOT NULL, -- nome curado por id_empresa, não o campo "fantasia" cru
    cnpj          VARCHAR(20) NOT NULL,
    ie            VARCHAR(20) NOT NULL,
    atualizado_em DATETIME NOT NULL,
    UNIQUE KEY uq_grupo_filial (origem_dados, grupo, cd_filial),
    UNIQUE KEY uq_filial (origem_dados, cd_filial)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE etl_produto (
    recno         INT AUTO_INCREMENT PRIMARY KEY,
    origem_dados  VARCHAR(6) NOT NULL,
    cd_produto    VARCHAR(30) NOT NULL, -- codigo_auxiliar, com fallback pro id_produto
    dc_produto    VARCHAR(100) NOT NULL,
    um            CHAR(2) NOT NULL,
    ncm           VARCHAR(10) NOT NULL,
    marca         VARCHAR(20) NOT NULL,
    atualizado_em DATETIME NOT NULL,
    UNIQUE KEY uq_produto (origem_dados, cd_produto)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cruza sysemp_nota_fiscal + sysemp_nota_fiscal_item (INNER JOIN) com
-- sysemp_empresa, sysemp_parceiro, sysemp_produto — uma linha por item de
-- NF. INNER JOIN significa que uma NF só entra quando empresa/cliente/
-- produto do item já estiverem sincronizados — sem erro, só ausência
-- silenciosa até a entidade correspondente sincronizar.
--
-- Colunas sem fonte nesta v1 (sem guia GNRE nem último custo de compra
-- integrados): vt_icms_st_gnre, vt_custo, vb_tx_fatur, taxa_fatur,
-- vt_liq_final, vt_encargos, vt_desconto, aliq_icms_calc,
-- aliq_piscof_calc, vt_rebate — ficam fixas em 0, igual ao original.
CREATE TABLE etl_fatcom (
    recno             INT AUTO_INCREMENT PRIMARY KEY,
    origem_dados       VARCHAR(6) NOT NULL,
    grupo_empresa       VARCHAR(5) NOT NULL,
    cd_filial            INT NOT NULL,
    nf                    VARCHAR(9) NOT NULL,
    serie                 VARCHAR(3) NOT NULL,
    item                  INT NOT NULL,
    cd_produto            VARCHAR(50) NOT NULL,
    dc_filial             VARCHAR(25) NOT NULL, -- sem fonte própria na SysEmp — usa razao_social truncada
    periodo               CHAR(6) NOT NULL,
    dt_movto              DATE NOT NULL,
    ent_sai               CHAR(1) NOT NULL,
    status_nf             VARCHAR(50) NOT NULL,
    ctrl_financeiro        CHAR(1) NOT NULL,
    cd_clifor              VARCHAR(20) NOT NULL,
    dc_clifor               VARCHAR(100) NOT NULL,
    uf                       CHAR(2) NOT NULL,
    dc_produto               VARCHAR(100) NOT NULL,
    um                        CHAR(2) NOT NULL,
    ncm                        VARCHAR(15) NOT NULL,
    marca                      VARCHAR(50) NOT NULL,
    canal                       VARCHAR(50) NOT NULL,
    cfop                        VARCHAR(5) NOT NULL,
    cst                          CHAR(3) NOT NULL,
    qtde                          FLOAT NOT NULL,
    vu_merc                       FLOAT NOT NULL,
    vt_merc                       FLOAT NOT NULL,
    vb_icms                       FLOAT NOT NULL,
    aliq_icms                     FLOAT NOT NULL,
    aliq_icms_calc                FLOAT NOT NULL, -- fixo 0 (sem fonte nesta v1)
    aliq_red_icms                 FLOAT NOT NULL,
    vt_icms                       FLOAT NOT NULL,
    vt_icms_st                    FLOAT NOT NULL,
    vt_icms_st_gnre                FLOAT NOT NULL, -- fixo 0
    vt_icms_difal                  FLOAT NOT NULL,
    vt_icms_frete                  FLOAT NOT NULL,
    vb_ipi                          FLOAT NOT NULL,
    aliq_ipi                        FLOAT NOT NULL,
    vt_ipi                          FLOAT NOT NULL,
    vb_pis                          FLOAT NOT NULL,
    aliq_pis                        FLOAT NOT NULL,
    vt_pis                          FLOAT NOT NULL,
    vb_cofins                       FLOAT NOT NULL,
    aliq_cofins                     FLOAT NOT NULL,
    aliq_piscof_calc                 FLOAT NOT NULL, -- fixo 0
    vt_cofins                        FLOAT NOT NULL,
    vt_encargos                      FLOAT NOT NULL, -- fixo 0
    vt_frete                          FLOAT NOT NULL,
    vt_desconto                       FLOAT NOT NULL, -- fixo 0
    vt_nota                           FLOAT NOT NULL,
    vt_liquido                        FLOAT NOT NULL,
    vt_liq_final                      FLOAT NOT NULL, -- fixo 0
    vt_custo                           FLOAT NOT NULL, -- fixo 0
    vb_tx_fatur                        FLOAT NOT NULL, -- fixo 0
    taxa_fatur                         FLOAT NOT NULL, -- fixo 0
    vt_tx_fatur                        FLOAT NOT NULL,
    vt_add_frete                       FLOAT NOT NULL,
    vt_rebate                          FLOAT NOT NULL, -- fixo 0
    atualizado_em                      DATETIME NOT NULL,
    UNIQUE KEY uq_fatcom (origem_dados, grupo_empresa, cd_filial, nf, serie, item, cd_produto),
    INDEX idx_dt_movto (dt_movto),
    INDEX idx_periodo (periodo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

`etl_fatcom` alimenta diretamente um futuro módulo de relatório de margem
(fora de escopo desta spec — pendente, ver seção 7.7), igual
`dash/margem.php` no projeto original.

---

## 5. Telas do Módulo

### 5.1. Painel de Integrações (`/integracao/painel`)

Um card por entidade (Empresas, Produtos, Parceiros, Preços, Estoque,
Pedidos, Notas Fiscais, Representantes, ML Pedidos, + os 3 ETLs). Cada
card mostra: status da última execução (badge), quando rodou, quantidade
de registros, e botão "Sincronizar agora" (dispara o job em background e
leva pro histórico dessa execução, já acompanhando ao vivo via SSE).

### 5.2. Histórico de Execuções (`/integracao/execucoes`)

Lista de `integracao_log`, filtro por entidade, clicar numa execução abre
o detalhe (`integracao_log_detalhe`) — página/lote, quantidade, status,
duração, `request_body` pra depuração. Execução com `status='iniciado'`
mostra o acompanhamento ao vivo (SSE) em vez da grade estática; botão
"Cancelar" disponível enquanto isso.

### 5.3. Fila SysEmp (`/integracao/fila`)

Grid de auditoria de `sysemp_fila` — filtros por `tipo_tabela`, `acao`,
`consumido`, `confirmado_sysemp`, com erro, busca por `id_registro`.
Permite forçar reprocessamento (zerar `consumido`) ou excluir uma linha
manualmente (ela volta a aparecer na próxima importação da fila).

### 5.4. Parâmetros de Fila SysEmp (`/integracao/parametros-fila`)

CRUD de `sysemp_fila_config` — só edição de linhas que já têm suporte no
código (não cria integração nova do nada), igual
`admin/sysemp_integracoes.php` do projeto original.

### 5.5. Conexão Mercado Livre (`/integracao/mercado-livre`)

- Botão "Conectar" dispara o fluxo OAuth2+PKCE (App ID/Secret/Redirect URI
  vêm de Parâmetros do Sistema, seção 6 — nunca em código).
- Callback trata `?code=&state=`, troca por tokens, upsert em `ml_conta`.
- Lista de contas conectadas: "Testar conexão" (`GET /users/me`),
  "Desconectar" (`DELETE FROM ml_conta`).
- Atalho "Sincronizar agora (últimos 7 dias)".

---

## 6. Parâmetros do Sistema — novas categorias

Reaproveita a tela e o mecanismo que a Infra já construiu (spec base,
seção 9) — evita uma tela de configuração bespoke por integração, igual já
foi feito pro módulo TI.

**Categoria `SYSEMP`:**

| Campo | Sensível |
|---|---|
| `BASE_URL` | Não |
| `TOKEN` | Sim |
| `TIMEOUT_SEGUNDOS` | Não |
| `PEDIDOS_DIAS_RETROATIVOS` | Não |

**Categoria `MERCADO_LIVRE`:**

| Campo | Sensível |
|---|---|
| `APP_ID` | Não |
| `SECRET` | Sim |
| `REDIRECT_URI` | Não |

---

## 7. Decisões Validadas

1. **Fila só para Notas Fiscais e Estoque nesta v1** — as demais entidades
   (Produtos, Parceiros, Preços, Pedidos, Empresas, Representantes)
   mantêm o mecanismo do projeto original (lote/offset ou busca completa,
   seções 3.4/3.5), em vez de migrar tudo pra fila de uma vez. Migrar mais
   uma entidade pra fila no futuro é aditivo (seção 3.3).
2. **`grupo_empresa` (classificação JNK/CNK2/NK2 por `id_empresa`)** —
   mantido o mesmo mapeamento fixo do projeto original.
3. **Nomenclatura das tabelas `etl_*`** — `snake_case` (seção 4.4),
   consistente com o resto do jnk-portal.
4. **Link `sysemp_empresa.filial_id` → `filiais`** — confirmado opcional,
   atribuído manualmente por um admin, nunca sincronizado automaticamente
   (seção 4.2).
5. **Pedido de Compra (`tipo_tabela=5`) e OS (`tipo_tabela=8`)** — fora de
   escopo, não implementar por ora.
6. **Migração do KPL** (`migration/kpl/migrate_kpl.py` no projeto
   original) — **pendente**, não faz parte desta spec. Fica em aberto pra
   decisão futura (vira spec própria se algum dia for necessária).
7. **Relatório de Margem** (`dash/margem.php` no original, consome
   `etl_fatcom`) — **pendente**. Esta spec entrega só a integração + ETL
   (os dados prontos); a tela de relatório em si fica pra decidir depois,
   possivelmente um módulo `Relatórios`/`Dashboard` futuro.
8. **Agendamento automático** — fora desta v1 (seção 3.6). Só gatilho
   manual por enquanto; `node-cron` ou equivalente entra numa fase
   posterior, quando fizer sentido.
