# Especificação Técnica: Infraestrutura da Plataforma (Portal Base Multi-Filial) — Monorepo TS + MySQL (DigitalOcean)

## 0. Status de Implementação

Este spec é o documento vivo do projeto: sempre que a implementação divergir dele
(por necessidade técnica) ou adicionar algo além do que está descrito, este arquivo
é atualizado no mesmo commit. Não confie apenas na intenção original abaixo sem
checar esta seção.

| Item | Status |
|---|---|
| Monorepo (npm workspaces) + `packages/shared` | ✅ Implementado |
| Conexão MySQL (`mysql2/promise`) + query parametrizada (`apps/api/src/config/database.ts`) | ✅ Implementado |
| Schema MySQL (seção 3) — `apps/api/db/001..005_*.sql` + runner `apps/api/db/migrate.ts` | ✅ Implementado |
| Auth JWT + isolamento de tenant (`authTenant`) | ✅ Implementado |
| Login + seleção/troca de filial (seção 4.2) | ✅ Implementado |
| Hub de aplicativos, quadro de avisos (seção 4.3) | ✅ Implementado |
| Sidebar com troca de módulo (seção 4.4) | ✅ Implementado — falta "cargo" no card do usuário (não existe no modelo de dados, igual ao spec original) |
| Force update (seção 4.1.2) | ✅ Implementado (`ForceUpdateGuard.tsx`) |
| Resiliência offline — banner + persistência (seção 4.1.1) | ✅ Implementado (`useOnlineStatus`, `OfflineBanner`) — **falta o reenvio automático** da troca de filial quando o evento `online` dispara; hoje uma falha de rede em `switch-filial` só aparece como erro, sem retry. Pendente. |
| Avisos (CRUD admin, tela `/config/avisos`) | ✅ Implementado |
| Configurador: CRUD de Filiais e Usuários (seção 5) | ✅ Implementado |
| Middleware de permissão granular por tela (`requirePermissao` — seção 5) | ✅ Implementado |
| Perfis de Acesso reutilizáveis / RBAC (seção 6) | ✅ Implementado — `buscarPermissoesEfetivas()` em `apps/api/src/services/permissoes.ts` é a fonte única usada tanto por `requirePermissao` quanto por `buscarModulosPermitidos`, evitando a divergência que a spec alerta |
| Log de Acessos — login, troca de filial, telas acessadas (seção 7) | ✅ Implementado |
| Campo `whatsapp` no cadastro de usuário (seção 7.1) | ✅ Implementado (só o campo, sem integração de envio) |
| Tela de Parâmetros do Sistema (seção 8) | ✅ Implementado (e-mail funcional via `nodemailer`; WhatsApp/Telegram só armazenam config) |
| Esqueci a Senha, reset por e-mail (seção 9) | ✅ Implementado |
| Hub pula a seleção quando só há 1 módulo permitido (seção 4.3) | ⏳ Não implementado — mesma decisão do projeto original: hoje só existe o módulo CONFIG, então não há seleção real acontecendo ainda. Reavaliar quando houver 2+ módulos |
| Integração opcional com Azure AD / multi-tenant | 📝 Em design (seção 10), não implementado |

**Setup local:** copiar `apps/api/.env.example` → `.env` e `apps/portal/.env.example` → `.env`,
preencher as credenciais do cluster MySQL da DigitalOcean, rodar `npm install` na raiz,
`npm run db:migrate` para aplicar o schema, depois `npm run dev:api` e `npm run dev:portal`
(cada um em um terminal).

---

## 1. Contexto do Ambiente e Arquitetura

O ecossistema é um Monorepo gerenciado via **npm workspaces** com TypeScript (TS) estrito em todas as camadas:
*   **apps/portal:** Front-end Single Page Application (SPA) em **React + Vite + TypeScript + Tailwind CSS**.
*   **apps/api:** Back-end REST em **Node.js + Express + TypeScript**, conectado ao **MySQL 8** via driver `mysql2` (modo `promise`).
*   **packages/shared:** Biblioteca local de tipos estruturais (`interfaces`, `enums`, `types`) exportada para consumo síncrono de ambos os pacotes.

### 1.1. Hospedagem — DigitalOcean

