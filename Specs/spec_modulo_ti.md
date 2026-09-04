# Especificação Técnica: Módulo TI

## 1. Contexto e Origem

Este spec cobre o módulo `TI` do Hub de Aplicativos como um todo — um único
módulo (`chave_modulo = 'TI'`), não uma tela isolada — reunindo inventário de
equipamentos, catálogo/instalação/atualização de programas, departamentos,
responsáveis e auditoria de coleta. Todas essas partes giram em torno do
mesmo modelo de dados (`ti_equipamento`/`ti_inventario_coleta`) e por isso
ficam num spec só, em vez de fragmentadas em vários documentos (ver decisão
na seção 1.3).

O conteúdo adapta pra arquitetura do jnk-portal (monorepo TS + MySQL, ver
`Specs/spec_infra_portal_base_monorepo.md`) um sistema já construído e validado
em produção no projeto `C:\GitHub\jnakao-digital-ocean` — especificamente a
parte de **Inventário de Equipamentos de TI**, que ali é PHP + tabelas `tb_pc_*`.
Não é um redesenho: é o mesmo modelo de dados e as mesmas telas, traduzidos pra
Node/Express + React + MySQL (jnk-portal já é MySQL, então o schema em si quase
não muda) e encaixados no padrão de módulo/RBAC que a Infra do jnk-portal já
define (seção 6 do spec base: `modulos_sistema`, `telas_modulo`,
`requirePermissao`).

**Nada abaixo está implementado ainda — este documento é pra validação antes
de qualquer código.** Depois de aprovado, vira o novo módulo `TI` no Hub de
Aplicativos.

### 1.1. O que é reaproveitado sem mudança

- **O agente Windows (`agente-inventario-pc/`, .NET 8)** — console app já
  testado ponta a ponta (coleta + envio completo em ~8s, 203 programas,
  todas as tabelas conferidas). Continua exatamente como está: WMI +
  registro pra coletar hardware/software, HTTP POST de um JSON pra uma API,
  autenticado por header `X-Api-Key`. **Não precisa reescrever nem
  recompilar o agente** — só apontar `appsettings.json` (`ApiUrl`) pro novo
  endpoint do jnk-portal e gerar um token novo. O contrato JSON do payload
  (seção 5) é copiado exatamente do que o agente já envia hoje.
- **O modelo de dados** — praticamente 1:1, só traduzido de "empresa"
  (`tb_empresas` do projeto antigo) pra **filial** (`filiais`, que já existe
  no jnk-portal) e de "usuário responsável" pro `usuarios` que já existe.
- **A lógica de diff/comparação de coletas** (`src/PcInventario.php`) — a
  regra de negócio é portada pra TypeScript, mesma lógica.
- **A geração de scripts PowerShell** (Instalar Programas / Atualizar
  Programas) — mesmo conteúdo de script, só o endpoint que gera muda de
  PHP pra Express.

### 1.2. O que muda de propósito

- Autenticação de usuário humano nas telas passa a ser o JWT + RBAC do
  jnk-portal (`requirePermissao`, Perfis de Acesso — seção 6/7 do spec
  base), não o `Auth::requireTela()` do projeto antigo.
- Autenticação do **agente** (máquina, não humano) continua sendo só o
  token (`X-Api-Key`), **fora** do JWT de sessão — é um endpoint público
  diferente, sem tela de login envolvida.
- Todas as telas administrativas viram rotas do módulo `TI` no Hub,
  seguindo o padrão de `/config/*` que o Configurador já usa (seção 6 do
  spec base) — aqui como `/ti/*`.

### 1.3. Por que um spec só, não um por tela/funcionalidade

Inventário, catálogo/instalar/atualizar programas, departamentos,
responsáveis e auditoria não são funcionalidades independentes — todas
referenciam direta ou indiretamente `ti_equipamento`/`ti_inventario_coleta`,
e todas vivem no mesmo módulo único do Hub (`chave_modulo = 'TI'`). Separar
em vários documentos forçaria referência cruzada entre specs pra descrever
uma coisa só, sem ganho real. Segue o mesmo padrão já usado pela Infra: um
spec por módulo de negócio, não por tela. Se algum dia "Instalar/Atualizar
Programas" crescer a ponto de servir outras áreas além de TI (deixando de
ser específico de inventário), aí sim vale considerar destacar num módulo
próprio — mas isso é hipotético, não motivo pra fragmentar agora.

---

## 2. Módulo no Hub de Aplicativos

Novo módulo em `modulos_sistema`:

| Campo | Valor |
|---|---|
| `nome` | TI |
| `chave_modulo` | `TI` |
| `icone` | `Laptop` (Lucide) |
| `descricao` | Inventário de hardware/software, gestão de equipamentos e automação de setup de máquinas Windows. |

Telas (`telas_modulo`), cada uma com sua própria linha em `permissoes_usuario`/
`perfis_telas` — mesmo grão de permissão do projeto original
(`Auth::requireTela('pc_equipamentos')` etc., um grupo por tela abaixo):