*   **Banco de dados:** DigitalOcean **Managed Database for MySQL** (cluster gerenciado, MySQL 8.x). Não é um MySQL rodando numa droplet própria — backups, failover e patches ficam a cargo da DO.
*   **Conexão:** exige TLS. A DO fornece um certificado CA público para o cluster (baixável no painel, `ca-certificate.crt`); a API deve conectar com `ssl: { ca, rejectUnauthorized: true }` — nunca desabilitar a verificação do certificado.
*   **Nome do banco/schema:** `jnk_portal_base`.
*   **Rede:** usar o **connection pool** confiável do cluster (DO expõe endpoint público e, quando a API também estiver na DO — App Platform ou droplet na mesma VPC —, endpoint privado, mais barato e sem trafegar pela internet). Se o volume de conexões simultâneas crescer, considerar o **Connection Pool** gerenciado da própria DO (modo `transaction`) na frente do MySQL, em vez de só o pool do driver.
*   **apps/api** (Node/Express) fica hospedada separadamente do banco — droplet, App Platform ou container registry da DO, a decidir num spec de deploy futuro. Este spec cobre a infraestrutura de aplicação e dados, não o pipeline de deploy.
*   **Variáveis de ambiente esperadas** (`.env`, nunca commitado): `DB_HOST`, `DB_PORT` (padrão `25060` nos clusters gerenciados da DO), `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_CA_CERT` (caminho ou conteúdo do certificado), `JWT_SECRET`, `PARAMETROS_ENCRYPTION_KEY`, `FRONTEND_URL`.

---

## 2. Tipagem Compartilhada (`packages/shared/src/types/infra.ts`)

Estes tipos devem ser criados primeiramente na pasta compartilhada para garantir a consistência do compilador entre o React e o Node.js.

```typescript
export type TemaUI = 'LIGHT' | 'DARK';
export type EstiloBotoes = 'SOLID' | 'OUTLINE' | 'ROUNDED' | 'MINIMAL';

export interface Filial {
  id: number;
  nomeFormatado: string; // Ex: "01 - Filial São Paulo"
  cnpj: string;
}

export interface UsuarioPreferencias {
  temaUi: TemaUI;
  estiloBotoes: EstiloBotoes;
}

export interface PermissaoTela {
  telaId: number;
  nomeTela: string;
  rotaTela: string;
  podeVisualizar: boolean;
  podeCriar: boolean;
  podeEditar: boolean;
  podeDeletar: boolean;
}

export interface ModuloAcesso {
  moduloId: number;
  nomeModulo: string;
  chaveModulo: string; // Ex: 'CONFIG', e futuros módulos de negócio
  iconeModulo: string; // Nome do componente Lucide ou Heroicon
  descricaoModulo: string;
  telas: PermissaoTela[];
}

export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  fotoPerfilBase64?: string;
  ativo: boolean;
  filialAtivaId: number;
  moduloAtivoChave?: string; // Controla qual aplicativo está selecionado na sessão
  filiaisPermitidas: Filial[];
  preferencias: UsuarioPreferencias;
  modulosPermitidos: ModuloAcesso[];
  versaoSistema: string; // Utilizado para validação de cache forçado no cliente
}
```

> Permissões específicas de um módulo de negócio (ex: "pode alterar horário" num
> módulo futuro X) **não** devem entrar como campo solto em `UsuarioSessao` —
> isso mistura o tipo genérico de infra com regra de um módulo específico. Cada
> módulo de negócio deve modelar suas próprias permissões finas via
> `Permissoes_Usuario`/`Perfis_Telas` (seção 6) ou, se granularidade por tela não
> bastar, via uma tabela própria do módulo — a definir no spec daquele módulo.

---

## 3. Banco de Dados Core (MySQL 8 / DigitalOcean Managed Database)

Modelagem com suporte nativo a multi-filiais, vínculos de muitos-para-muitos (`N:N`) e quadro de avisos dinâmicos.

**Decisões de conversão em relação ao spec original (SQL Server → MySQL):**

*   **Charset/collation:** o banco (`jnk_portal_base`) e todas as tabelas usam
    `utf8mb4` / `utf8mb4_0900_ai_ci` (padrão do MySQL 8). Diferente do SQL
    Server, onde `VARCHAR` não é Unicode e exige `NVARCHAR` à parte, no MySQL
    com `utf8mb4` o `VARCHAR` já é Unicode — **não existe a distinção
    VARCHAR/NVARCHAR aqui**. Um único tipo de texto (`VARCHAR`/`TEXT`) resolve,
    sem risco de corromper acentuação.
*   **Nomenclatura:** tabelas e colunas em `snake_case` minúsculo (ex: `filiais`,
    `usuarios_filiais`), não `PascalCase`. MySQL em Linux é case-sensitive para
    nomes de tabela por padrão (`lower_case_table_names`) — minúsculo evita
    qualquer ambiguidade entre ambientes.
*   `INT IDENTITY(1,1)` → `INT AUTO_INCREMENT`.
*   `BIT` → `BOOLEAN` (alias de `TINYINT(1)` no MySQL).
*   `DATETIME DEFAULT GETDATE()` → `DATETIME DEFAULT CURRENT_TIMESTAMP`. Ver
    seção 9.1 sobre fuso horário — importante em hospedagem cloud.
*   `VARCHAR(MAX)` / `NVARCHAR(MAX)` → `TEXT` (ou `LONGTEXT` para
    `foto_perfil_base64`, que guarda imagem em base64 e pode passar de 64KB).
*   Removido o campo `codigo_filial_totvs` (integração específica de um cliente
    anterior, não aplicável a este projeto). Se uma integração ERP futura
    precisar de um código externo por filial, adicionar a coluna quando esse
    projeto de integração existir de fato.

```sql
-- 1. Tabela de Cadastro de Filiais
CREATE TABLE filiais (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cnpj VARCHAR(18) NOT NULL UNIQUE,
    ativa BOOLEAN DEFAULT TRUE,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2. Tabela Principal de Usuários (Com auditoria de último acesso)
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    foto_perfil_base64 LONGTEXT NULL,
    ativo BOOLEAN DEFAULT TRUE,
    ultimo_acesso_filial_id INT NULL,
    ultimo_acesso_modulo_id INT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ultimo_acesso_filial_id) REFERENCES filiais(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Tabela de Vínculo: Usuários x Filiais (Muitos para Muitos)
CREATE TABLE usuarios_filiais (
    usuario_id INT NOT NULL,
    filial_id INT NOT NULL,
    PRIMARY KEY (usuario_id, filial_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (filial_id) REFERENCES filiais(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Tabela de Preferências de UI do Usuário
CREATE TABLE preferencias_usuario (
    usuario_id INT PRIMARY KEY,
    tema_ui VARCHAR(10) DEFAULT 'LIGHT',
    estilo_botoes VARCHAR(15) DEFAULT 'SOLID',
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 5. Cadastro Geral de Módulos (Aplicativos) do Site
CREATE TABLE modulos_sistema (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(50) NOT NULL,
    chave_modulo VARCHAR(30) UNIQUE NOT NULL,
    icone VARCHAR(50) NOT NULL,
    descricao VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 6. Cadastro de Telas/Menus Pertencentes a Cada Módulo
CREATE TABLE telas_modulo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    modulo_id INT NOT NULL,
    nome_tela VARCHAR(50) NOT NULL,
    rota_tela VARCHAR(100) NOT NULL,
    FOREIGN KEY (modulo_id) REFERENCES modulos_sistema(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 7. Matriz Granular de Permissões (Usuário x Tela)
CREATE TABLE permissoes_usuario (
    usuario_id INT NOT NULL,
    tela_id INT NOT NULL,
    pode_visualizar BOOLEAN DEFAULT TRUE,
    pode_criar BOOLEAN DEFAULT FALSE,
    pode_editar BOOLEAN DEFAULT FALSE,
    pode_deletar BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (usuario_id, tela_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (tela_id) REFERENCES telas_modulo(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 8. Tabela de Notificações / Quadro de Avisos por Filial
CREATE TABLE avisos_plataforma (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filial_id INT NULL, -- Se NULL, o aviso é global para todas as filiais
    titulo VARCHAR(100) NOT NULL,
    mensagem TEXT NOT NULL,
    data_expiracao DATETIME NOT NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (filial_id) REFERENCES filiais(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

*(Diretriz arquitetural: Todas as tabelas de negócio criadas em módulos futuros deverão incluir obrigatoriamente uma coluna `filial_id INT NOT NULL` como chave estrangeira, garantindo o isolamento completo de dados).*

### 3.1. Migrations

Scripts numerados sequenciais em `apps/api/db/NNN_descricao.sql` (ex:
`001_schema.sql`), aplicados via um runner simples em Node (não `sqlcmd` —
isso era específico do SQL Server). Cada script roda dentro de uma
transação quando o DDL do MySQL permitir (DDL no MySQL/InnoDB tem commit
implícito por statement — não é totalmente transacional como no SQL Server;
por isso cada arquivo de migration deve ser pequeno e idempotente sempre que
possível, ex: `CREATE TABLE IF NOT EXISTS`).

---

## 4. Front-End: Interfaces e Fluxo Multi-Filial (`apps/portal`)

### 4.1. Diretrizes de Responsividade, Ergonomia e Resiliência (Desktop vs Tablet)
O front-end deve usar os breakpoints nativos do Tailwind CSS (`md:` e `lg:`). Todos os botões e áreas de clique devem possuir altura mínima de `44px` para uso confortável em telas Touch (Tablets).

#### 4.1.1. Estado Sincronizado Offline (Resiliência de Rede)

*   **Comportamento:** Implementar um hook ou escutador global do status de conectividade do dispositivo via `navigator.onLine` (`useOnlineStatus()`).
*   **Interface:** Se a rede oscilar, a aplicação deve exibir uma barra discreta ou banner fixo de alerta no topo (`"Conexão instável. Suas ações serão sincronizadas ao retornar a rede."`), montado globalmente (visível em qualquer tela, inclusive fora do login).
*   **Persistência:** A sessão completa (token + `usuario`, incluindo `filiaisPermitidas` e `preferencias`) vai para `localStorage` desde o login — cobre a necessidade de manter a lista de filiais e preferências disponíveis offline.
*   **Troca de filial offline — decisão de design:** a troca de filial na Sidebar (seção 4.4) só aplica a mudança **depois** que `POST /api/auth/switch-filial` confirma. Se a chamada falhar por rede (não por erro da API), o pedido fica pendente e é reenviado automaticamente quando o evento `online` dispara — a UI não muda antes da confirmação. Uma troca "otimista" que depois falhasse (ex: acesso à filial revogado nesse meio-tempo) mostraria dados errados na tela por um período; considerado risco maior que o ganho de percepção de velocidade.

#### 4.1.2. Controle de Versão Forçado (Force Update)

*   **Comportamento:** O React deve interceptar a propriedade `versaoSistema` enviada pela API no payload de login.
*   **Ação:** O front-end compara essa string com sua própria variável de ambiente de build local (`import.meta.env.VITE_APP_VERSION`). Se houver divergência, o sistema exibe uma notificação amigável e chama `window.location.reload()` para recarregar limpo.

### 4.2. Fluxo de Login Inteligente e Escolha de Filial

1.  **Etapa 1 (Autenticação):** Validação de e-mail e senha.
2.  **Etapa 2 (Seleção da Filial):** Exibe as filiais permitidas vinculadas à conta do usuário. Se houver apenas uma filial mapeada, avança automaticamente.

### 4.3. Tela Inicial: Painel de Boas-Vindas, Hub de Aplicativos e Quadro de Avisos (`/modules`)

Após definir a filial ativa, o usuário é direcionado para a tela inicial do Portal.
*   **Componente de Mensagem Motivacional:** Card superior em destaque com texto de engajamento dinâmico baseado no horário e nome (Bom dia / Boa tarde / Boa noite + primeiro nome).
    *   *Texto Exemplo:* `"Olá, [Nome do Usuário]! Bem-vindo ao hub operacional. Seu trabalho constrói a nossa eficiência e a nossa segurança. Escolha um dos aplicativos abaixo para iniciar suas atividades com foco e excelência!"`
*   **Hub de Aplicativos (Launcher):** Uma grade (`grid`) responsiva renderizando cartões táteis para cada aplicativo presente em `modulosPermitidos`.
*   **Quadro de Avisos:** Painel dinâmico que consome `GET /api/avisos/ativos` — avisos globais (`filial_id IS NULL`) ou da filial ativa, ainda não expirados. Exige só `authTenant` (qualquer usuário logado vê); não é gated por `requirePermissao` como as telas do Configurador, por não ser uma tela administrativa.
*   **Comportamento de Clique:** Ao clicar em um card, o módulo ativo passa a ser derivado da rota atual (ver seção 4.4) e a Sidebar passa a listar os menus daquele sistema. Se o usuário tiver permissão para apenas um módulo, o sistema pode pular a tela de seleção e ativar o módulo automaticamente — avaliar quando existir mais de um módulo de negócio além do CONFIG.

CRUD de avisos (criar/editar/expirar) fica em `/config/avisos`, tela nova do
módulo CONFIG. `DELETE` ali é exclusão física (diferente de Filiais/Usuários/
Perfis, seção 5): avisos são efêmeros, já têm expiração própria, e nada mais
no schema referencia `avisos_plataforma.id`.

### 4.4. Design Otimizado da Barra Lateral (Sidebar Component)

A Sidebar se adapta ao aplicativo ativo no ecossistema:
*   **Estado Vazio (Sem módulo ativo):** Se o usuário estiver na tela de Boas-Vindas (`/modules`), a Sidebar exibe apenas o Card do Usuário (com o seletor de Filial) e uma mensagem sutil: *"Selecione um aplicativo para iniciar"*. Em tablets, ela fica totalmente oculta nesta fase.
*   **User Profile Card (Com Troca Rápida de Filial SEM Logout):** Exibe o avatar circular e nome do operador. A tag de identificação da filial ativa funciona como um **botão dropdown**. Ao ser clicado, exibe a lista de filiais disponíveis vinculadas ao usuário. Ao selecionar outra filial:
    1.  O React dispara `POST /api/auth/switch-filial`.
    2.  A API valida o vínculo do usuário com a nova filial e reemite um token JWT atualizado com o escopo alterado.
    3.  O React limpa o módulo ativo e as telas ativas da Sidebar, e redireciona o operador para a Home `/modules`, recalculando permissões, mensagens e avisos da nova unidade automaticamente, sem logout.
*   **Módulo ativo:** derivado da rota atual (a Sidebar verifica se o `pathname` começa com a `rotaTela` de alguma tela de `usuario.modulosPermitidos`), não de um estado `moduloAtivoChave` sincronizado à parte — mais simples e nunca fica dessincronizado do que está realmente na tela.
*   **Botão de Alternância de Módulo:** No topo da Sidebar, um botão permanente **"Alternar Aplicativo"** (ícone de grade/home) limpa o módulo ativo e retorna o usuário à tela central de Boas-Vindas.
*   **Responsividade abaixo de `md` (768px):** quando há módulo ativo, a Sidebar vira uma gaveta (`fixed`, com overlay) aberta por um botão de menu (☰); fecha sozinha ao navegar para uma tela.
*   Link **"Sair"** vive no card do usuário na Sidebar.

---

## 5. Configurador (módulo `CONFIG`) — Administração de Filiais e Usuários

O Configurador é um módulo (`modulos_sistema.chave_modulo = 'CONFIG'`) como qualquer
outro que aparecerá no Hub — não é um caso especial na arquitetura. Tem, no mínimo,
duas telas (`telas_modulo`), cada uma com sua própria linha em `permissoes_usuario`:

| Tela | `rota_tela` |
|---|---|
| Filiais | `/config/filiais` |
| Usuários | `/config/usuarios` |

### 5.1. Middleware de permissão granular (`requirePermissao`)

`apps/api/src/middlewares/requirePermissao.ts` — factory `requirePermissao(rotaTela, acao)`
onde `acao` é `"podeVisualizar" | "podeCriar" | "podeEditar" | "podeDeletar"`. Roda depois
de `authTenant` (usa `req.usuario.id`), consulta `permissoes_usuario` join `telas_modulo`
pela `rotaTela`, e responde `403` se a permissão não existir ou a flag da ação for falsa.
Toda rota de CRUD do Configurador usa esse middleware.

### 5.2. API — Filiais (`apps/api/src/routes/filiais.ts`)

| Método | Rota | Permissão exigida |
|---|---|---|
| `GET` | `/api/filiais` | `podeVisualizar` |
| `POST` | `/api/filiais` | `podeCriar` |
| `PUT` | `/api/filiais/:id` | `podeEditar` |
| `DELETE` | `/api/filiais/:id` | `podeDeletar` |

**Decisão de design — `DELETE` não é físico.** Filiais são referenciadas por FK em
`usuarios`, `usuarios_filiais` e `avisos_plataforma` (e, pela diretriz da seção 3, por
toda tabela de negócio futura). Apagar de verdade quebraria histórico e integridade
referencial. `DELETE /api/filiais/:id` executa `UPDATE filiais SET ativa = FALSE` — a
filial some das opções de seleção mas nada é perdido. `PUT` com `ativa: true` reativa.

CNPJ é validado apenas por formato (14 dígitos após remover máscara) — **não** valida
dígito verificador. Considerar adicionar se cadastros incorretos virarem problema real.

### 5.3. API — Usuários (`apps/api/src/routes/usuarios.ts`)

| Método | Rota | Permissão exigida |
|---|---|---|
| `GET` | `/api/usuarios` | `podeVisualizar` |
| `POST` | `/api/usuarios` | `podeCriar` |
| `PUT` | `/api/usuarios/:id` | `podeEditar` |
| `DELETE` | `/api/usuarios/:id` | `podeDeletar` |

Mesma lógica de **soft delete** (`ativo = FALSE`), pelo mesmo motivo (preserva
`ultimo_acesso_*`, `criado_em` para auditoria). Criar/editar usuário grava em
`usuarios`, `usuarios_filiais` e `preferencias_usuario` numa única transação
(`withTransaction`, ver `apps/api/src/config/database.ts` — usar
`pool.getConnection()` + `connection.beginTransaction()`/`commit()`/`rollback()`
do `mysql2/promise`) para não deixar o usuário criado sem filial vinculada em
caso de falha no meio da operação. Senha exige mínimo de 8 caracteres; no `PUT`,
o campo `senha` é opcional — se omitido, a senha atual é mantida.

Atribuição de permissões por tela pela UI é feita via **Perfis de Acesso**
(seção 6) — `permissoes_usuario` (direto por usuário) existe só como exceção pontual.

### 5.4. Front-end (`apps/portal/src/pages/config/`)

`FiliaisPage.tsx`, `UsuariosPage.tsx`, `PerfisPage.tsx`, `PerfilPermissoesPage.tsx`,
`LogsAcessoPage.tsx`, `ParametrosPage.tsx` — cada uma é só o conteúdo da tela;
a navegação entre elas (e a partir de `/modules`) é toda feita pela Sidebar
global (seção 4.4), não por uma nav própria do Configurador.

---

## 6. Perfis de Acesso (RBAC reutilizável)

Além da atribuição direta usuário↔tela (`permissoes_usuario`, seção 3), existe um
segundo nível reutilizável: **Perfis** (ex: "Administrador", "Operador"), cada um
com sua própria matriz de permissões por tela, atribuíveis a N usuários.

```sql
CREATE TABLE perfis (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(50) NOT NULL UNIQUE,
    descricao VARCHAR(255) NULL,
    ativo BOOLEAN DEFAULT TRUE,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE perfis_telas (
    perfil_id INT NOT NULL,
    tela_id INT NOT NULL,
    pode_visualizar BOOLEAN DEFAULT TRUE,
    pode_criar BOOLEAN DEFAULT FALSE,
    pode_editar BOOLEAN DEFAULT FALSE,
    pode_deletar BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (perfil_id, tela_id),
    FOREIGN KEY (perfil_id) REFERENCES perfis(id) ON DELETE CASCADE,
    FOREIGN KEY (tela_id) REFERENCES telas_modulo(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE usuarios_perfis (
    usuario_id INT NOT NULL,
    perfil_id INT NOT NULL,
    PRIMARY KEY (usuario_id, perfil_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (perfil_id) REFERENCES perfis(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

**Regra de resolução da permissão efetiva** (`requirePermissao` e
`buscarModulosPermitidos` em `auth.ts` devem aplicar a mesma regra): é a **união (OR)**
entre (a) atribuições diretas em `permissoes_usuario` e (b) as de todos os Perfis
**ativos** vinculados ao usuário via `usuarios_perfis`. Se qualquer uma das duas
fontes conceder uma ação, ela é permitida — nunca a interseção. Um perfil
desativado (`ativo = FALSE`) para de contar imediatamente, sem precisar desvincular
usuários dele.

**Cuidado ao implementar esta regra:** ela é usada em dois lugares
(`requirePermissao.ts` para gate de rotas, e `auth.ts#buscarModulosPermitidos`
para montar o Hub no login). Mantenha as duas queries espelhadas — divergência
entre elas tende a se manifestar como "usuário tem permissão via perfil mas não
aparece no Hub" (ou vice-versa), um bug sutil de detectar em produção.

`DELETE /api/perfis/:id` é soft-delete (`ativo = FALSE`), mesmo raciocínio de Filiais/
Usuários. `PUT /api/perfis/:id/telas` substitui a matriz inteira do perfil (delete +
insert em transação) a partir de `{ telas: [{ telaId, podeVisualizar, ... }] }`.

Front-end: `PerfisPage.tsx` (CRUD do perfil) + `PerfilPermissoesPage.tsx`
(`/config/perfis/:id`, matriz de checkboxes por módulo/tela). `UsuariosPage.tsx`
tem um segundo grupo de checkboxes ("Perfis de acesso") ao lado do de Filiais.

Seed local sugerido: perfil "Administrador" com acesso total às telas do CONFIG,
vinculado ao usuário de teste.

---

## 7. Log de Acessos

Registra login, troca de filial e cada acesso bem-sucedido a uma tela (para
responder "quais aplicativos e menus o usuário acessou").

```sql
CREATE TABLE logs_acesso (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    filial_id INT NULL,
    tela_id INT NULL, -- NULL para eventos sem tela específica (ex: LOGIN)
    tipo_evento VARCHAR(20) NOT NULL, -- 'LOGIN', 'SWITCH_FILIAL', 'ACESSO_TELA'
    ip_origem VARCHAR(45) NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (filial_id) REFERENCES filiais(id),
    FOREIGN KEY (tela_id) REFERENCES telas_modulo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

**Decisão de design — sem `ON DELETE CASCADE`.** Diferente das outras FKs do
schema, as de `logs_acesso` são propositalmente sem cascade: é uma trilha de
auditoria, então mesmo num cenário hipotético de exclusão física de um usuário
(que a aplicação nunca faz — sempre soft-delete), o histórico não deveria
desaparecer junto.

**Onde gravar:**
- `POST /api/auth/login` → evento `LOGIN` (fire-and-forget, não bloqueia a resposta).
- `POST /api/auth/switch-filial` → evento `SWITCH_FILIAL`.
- `requirePermissao(rotaTela, "podeVisualizar")`, toda vez que concede acesso → evento
  `ACESSO_TELA`. O log deve refletir acesso real e permitido, não navegação
  client-side (que poderia ser inconsistente).

`apps/api/src/services/logAcesso.ts` deve expor `registrarAcesso()` — nunca
`await`ada pelos chamadores; erros de gravação do log só vão pro console do
servidor e nunca derrubam a requisição principal.

`GET /api/logs-acesso` (permissão `podeVisualizar` na tela `/config/logs`) retorna
os 200 registros mais recentes, com filtro opcional `?usuarioId=`. Front-end:
`LogsAcessoPage.tsx`, com um `<select>` de usuário para filtrar.

### 7.1. Campo `whatsapp` no cadastro de usuário

`usuarios.whatsapp VARCHAR(20) NULL`. Preparação para integração futura de
envio de mensagens/alertas/arquivos via WhatsApp e Telegram (fora do escopo
deste spec). Sem validação de formato além de aceitar string — quando a
integração real for definida, validar conforme o formato exigido pelo provedor
escolhido (E.164 provavelmente, para WhatsApp Business API).

---

## 8. Parâmetros do Sistema

Tela de configuração para dados que não pertencem ao código (credenciais SMTP,
e futuramente tokens de API de WhatsApp/Telegram), organizados por categoria
num modelo chave/valor genérico:

```sql
CREATE TABLE parametros_sistema (
    id INT AUTO_INCREMENT PRIMARY KEY,
    categoria VARCHAR(30) NOT NULL, -- 'EMAIL', 'WHATSAPP', 'TELEGRAM'
    chave VARCHAR(50) NOT NULL,
    valor TEXT NULL,
    sensivel BOOLEAN DEFAULT FALSE,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_parametros_categoria_chave UNIQUE (categoria, chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

Os campos válidos por categoria devem ser uma lista fechada em código
(`apps/api/src/services/parametros.ts#DEFINICAO_CAMPOS`), não livres — evita
gravar chaves arbitrárias. Cada campo é marcado `sensivel: true/false`.

**Decisão de design — criptografia de campos sensíveis.** Senha SMTP e
(futuramente) tokens de API nunca devem ser gravados em texto puro: `valor` é
criptografado com AES-256-GCM (`apps/api/src/services/crypto.ts`) usando a
chave em `PARAMETROS_ENCRYPTION_KEY` (32 bytes, hex, `.env` — nunca no
repositório). A API também **nunca deve devolver um valor sensível já salvo**
em texto puro pelo `GET` — só um booleano `definido`. Editar outros campos sem
mexer no sensível preserva o valor existente (campo vazio = "não alterar",
não "apagar").

`obterConfigEmail()` deve ser o ponto de leitura interno (descriptografa e
monta o objeto pronto para um client SMTP) — usado pelo fluxo de "Esqueci a
Senha" (seção 9).

Front-end: `ParametrosPage.tsx`, abas por categoria. Campo sensível mostra
"já configurado" em vez do valor, com placeholder "deixe em branco para
manter".

---

## 9. Esqueci a Senha

```sql
CREATE TABLE tokens_reset_senha (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 em hex
    expira_em DATETIME NOT NULL,
    usado_em DATETIME NULL,
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

Fluxo:

1. `POST /api/auth/esqueci-senha { email }` — **sempre** responde a mesma
   mensagem genérica ("se esse e-mail existir, você receberá um link"),
   exista ou não o e-mail, e mesmo que o envio do e-mail falhe (ex: SMTP não
   configurado em Parâmetros) — nunca vaza se um e-mail está cadastrado.
   Se o usuário existe e está ativo: gera um token aleatório de 32 bytes,
   grava só o **hash SHA-256** dele (`token_hash`) com expiração de 1h, e
   envia por e-mail um link `${FRONTEND_URL}/redefinir-senha?token=<token cru>`.
   O token em texto puro nunca é persistido — só existe no e-mail.
2. `POST /api/auth/redefinir-senha { token, novaSenha }` — hasheia o token
   recebido e busca por igualdade exata. Rejeita se não encontrado, já usado,
   ou expirado. Ao redefinir com sucesso, marca **todos** os tokens
   pendentes daquele usuário como usados (não só o que foi apresentado) —
   evita que um link antigo esquecido aberto em outra aba ainda funcione.

Front-end: `EsqueciSenhaPage.tsx` (só pede e-mail) e `RedefinirSenhaPage.tsx`
(lê `?token=` da URL, pede nova senha + confirmação). Link "Esqueci minha
senha" na tela de login.

### 9.1. Fuso horário — cuidado obrigatório com MySQL em hospedagem cloud

O spec original (SQL Server on-premise) só funcionava corretamente porque API
e banco rodavam no mesmo servidor físico/fuso horário. Aqui isso **não pode
ser assumido**: o MySQL gerenciado da DigitalOcean e a API (droplet/App
Platform) podem estar em regiões diferentes, e clusters gerenciados
tipicamente rodam com fuso do sistema em **UTC**. Para evitar o mesmo tipo de
bug de comparação de datas que esse padrão de projeto já causou antes num
provedor diferente:

*   **Forçar UTC na conexão.** No `mysql2`, configurar `timezone: 'Z'` no
    `createPool(...)` (`apps/api/src/config/database.ts`). Isso faz o driver
    tratar toda leitura/escrita de `DATETIME` como UTC, convertendo
    corretamente para/de `Date` do JavaScript (que é sempre UTC internamente).
*   **Usar `DATETIME` (não `TIMESTAMP`)** para as colunas deste schema.
    `TIMESTAMP` no MySQL faz conversão implícita de fuso baseada na variável
    de sessão `time_zone`, o que adiciona uma segunda camada de conversão
    além da do driver — mais uma fonte potencial do mesmo tipo de bug.
    `DATETIME` grava o valor literal, sem conversão do servidor; com o driver
    forçado a tratar tudo como UTC (`timezone: 'Z'`) e `DEFAULT
    CURRENT_TIMESTAMP` gravando a hora UTC do cluster, o valor lido pelo
    Node sempre corresponde exatamente ao que está no banco.
*   **Testar a expiração de token** (seção 9) explicitamente comparando um
    `expira_em` recém-criado contra `new Date()` antes de considerar essa
    parte pronta — é o ponto onde esse tipo de bug de fuso horário mais
    facilmente aparece.

---

## 10. Multi-Tenant e Autenticação Plugável (Design — não implementado)

> 📝 **Em design.** Esta seção documenta decisões e o formato pretendido,
> para orientar quando isso for implementado — não é código ainda.

Motivação: reaproveitar esta infraestrutura para múltiplos clientes, alguns
dos quais vão querer login via Microsoft Entra ID (Azure AD) em vez de
usuário/senha local — mas isso deve ser **opcional por cliente**, não algo
embutido de forma obrigatória.

### 10.1. Modelo de reaproveitamento: deploy por cliente, não SaaS multi-tenant compartilhado

Duas arquiteturas possíveis, e é importante não confundir:

1. **Um deploy por cliente** (recomendado): cada cliente tem seu próprio banco
   (`jnk_portal_base` ou equivalente) e sua própria instância da API/portal, só
   reaproveitando o mesmo código-fonte. Isolamento total entre clientes é
   automático (bancos diferentes). É basicamente o que já existe hoje, sem
   mudança estrutural.
2. **SaaS multi-tenant compartilhado**: uma única instância/banco atendendo
   vários clientes simultaneamente, com uma tabela `clientes`/`tenants` e
   `filial_id`-like isolamento por cliente em toda tabela. Isso é uma mudança
   arquitetural grande (toda query precisaria filtrar por tenant, risco de
   vazamento de dados entre clientes se uma única query esquecer o filtro) e
   nada até agora indicou que seja necessário.

**Recomendação:** seguir com (1) — deploy por cliente — a menos que surja um
motivo concreto de negócio para (2). Esta seção assume (1).

### 10.2. Login via Azure AD (Microsoft Entra ID), não LDAP direto

Recomendado usar **OIDC contra o Entra ID**, não bind LDAP contra um AD
on-premise. Motivo: a maioria das empresas hoje usa M365/Entra ID (mesmo com
AD local em modo híbrido por trás), e OIDC funciona por redirect HTTPS
padrão — não exige que o servidor da API tenha acesso de rede direto ao
domain controller do cliente (LDAP puro exigiria VPN/linha dedicada, o que
inviabiliza reaproveitar isso facilmente entre clientes diferentes). LDAP
direto fica como opção futura só se algum cliente tiver AD 100% on-premise
sem Entra ID.

### 10.3. Mudanças de schema previstas

```sql
ALTER TABLE usuarios MODIFY COLUMN senha_hash VARCHAR(255) NULL; -- usuário só-SSO não tem senha local
ALTER TABLE usuarios ADD COLUMN origem_autenticacao VARCHAR(20) NOT NULL DEFAULT 'LOCAL'; -- 'LOCAL' | 'AZURE_AD'
ALTER TABLE usuarios ADD COLUMN identificador_externo VARCHAR(255) NULL; -- claim `oid` do token do Entra ID
```

`senha_hash` vira opcional porque um usuário `AZURE_AD` não tem senha
gerenciada por nós. O login local (`POST /api/auth/login`) deve rejeitar
explicitamente usuários com `origem_autenticacao != 'LOCAL'` (mensagem
"esta conta usa login corporativo") em vez de simplesmente falhar a
comparação de bcrypt contra um hash nulo.

### 10.4. Fluxo de login OIDC (esboço)

1. `GET /api/auth/azure-ad/login` — redireciona para o endpoint de
   autorização do Entra ID (tenant do cliente).
2. Usuário autentica no lado da Microsoft.
3. `GET /api/auth/azure-ad/callback?code=...` — troca o `code` pelo
   `id_token`, valida assinatura/`aud`/`iss`, extrai `oid` (identificador
   estável) e `email` do claim.
4. Busca `usuarios` por `identificador_externo = oid`. Se não achar, tenta
   por `email` (para linkar uma conta local já existente ao SSO). Se ainda
   não achar: **provisionamento just-in-time** — cria o usuário
   (`origem_autenticacao='AZURE_AD'`, ativo, sem filiais/perfis ainda) e
   segue o fluxo normal (que já barra login sem filial vinculada — um
   admin precisa entrar no Configurador e conceder acesso depois).
5. Emite o mesmo JWT interno de sempre (`usuarioId`, `filialAtivaId`) — dali
   pra frente, nada mais no sistema precisa saber que o login foi via SSO.

### 10.5. Como fica "opcional por cliente"

Variáveis de ambiente por deploy: `AZURE_AD_TENANT_ID`,
`AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_REDIRECT_URI`. Se
não configuradas, as rotas `/api/auth/azure-ad/*` ficam inativas e o
front-end nem mostra o botão "Entrar com Microsoft" — o cliente que não
precisa disso não vê diferença nenhuma. Um endpoint público leve
(`GET /api/auth/config` → `{ azureAdHabilitado: boolean }`) informa o
front-end se deve exibir o botão, sem expor nenhum segredo.

Login local continua existindo em paralelo por padrão (não é
substituído) — decidir se algum cliente específico quer desativá-lo
totalmente é uma decisão de produto para quando isso for implementado, não
algo a resolver agora.

---