| Tela | `rota_tela` | Observação |
|---|---|---|
| Equipamentos | `/ti/equipamentos` | Lista + histórico + comparar + termo (drill-down, mesma permissão) |
| Departamentos | `/ti/departamentos` | Cadastro livre |
| Atribuir Responsáveis | `/ti/responsaveis` | |
| Catálogo de Programas | `/ti/catalogo-programas` | |
| Instalar Programas | `/ti/instalar-programas` | Gera `.bat` executável |
| Atualizar Programas | `/ti/atualizar-programas` | Gera `.bat` executável |
| Softwares Aprovados | `/ti/softwares-aprovados` | Inclui drill-down "máquinas com este software" |
| Auditoria de Coleta | `/ti/auditoria-coleta` | |

---

## 3. Modelo de Dados (MySQL)

Segue a convenção do spec base (seção 4): `snake_case`, `utf8mb4`,
`AUTO_INCREMENT`, `BOOLEAN`, `DATETIME DEFAULT CURRENT_TIMESTAMP`. Prefixo
`ti_` (em vez de `tb_pc_` do projeto antigo) — sem prefixo `tb_`, já que
nenhuma outra tabela do jnk-portal usa esse prefixo.

```sql
-- Departamentos (RH, Financeiro, Vendedor Loja...) — cadastro livre.
CREATE TABLE ti_departamento (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    nome        VARCHAR(100) NOT NULL,
    ativo       BOOLEAN DEFAULT TRUE,
    criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Catálogo de programas instaláveis via winget (alimenta Instalar Programas).
CREATE TABLE ti_catalogo_programa (
    id                        INT AUTO_INCREMENT PRIMARY KEY,
    nome                      VARCHAR(150) NOT NULL,
    winget_id                 VARCHAR(150) NOT NULL,
    ativo                     BOOLEAN DEFAULT TRUE,
    configurar_acesso_remoto  BOOLEAN DEFAULT FALSE, -- pós-instalação específica do AnyDesk (seção 8)
    criado_em                 DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_winget_id (winget_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cadastro de equipamentos (1 linha por máquina).
-- Ver seção 1.3 sobre filial_id ser NULL-ável aqui — desvio deliberado da
-- diretriz geral do spec base (filial_id NOT NULL em toda tabela de negócio).
CREATE TABLE ti_equipamento (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    nome_computador         VARCHAR(100) NOT NULL, -- Environment.MachineName — chave natural
    apelido                 VARCHAR(150) NULL,
    patrimonio              VARCHAR(100) NULL,
    id_departamento         INT NULL,
    filial_id               INT NULL, -- config local do agente; pode chegar antes de um admin corrigir
    id_usuario_responsavel  INT NULL,
    serial_bios             VARCHAR(100) NULL,
    serial_placa_mae        VARCHAR(100) NULL,
    observacoes             VARCHAR(255) NULL,
    ativo                   BOOLEAN DEFAULT TRUE,
    primeira_coleta_em      DATETIME NULL,
    ultima_coleta_em        DATETIME NULL,
    criado_em               DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_nome_computador (nome_computador),
    INDEX idx_filial_id (filial_id),
    INDEX idx_id_departamento (id_departamento),
    INDEX idx_serial_bios (serial_bios),
    FOREIGN KEY (id_departamento) REFERENCES ti_departamento(id) ON DELETE SET NULL,
    FOREIGN KEY (filial_id) REFERENCES filiais(id) ON DELETE SET NULL,
    FOREIGN KEY (id_usuario_responsavel) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Fotos do equipamento — ver seção 9 sobre BLOB x DigitalOcean Spaces.
CREATE TABLE ti_equipamento_foto (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    id_equipamento  INT NOT NULL,
    nome_arquivo    VARCHAR(255) NULL,
    tipo_mime       VARCHAR(100) NULL,
    tamanho_bytes   INT UNSIGNED NULL,
    conteudo        LONGBLOB NOT NULL,
    enviado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_equipamento) REFERENCES ti_equipamento(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cabeçalho de cada execução do agente (1 linha por snapshot completo).
CREATE TABLE ti_inventario_coleta (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    id_equipamento  INT NOT NULL,
    coletado_em     DATETIME NOT NULL, -- horário local da máquina, informado pelo agente
    recebido_em     DATETIME DEFAULT CURRENT_TIMESTAMP, -- horário do servidor
    usuario_windows VARCHAR(100) NULL,
    ip_local        VARCHAR(45) NULL,
    versao_agente   VARCHAR(20) NULL,
    anydesk_id      VARCHAR(20) NULL,
    hash_dados      CHAR(64) NULL, -- sha256 do payload — checar "mudou algo?" sem reler tudo
    FOREIGN KEY (id_equipamento) REFERENCES ti_equipamento(id),
    INDEX idx_equipamento_data (id_equipamento, coletado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Sistema operacional (1:1 por coleta).
CREATE TABLE ti_sistema_operacional (
    id_coleta           INT PRIMARY KEY,
    caption              VARCHAR(150) NULL,
    versao               VARCHAR(50)  NULL,
    build_number         VARCHAR(20)  NULL,
    arquitetura          VARCHAR(20)  NULL,
    data_instalacao      DATETIME NULL,
    ultimo_boot          DATETIME NULL,
    usuario_registrado   VARCHAR(100) NULL,
    numero_serie         VARCHAR(100) NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Processador (1:1 por coleta).
CREATE TABLE ti_processador (
    id_coleta                     INT PRIMARY KEY,
    nome                          VARCHAR(150) NULL,
    fabricante                    VARCHAR(100) NULL,
    processor_id                  VARCHAR(50)  NULL,
    velocidade_atual_mhz          INT UNSIGNED NULL,
    velocidade_maxima_mhz         INT UNSIGNED NULL,
    cache_l2_kb                   INT UNSIGNED NULL,
    cache_l3_kb                   INT UNSIGNED NULL,
    numero_nucleos                SMALLINT UNSIGNED NULL,
    numero_nucleos_habilitados    SMALLINT UNSIGNED NULL,
    numero_processadores_logicos  SMALLINT UNSIGNED NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Placa-mãe (1:1 por coleta).
CREATE TABLE ti_placa_mae (
    id_coleta     INT PRIMARY KEY,
    nome          VARCHAR(150) NULL,
    fabricante    VARCHAR(100) NULL,
    modelo        VARCHAR(100) NULL,
    produto       VARCHAR(100) NULL,
    numero_serie  VARCHAR(100) NULL,
    versao        VARCHAR(50)  NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- BIOS (1:1 por coleta).
CREATE TABLE ti_bios (
    id_coleta     INT PRIMARY KEY,
    fabricante    VARCHAR(100) NULL,
    numero_serie  VARCHAR(100) NULL,
    versao        VARCHAR(100) NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Memória RAM (1:N — um pente por linha).
CREATE TABLE ti_memoria_ram (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta         INT NOT NULL,
    nome              VARCHAR(100) NULL,
    fabricante        VARCHAR(100) NULL,
    banco             VARCHAR(50)  NULL,
    slot              VARCHAR(50)  NULL,
    capacidade_bytes  BIGINT UNSIGNED NULL,
    velocidade_mhz    INT UNSIGNED NULL,
    part_number       VARCHAR(100) NULL,
    numero_serie      VARCHAR(100) NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Discos internos (USB fica de fora — pen drive/HD externo não é o equipamento).
CREATE TABLE ti_disco (
    id                 INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta          INT NOT NULL,
    nome               VARCHAR(150) NULL,
    modelo             VARCHAR(150) NULL,
    fabricante         VARCHAR(100) NULL,
    interface          VARCHAR(30)  NULL,
    firmware           VARCHAR(50)  NULL,
    numero_serie       VARCHAR(100) NULL,
    tamanho_bytes      BIGINT UNSIGNED NULL,
    numero_particoes   SMALLINT UNSIGNED NULL,
    tipo_midia         VARCHAR(20)  NULL, -- SSD | HDD | SCM
    barramento         VARCHAR(20)  NULL, -- SATA | NVMe | SAS | ...
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Placas de rede conectadas (1:N).
CREATE TABLE ti_rede (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta       INT NOT NULL,
    nome            VARCHAR(150) NULL,
    tipo_adaptador  VARCHAR(50)  NULL,
    mac_address     VARCHAR(20)  NULL,
    velocidade_bps  BIGINT UNSIGNED NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Periféricos de baixa prioridade (teclado/mouse/monitor/CD-DVD) — só completude.
CREATE TABLE ti_periferico (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta   INT NOT NULL,
    tipo        VARCHAR(20)  NOT NULL, -- TECLADO | MOUSE | MONITOR | CDDVD
    nome        VARCHAR(150) NULL,
    descricao   VARCHAR(255) NULL,
    fabricante  VARCHAR(100) NULL,
    device_id   VARCHAR(150) NULL,
    status      VARCHAR(50)  NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta_tipo (id_coleta, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Software instalado (1:N — lista do registro do Windows).
CREATE TABLE ti_software (
    id                     INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta              INT NOT NULL,
    nome                   VARCHAR(255) NULL,
    versao                 VARCHAR(100) NULL,
    fabricante             VARCHAR(150) NULL,
    data_instalacao        VARCHAR(20)  NULL, -- texto cru do registro, nem sempre é data válida
    local_instalacao       VARCHAR(500) NULL,
    tamanho_estimado_kb    BIGINT UNSIGNED NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta),
    INDEX idx_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Histórico de dispositivos de armazenamento USB já conectados (1:N).
-- numero_serie fica NULL quando o dispositivo não informa serial de verdade.
CREATE TABLE ti_dispositivo_usb (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    id_coleta         INT NOT NULL,
    fabricante        VARCHAR(150) NULL,
    modelo            VARCHAR(150) NULL,
    revisao           VARCHAR(50)  NULL,
    numero_serie      VARCHAR(150) NULL,
    nome_amigavel     VARCHAR(255) NULL,
    ultima_vez_visto  DATETIME NULL,
    FOREIGN KEY (id_coleta) REFERENCES ti_inventario_coleta(id) ON DELETE CASCADE,
    INDEX idx_id_coleta (id_coleta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Softwares aprovados pela empresa — cadastro por NOME (não nome+versão).
CREATE TABLE ti_software_aprovado (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    nome             VARCHAR(255) NOT NULL,
    aprovado         BOOLEAN DEFAULT FALSE,
    versao_aprovada  VARCHAR(100) NULL, -- em branco = qualquer versão serve
    observacoes      VARCHAR(255) NULL,
    atualizado_em    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Tokens de autenticação do agente — igual em espírito a como o resto do
-- jnk-portal nunca embute credencial fixa; aqui é a versão "máquina" disso.
CREATE TABLE ti_api_token (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    token          VARCHAR(100) NOT NULL,
    descricao      VARCHAR(150) NULL,
    ativo          BOOLEAN DEFAULT TRUE,
    criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultimo_uso_em  DATETIME NULL,
    UNIQUE KEY uq_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

### 3.1. Por que `ti_equipamento.filial_id` é `NULL`-ável

A diretriz do spec base (seção 4) exige `filial_id INT NOT NULL` em toda
tabela de negócio nova, pra isolamento garantido por filial. Aqui é um
**desvio deliberado**, herdado do comportamento já validado no projeto
original: o agente roda numa máquina que pode ser instalada **antes** de
alguém no admin já ter certeza de qual filial ela pertence (`config.IdEmpresa`
no `appsettings.json` é opcional). Se o endpoint de ingestão rejeitasse
coletas sem filial, a primeira execução do agente numa máquina nova falharia
até alguém preencher isso manualmente — o que inverte o fluxo real (instalar
o agente, e só depois um admin classifica o equipamento na tela, igual já
acontece hoje com departamento e responsável). **Fica marcado aqui para
validação** — se preferir manter a regra geral sem exceção, a alternativa é
tornar `IdEmpresa` obrigatório no agente antes de aceitar a primeira coleta.

---

## 4. Endpoint de Ingestão (agente → API)

`POST /api/ti/inventario` — **fora do JWT de sessão**, autenticado só por
`X-Api-Key` (validado contra `ti_api_token.token`, `ativo = TRUE`). Contrato
JSON idêntico ao que o agente já envia hoje (nenhuma mudança no agente):

```json
{
  "computador": { "nome": "PC-FINANCEIRO01", "id_empresa": 3, "serial_bios": "...", "serial_placa_mae": "..." },
  "coleta": { "coletado_em": "2026-08-19 11:23:45", "usuario_windows": "jsilva", "ip_local": "192.168.1.50", "versao_agente": "1.2.0", "anydesk_id": "123456789" },
  "sistema_operacional": { "...": "..." },
  "processador": { "...": "..." },
  "placa_mae": { "...": "..." },
  "bios": { "...": "..." },
  "memoria_ram": [{ "...": "..." }],
  "disco": [{ "...": "..." }],
  "rede": [{ "...": "..." }],
  "periferico": [{ "tipo": "TECLADO", "...": "..." }],
  "software": [{ "nome": "...", "versao": "...", "...": "..." }],
  "dispositivo_usb": [{ "...": "..." }]
}
```

`computador.id_empresa` do agente é interpretado pelo endpoint como
`filial_id` — **mesmo nome de campo no JSON** (não renomear no lado do
agente, só reinterpretar no lado do servidor), pra não exigir recompilar
nada.

Cada seção fora `computador`/`coleta` é opcional (se uma consulta WMI falhar
no agente, o resto ainda é aceito). Toda requisição grava um snapshot novo,
nunca atualiza uma coleta antiga.

**Lógica de gravação** (porta de `api/inventario_pc.php`):
1. Upsert de `ti_equipamento` por `nome_computador` (cria se não existir;
   se existir, atualiza `filial_id`/seriais só se vierem preenchidos —
   `COALESCE`, nunca apaga um valor já corrigido manualmente por um admin —
   e sempre atualiza `ultima_coleta_em`).
2. Insere o cabeçalho em `ti_inventario_coleta`.
3. Insere os blocos 1:1 (SO, processador, placa-mãe, BIOS) se vieram.
4. Insere os blocos 1:N **em lote** (`INSERT ... VALUES (...),(...),...` em
   blocos de 200 linhas, não um `INSERT` por linha) — o projeto original
   documentou que uma máquina com 200+ programas instalados já estourou o
   tempo de execução fazendo round-trip de rede por linha contra um banco
   gerenciado; replicar esse cuidado aqui também (o MySQL da DO tem a mesma
   característica de latência de rede).
5. Tudo dentro de uma transação (`withTransaction`, já existe no
   `apps/api/src/config/database.ts`).
6. Atualiza `ti_api_token.ultimo_uso_em`.

---

## 5. Telas do Módulo

Todas seguem o padrão de permissão granular do Configurador
(`requirePermissao(rotaTela, acao)`), reaproveitando os mesmos componentes de
tabela/filtro/exportação que o resto do jnk-portal usa.

### 5.1. Equipamentos (`/ti/equipamentos`)

Lista todo `ti_equipamento`, com o resumo da última coleta de cada um (SO,
processador, RAM total) e filtros por filial/responsável/departamento.
Clicar num equipamento abre o **histórico** (`/ti/equipamentos/:id`):

- Dados cadastrais editáveis (apelido, patrimônio, departamento).
- Galeria de fotos (upload múltiplo, só aceita `image/*`, exclusão
  individual) — ver seção 9 sobre onde ficam armazenadas.
- Snapshot atual (última coleta): SO, processador, placa-mãe, BIOS, RAM
  total, contadores (discos, redes, programas, USB).
- Tabela de discos e de dispositivos USB já conectados.
- Lista de todas as coletas, com dois rádios (`De` / `Para`) pra escolher
  duas e comparar.
- Link "ID do AnyDesk: Conectar" (`anydesk:<id>`) quando a última coleta
  trouxe um ID válido.
- Link pra gerar o Termo de Responsabilidade (seção 8).

### 5.2. Comparar Coletas (`/ti/equipamentos/:id/comparar?de=&para=`)

Roda o diff (seção 7) entre duas coletas da mesma máquina e mostra uma
tabela única (Categoria / Item / Tipo / Campo / De / Para), exportável.
Confere que as duas coletas realmente pertencem ao equipamento da URL antes
de comparar (evita comparar coleta de uma máquina com outra por URL
adulterada).

### 5.3. Departamentos (`/ti/departamentos`)

CRUD simples (nome, ativo/inativo). Exclusão física — `FOREIGN KEY ...
ON DELETE SET NULL` em `ti_equipamento.id_departamento`, então excluir um
departamento não quebra equipamento nenhum, só some a classificação.

### 5.4. Atribuir Responsáveis (`/ti/responsaveis`)

Grade única (computador + filial + `<select>` de responsável por linha) com
um botão "Salvar" só — mais rápido que editar equipamento por equipamento
quando é preciso atribuir vários de uma vez. Filtro por filial.

### 5.5. Catálogo de Programas (`/ti/catalogo-programas`)

CRUD (nome, `winget_id`, ativo, flag `configurar_acesso_remoto`). Alimenta o
checklist de "Instalar Programas". `winget_id` é o identificador exato do
pacote (descobre-se rodando `winget search "nome"` numa máquina Windows).

### 5.6. Instalar Programas (`/ti/instalar-programas`)

Tela que **gera um `.bat` executável** (download direto, não executa nada
remotamente) a partir de três seleções independentes:
1. Programas do catálogo marcados → vira `winget install --id <id> --silent
   --accept-source-agreements --accept-package-agreements` por programa,
   sempre a versão mais recente disponível.
2. Programas indesejados pré-definidos em código (Xbox, jogos da Microsoft
   Store, Spotify, etc. — lista fixa, não vem do catálogo editável) → vira
   `Get-AppxPackage`/`Remove-AppxPackage` (+ fallback `winget uninstall`
   pros que também têm instalador clássico, como o Spotify).
3. Checkbox "Habilitar Administrador local" → bloco que pergunta a senha
   **na hora que o script roda, na própria máquina** (nunca fica salva no
   site nem no arquivo gerado).

Se algum programa do catálogo tem `configurar_acesso_remoto = TRUE`, o
script ganha um bloco extra que configura o AnyDesk pra iniciar com o
Windows e pede a senha de acesso não supervisionado (também só em memória,
na hora da execução).

**Decisão de design herdada:** rodar é sempre uma ação manual de quem
estiver na máquina — o site nunca executa comando remoto nenhum, só gera o
arquivo. Baixar/rodar fica pro técnico, tipicamente numa máquina
recém-formatada — e é justamente esse cenário que motivou o `.bat`: numa
máquina recém-formatada, o duplo clique num `.ps1` abre o Bloco de Notas.
Ver seção 5.7 para o mecanismo de empacotamento.

### 5.7. Gerar Scripts (`/ti/gerar-scripts`)

Hub de automações pra máquinas Windows — cada script é um card na tela,
todos seguindo o mesmo padrão: botão gera o arquivo, nada roda a partir do
clique, rodar é sempre manual na máquina de destino.

**Os três scripts do módulo saem como `.bat` executável, não `.ps1`** — os
dois cards deste hub e o de Instalar Programas (seção 5.6), desde
02/09/2026. O motivo é que um `.ps1` não é executável no Windows: duplo
clique abre o Bloco de Notas, e mesmo pelo menu "Executar com PowerShell"
ele ainda esbarra em ExecutionPolicy e na falta de elevação. O `.bat`
resolve os três de uma vez — pede elevação sozinho (`net session` +
`Start-Process -Verb RunAs`), chama o PowerShell com `-ExecutionPolicy
Bypass` e roda. Ver `empacotarComoBat` em `services/tiScripts.ts`.

`.exe` foi descartado: exigiria compilar a cada download, e um binário não
assinado é justamente o que o SmartScreen e o antivírus bloqueiam na
máquina do usuário final — trocaria um atrito por outro pior.

**O PowerShell viaja dentro do `.bat` em base64**, não colado como texto, e
essa é a decisão que faz o empacotamento funcionar. Colado, o `cmd.exe`
interpretaria `%`, `&`, `|`, `>` e `^` do script (o de atualizar programas
tem todos) e leria acento no codepage do console em vez de UTF-8. Em base64
o corpo é ASCII puro, chega intacto, e o BOM que o PowerShell 5.1 precisa
vai junto. Duas consequências que o teste cobre: o `.bat` em si **não pode**
ter BOM (o `cmd.exe` tentaria executar os bytes do BOM como comando), e o
base64 é quebrado em pedaços de 500 caracteres porque o `cmd.exe` trunca
linha acima de 8191 — em uma linha só, um script grande sairia corrompido
em silêncio. Cresce ao longo do tempo (novos cards) sem precisar de tela nova
no Hub — é a mesma `rota_tela`/permissão pra todos os scripts deste hub.

**Card 1 — Atualizar Programas e Drivers.** Gera um script fixo (não
depende de nenhuma seleção) que roda `winget upgrade --all` e consulta o
Windows Update só por drivers pendentes (via COM `Microsoft.Update.Session`,
nativo do Windows — não precisa de módulo do PowerShell Gallery). Não mexe
em atualização de sistema/segurança do Windows, só driver.

*   **As duas metades rodam em contextos diferentes, e isso é o desenho, não
    um detalhe.** O `.bat` deste card sai com `elevar: false` — é o único
    do módulo que **não** auto-eleva. O `winget` roda na sessão do usuário
    logado; só o bloco de drivers eleva, relançando o próprio script com o
    parâmetro `-LogDrivers` (que também é por onde a saída da janela
    elevada volta para a original).
*   **Por quê:** o índice do `winget` não é um arquivo, é um pacote **MSIX
    registrado por usuário**, e registrar MSIX exige **sessão interativa**.
    Enquanto o `.bat` elevava tudo na primeira linha, o operador digitava
    no UAC uma conta administrativa (na máquina do relato, a conta interna
    `Administrador`, RID 500) que tem token mas nunca fez logon ali. A
    implantação falhava com `0x80073D19` ("usuário foi desconectado"), o
    índice nunca era registrado, e o `winget` morria em `0x8A15000F` ("os
    dados exigidos pela origem estão ausentes").
*   **O que já foi tentado e não resolve** — está aqui para ninguém repetir:
    `--accept-source-agreements` (o problema nunca foi aceite de termos),
    `winget source update` (retorna 0 mesmo com a fonte inutilizável, então
    também não serve de teste) e `winget source reset --force` (testado em
    campo, o `upgrade` seguinte falhou idêntico). Os três operam acima da
    camada que quebra: nenhuma flag do `winget` alcança a implantação de
    pacotes do Windows. O log em
    `%LOCALAPPDATA%\Packages\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe\LocalState\DiagOutputDir`
    é onde o erro real aparece — a mensagem de tela não o mostra.
*   **A busca é restrita a `--source winget`.** A `msstore` exige região
    geográfica configurada e aceite de contrato próprio, e não atualiza
    programa de desktop. Consequência aceita: app instalado pela Microsoft
    Store não entra nesta atualização; a própria Store cuida dele.
*   **Preço assumido:** se o usuário logado não for administrador, programa
    de escopo de máquina vai pedir UAC durante o upgrade. O card é de
    execução manual, com alguém na frente da máquina, então isso é
    aceitável — o contrário (elevar tudo) é justamente o que quebrava.
*   **Instalar Programas (seção 5.6) tem o mesmo defeito** e ainda não foi
    corrigido: ele roda `winget install` sob a auto-elevação do `.bat`,
    então falha do mesmo jeito numa máquina onde o operador eleva com conta
    sem sessão. A correção é a mesma divisão de contextos.

**Card 2 — Configurar Agente de Inventário.** Gera um script que instala o
agente (`agente-inventario-pc/`) numa máquina nova, em três passos:

1. Baixa `AgenteInventarioPC.exe` de uma URL configurável.
2. Copia pra `C:\Program Files\RRCMTOOLS\` (cria o diretório se não
   existir) e grava um `appsettings.json` com as credenciais desta
   instalação.
3. Registra a tarefa agendada que roda o agente a cada reinicialização,
   como `SYSTEM` — importando via `Register-ScheduledTask -Xml` a partir
   de uma definição de tarefa idêntica a um export real que já funcionava
   (`agente-inventario-pc/ModeloJob/RRCM - Inventario de TI.xml`), em vez
   de montar a chamada via `schtasks.exe` na linha de comando. Isso evita
   de propósito o bug de parsing que o `schtasks` tem com caminho com
   espaço, documentado em `agente-inventario-pc/README.md` ("Cuidado com
   caminho que tem espaço") — `Register-ScheduledTask` recebe a definição
   já estruturada, sem re-parsear uma string de comando com aspas. O
   script é idempotente: desregistra a tarefa antes de recriar, se já
   existir.

Três valores novos em **Parâmetros → TI** alimentam este script:
`AGENTE_DOWNLOAD_URL` (de onde baixar o `.exe` — em produção,
`https://portal.jnakao.com.br/downloads/AgenteInventarioPC.exe`, servido
pela rota pública `/downloads` da API a partir de
[`downloads/`](../downloads) na raiz do monorepo, ver
`Specs/deploy_digitalocean.md`, seção 11), `AGENTE_API_URL` (endpoint
de ingestão, `/api/ti/inventario`) e `AGENTE_API_KEY` (token — sensível,
mesmo tratamento de criptografia que `SMTP_PASSWORD`). Sem os três
configurados, o endpoint recusa gerar o script (`422`) em vez de devolver
algo quebrado.

**Cuidado de codificação:** todo PowerShell gerado (os três) leva um BOM
UTF-8 no início do conteúdo — nos dois cards deste hub, dentro do base64
embutido no `.bat` que o usuário baixa. Sem isso, o Windows PowerShell 5.1 (ainda comum em
máquina de usuário final) lê o arquivo com um codepage de 1 byte por
padrão e corrompe qualquer caractere acentuado — inclusive nome de
programa com acento cadastrado no Catálogo. Descoberto testando o parser
de PowerShell diretamente contra o script baixado de verdade (não só
lendo o código-fonte TS).

### 5.8. Softwares Aprovados (`/ti/softwares-aprovados`)

Lista todo nome de software **instalado agora** (só a última coleta de cada
equipamento — não "já visto alguma vez"; desinstalou de todos, some da
lista sozinho) com a versão mais recente vista e quantas máquinas têm.
Checkbox "Aprovado" + campo livre "Versão aprovada" (em branco = qualquer
versão serve) por linha, salvos em lote. Base pra uma futura auditoria
"instalado × aprovado" — ainda não existe fonte confiável de "última versão
do fabricante" pra nenhum software, então a versão aprovada pela empresa é
o substituto prático disso.

Clicar num software abre **Máquinas com o Software**
(`/ti/softwares-aprovados/maquinas?nome=`): quais equipamentos têm aquele
software na última coleta, com responsável e versão instalada.

### 5.9. Auditoria de Coleta (`/ti/auditoria-coleta`)

Todo equipamento ativo, ordenado por dias desde a última coleta (quem nunca
coletou aparece primeiro — pior caso). Cores: até 2 dias = normal (cobre
fim de semana), 3–5 = atenção, mais de 5 (ou nunca) = crítico. Serve pra
achar máquina com agente desinstalado/quebrado ou desligada há muito tempo.

---

## 6. Lógica de Comparação de Coletas (diff)

Porta de `src/PcInventario.php` pra TypeScript (`apps/api/src/services/tiDiff.ts`,
sugestão de nome), mesma lógica:

- **Campos 1:1** (SO, processador, placa-mãe, BIOS): compara campo a campo
  entre as duas coletas; só entra no resultado o que mudou. Comparação
  sempre como texto (evita diferenciar `"10"` de `10` por tipagem do driver,
  que não é uma mudança real).
- **Listas 1:N** (memória, disco, rede, periférico, software, USB): casadas
  por uma **chave estável**, não pela ordem (a mesma lista pode vir em ordem
  diferente entre duas coletas):

  | Lista | Chave de casamento |
  |---|---|
  | Memória RAM | `slot` |
  | Disco | `numero_serie` |
  | Rede | `mac_address` |
  | Periférico | `device_id` |
  | Software | `nome` |
  | Dispositivo USB | `numero_serie` (ignora `ultima_vez_visto` na comparação — muda sozinho a cada coleta sem ser uma mudança real) |

  Item sem valor na chave (ex: disco sem número de série) fica de fora da
  comparação individual — não dá pra rastrear com segurança o que virou o
  quê, então nem entra em "adicionado" nem em "removido".
- Resultado achatado numa lista única (Categoria/Item/Tipo/Campo/De/Para)
  pra virar uma grade só, mais fácil de ler e exportar do que uma seção
  separada por categoria.

---

## 7. Fotos do Equipamento — decisão em aberto

O projeto original guarda fotos como `LONGBLOB` **dentro do MySQL**
(não em disco), com o comentário explícito: *"o container do App Platform é
efêmero e some a cada deploy, disco local não sobreviveria."* Duas opções
pro jnk-portal, que precisam de uma decisão explícita antes de implementar:

1. **Manter `LONGBLOB` no MySQL** (replicar exatamente como está — seção 3,
   `ti_equipamento_foto.conteudo`). Mais simples, zero infraestrutura nova,
   mas cresce o tamanho do banco gerenciado da DO (que é cobrado por
   armazenamento) com dados binários que um object storage resolveria melhor.
2. **DigitalOcean Spaces** (S3-compatível) — guarda só a URL/chave do objeto
   no MySQL, o binário fica no Spaces. Mais alinhado com "hospedado na DO",
   mas é uma peça de infra nova (bucket, credenciais, upload) que a Infra
   base ainda não tem.

**Recomendação:** começar com a opção 1 (replicar o que já existe e já
funciona), migrar pra Spaces depois se o volume de fotos justificar — mas
fica como pergunta em aberto porque a resposta muda o desenho de algumas
rotas (upload direto vs. gerar URL assinada).

---

## 8. Termo de Responsabilidade (`/ti/equipamentos/:id/termo`)

Relatório individual **imprimível** (o navegador gera o PDF via "Imprimir →
Salvar como PDF" — não depende de nenhuma biblioteca de PDF no servidor):
foto do equipamento + dados do responsável + hardware/software de uma coleta
escolhida + texto de política de uso + linha de assinatura.

O texto da política é editável na própria tela e reaproveita a infra que já
existe: **Parâmetros do Sistema** (spec base, seção 9) ganha uma nova
categoria `TI` com um campo `TERMO_POLITICA_TEXTO` (não sensível) — mesmo
mecanismo de "editar e salvar" que `EMAIL`/`WHATSAPP`/`TELEGRAM` já usam, só
mais uma categoria na lista fechada `DEFINICAO_CAMPOS`.

---

## 9. Decisões Validadas e Status de Implementação

Pontos que estavam em aberto, já validados com o usuário:

1. **`filial_id` opcional em `ti_equipamento`** — mantido opcional (seção 3.1),
   como no projeto original.
2. **Armazenamento de fotos** — MySQL `LONGBLOB` (`ti_equipamento_foto`),
   replicando o que já existe. Migrar pra DigitalOcean Spaces fica em
   aberto pra quando o volume justificar.
3. **Agente .NET reaproveitado sem alterar o código de coleta** — copiado
   pra `agente-inventario-pc/` na raiz deste monorepo (fora dos workspaces
   npm, é um projeto .NET separado), só com `appsettings.json` e os
   comentários de documentação apontando pro endpoint novo
   (`/api/ti/inventario` em vez de `api/inventario_pc.php`). Build
   verificado (`dotnet build`, 0 erros/avisos).
4. **Prefixo de tabela `ti_`** — mantido.
5. **Escopo da primeira leva** — tudo de uma vez, as 9 telas completas.

| Item | Status |
|---|---|
| Schema (`ti_*`, 17 tabelas) — `apps/api/db/007_ti_schema.sql` | ✅ Implementado |
| Seed do módulo/telas — `apps/api/db/008_seed_ti.sql` | ✅ Implementado |
| Endpoint de ingestão (`POST /api/ti/inventario`, autenticado por `X-Api-Key`) | ✅ Implementado e testado ponta a ponta (upsert de equipamento, insert em lote, comparação de duas coletas reais) |
| Agente .NET copiado e recompilado neste monorepo | ✅ Implementado |
| Equipamentos (lista, histórico, editar cadastro, fotos) | ✅ Implementado |
| Comparar Coletas (diff) | ✅ Implementado — `apps/api/src/services/tiDiff.ts`, porta de `PcInventario.php` |
| Termo de Responsabilidade (+ categoria `TI` em Parâmetros) | ✅ Implementado |
| Departamentos | ✅ Implementado |
| Atribuir Responsáveis | ✅ Implementado |
| Catálogo de Programas | ✅ Implementado |
| Instalar Programas (gera `.bat`) | ✅ Implementado |
| Gerar Scripts — hub de scripts, renomeado de "Atualizar Programas" (seção 5.7) | ✅ Implementado — cards: Atualizar Programas e Drivers, Configurar Agente de Inventário |
| Softwares Aprovados + máquinas por software | ✅ Implementado |
| Auditoria de Coleta | ✅ Implementado |

**Correções feitas no caminho:**
- O middleware de erro global da API
(`apps/api/src/app.ts`) sempre respondia `500` pra qualquer erro, mesmo os
que já vinham com status HTTP próprio (ex: JSON malformado no corpo,
`400`, do `express.json()`). Corrigido pra preservar o status original
quando for um erro 4xx — evita mascarar erro de requisição do cliente
(inclusive do próprio agente) como se fosse falha interna do servidor.
- Todo PowerShell gerado leva BOM UTF-8 (`apps/api/src/services/tiScripts.ts#comBom`) —
sem isso o Windows PowerShell 5.1 corrompe caracteres acentuados ao ler o
arquivo. Achado testando o parser de PowerShell diretamente contra o
script baixado pela API de verdade, não só lendo o código-fonte.
