# Módulo de Estoques

## 1. Premissas

### 1.1. Relatório da Curva ABC de Estoque
- Baseado na tabela sysemp_estoque_fisico, gerar uma tela onde o usuário poderá consultar e gerar um relatório da curva abc do estoque. A classe que deveremos utilizar é 70/20/10.
- ![Modelo da COnsulta/Relatório](image.png)
- Possibilitar o usuário filtrar: Empresa e Marca

## 2. Consulta de Saldo de Estoque

**Rota:** `/estoque/saldos` · **API:** `/api/estoque/saldos` ·
**Seed:** `026_estoque_saldos_seed.sql`

Consulta direta de `sysemp_estoque_fisico`, a tabela alimentada pela fila da
SysEmp (ver spec de Integração, seção 3.3). Colunas: empresa, código e
descrição do produto, marca, os oito depósitos (disponível, principal,
reservada, importação, avarias, loja, assistência e armazém externo), custo
de formação, custo médio e data da última integração (`synced_at`).

Filtros de empresa, marca, busca (código, descrição, código auxiliar ou
código de barras) e "só com saldo". Paginada em 50, ordenável por qualquer
coluna e exportável para Excel.

Decisões que a distinguem da Curva ABC, que lê a mesma tabela:

- **Mostra linha zerada.** A Curva ABC filtra `saldo_disponivel > 0` porque é
  análise — item sem saldo não classifica. Esta é consulta: mostra a linha
  como ela está, saldo zero ou negativo inclusive, e deixa o corte como
  opção do usuário ("só com saldo").
- **"Só com saldo" soma os oito depósitos com `COALESCE`**, não apenas
  `saldo_disponivel`. Depósito não usado vem `NULL`, e um único `NULL` numa
  soma anularia o total inteiro, escondendo item que tem saldo em outro
  depósito.
- **Nunca lista deletado.** `deleted = FALSE` é a primeira condição do
  `WHERE`, antes até do escopo, e não é opção de tela. O soft delete vem do
  evento `acao='D'` da fila.

**Escopo.** Como toda consulta sobre dado do ERP, restringe às empresas
vinculadas ao usuário, por `condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', …)` —
a tabela é de uma origem só e não tem coluna de origem, então ter a empresa 4
do KPL não pode liberar a 4 da SysEmp, que é outra companhia. O filtro de
empresa da tela **soma** ao escopo em vez de substituí-lo: pedir empresa fora
do escopo devolve vazio, nunca concede. Escopo vazio vira `1 = 0` — falha
fechada. A exportação para Excel passa pelo mesmo caminho da consulta, então
não é porta lateral para o que a tela não mostraria.

Vale lembrar a distinção que o projeto inteiro mantém: **empresa não é
filial**. O seletor da barra lateral é filial (unidade organizacional); o
recorte destas consultas é empresa do ERP, vinda de `usuarios_empresas`. Ver
`Specs/spec_modulo_faturamento.md`, seção 10.

## 3. Fechamento de Custo

### 3.1. O que é, e de onde veio

Fechamento de Custo é a apuração mensal do valor do estoque por **grupo de
empresa** (JNK, CNK2, NK2 — `sysemp_empresa.grupo_empresa`). Não vem de
integração: nasce de planilhas que a contabilidade e o estoque produzem uma
vez por mês e sobem no portal. O produto final é a **Lista de Inventário**,
peça que a contabilidade entrega para fora.

É a migração de um submenu do portal PHP anterior (`jnakao-digital-ocean`,
`src/Telas.php`, submenu "Fechamento Mensal"), seis telas que já rodaram em
produção. As regras abaixo não são projeto novo: são o comportamento
validado lá, reescrito nos padrões deste monorepo. O que mudou de propósito
está na seção 3.11.

### 3.2. As seis telas

**Migrations:** `029_estoque_fechamento_schema.sql` (tabelas),
`030_estoque_fechamento_parametros.sql` (parâmetros),
`031_estoque_fechamento_seed.sql` (linhas em `telas_modulo`).

| Tela | `rota_tela` | Ação exigida | Router |
|---|---|---|---|
| Importar Fechamento Mensal | `/estoque/fechamento/importar` | `podeCriar` | `estoqueFechamentoImportar.ts` |
| Importar Estoque FULL | `/estoque/fechamento/estoque-full` | `podeCriar` | `estoqueFechamentoImportar.ts` |
| Importar Inventário Físico | `/estoque/fechamento/inventario` | `podeCriar` | `estoqueFechamentoImportar.ts` |
| Cálculo de Custo de Fechamento | `/estoque/fechamento/custo` | `podeCriar` para calcular, `podeVisualizar` para a grade e as exportações | `estoqueFechamentoCusto.ts` |
| Comparar Inventário × Fechamento | `/estoque/fechamento/comparativo` | `podeVisualizar` | `estoqueFechamentoComparativo.ts` |
| Logs de Importação | `/estoque/fechamento/logs` | `podeVisualizar` | `estoqueImportacaoLogs.ts` |

Um router serve mais de uma tela quando elas compartilham o serviço, mas
**cada endpoint declara a `ROTA` da sua própria tela** — permissão de
importar fechamento não libera importar inventário.

Calcular custo pede `podeCriar` porque grava tabela: recalcular um par
(período, grupo) apaga o cálculo anterior. Não é consulta.

Como sempre, o seed em `telas_modulo` **não concede permissão a ninguém**,
nem a administrador. Liberar é passo manual em Configurador → Perfis.

### 3.3. Esquema — `029_estoque_fechamento_schema.sql`

Cinco tabelas. Sem o prefixo `tb_` herdado do portal PHP, com o prefixo do
módulo:

| Tabela | Conteúdo | Chave de upsert |
|---|---|---|
| `estoque_fechamento_mensal` | fechamento contábil por produto, com custo próprio | `(periodo, empresa, id_produto)` |
| `estoque_full_importado` | saldo por conta/canal (Amazon, Shopee, Axado, lojas) | `(periodo, id_empresa, conta, tipo_saldo, cd_produto)` |
| `estoque_inventario_fisico` | contagem física, até cinco rodadas mais a final | `(periodo, id_empresa, cd_produto, almox)` |
| `estoque_custo_fechamento` | resultado do cálculo | sem chave: delete e insert por período/grupo |
| `estoque_importacao_log` | uma linha por execução de importação | sem chave |

`periodo` é sempre `DATE` no primeiro dia do mês, derivado da coluna
`MM/AAAA` da planilha.

Três chaves de upsert merecem justificativa, porque parecem largas demais:

- **Estoque FULL leva `conta` e `tipo_saldo` na chave** porque o mesmo
  produto aparece mais de uma vez no mesmo período e empresa com
  classificações diferentes — "Aptas para venda" e "Extraviadas" são linhas
  distintas, não uma sobrescrevendo a outra.
- **Inventário físico leva `almox`** pela mesma razão: PRINCIPAL e AVARIAS
  contam o mesmo produto separadamente.
- **Fechamento não leva almoxarifado nenhum** porque a planilha contábil não
  distingue — é isso que obriga o comparativo da seção 3.9 a somar os
  almoxarifados antes de comparar.

Duas mudanças em relação ao esquema antigo:

- `estoque_fechamento_mensal` ganha **`id_empresa INT NULL`** ao lado do
  `empresa VARCHAR` que veio da planilha. No portal PHP a planilha só trazia
  a razão social, e o cruzamento com o grupo era feito por **nome exato**
  contra `tb_empresas.razao_social`, refeito em dois lugares diferentes
  (cálculo e comparativo). Aqui a resolução acontece **uma vez, na
  importação**: grava-se o `id_empresa` e o texto original fica como
  auditoria do que a planilha dizia. Os joins passam a ser por id. Razão
  social que não casa com nenhuma empresa entra com `id_empresa` nulo e é
  contada no log — a linha não se perde.
- `estoque_importacao_log` ganha **`usuario_id`** com FK para `usuarios`, no
  lugar do `usuario VARCHAR` solto do antigo.

`estoque_custo_fechamento` guarda `data_calculo_custo` e recebe índice
`(grupo_empresa, codigo_auxiliar, periodo)`. Esse índice não serve a nenhuma
tela desta entrega: serve à Visão de Margem (seção 3.13), que consulta o
"custo vigente" — o fechamento mais recente até o fim de um período. Custa
uma linha agora e uma migration depois.

Datas de importação e de execução são gravadas no relógio de Brasília, como
manda a migration `024`.

### 3.4. Leitura de planilha

`services/planilha.ts` lê `.xlsx` com **exceljs** (já dependência da API,
usada nas exportações) a partir do buffer do multer. Substitui o
`src/XlsxReader.php` caseiro do portal antigo, que existia só porque aquele
projeto não tinha biblioteca de planilha nenhuma.

O cabeçalho é mapeado **por nome, não por posição** — comportamento herdado
e deliberado: reordenar colunas na planilha não pode quebrar a importação.
Coluna esperada que não aparece derruba a importação inteira antes de gravar
qualquer linha, com a mensagem nomeando o que faltou.

**Limite de 25MB** no multer. O teto de 8MB das fotos de equipamento de TI
não serve: o modelo de inventário físico usado em produção
(`EstoqueFinal_NK2_202608_V01.xlsx`) tem 9,4MB.

Colunas esperadas, por planilha:

- **Fechamento Mensal:** `EMPRESA`, `ID Produto`, `Código Auxiliar`,
  `Descrição`, `NCM`, `Un`, `Marca`, `Estoque`, `Custo`, `Total`,
  `CST Venda`, `Mês/Ano`.
- **Estoque FULL:** `ID_EMPRESA`, `CONTA`, `PERIODO`, `TIPO_SALDO`,
  `CD_PRODUTO`, `DC_PRODUTO`, `QTDE`.
- **Inventário Físico:** `ID_EMPRESA`, `PERIODO`, `CD_PRODUTO`,
  `DC_PRODUTO`, `MARCA`, `ALMOX`, `CONTAGEM_1` a `CONTAGEM_5`,
  `CONTAGEM_FINAL`, `SALDO_SYSEMP`, `DIVERGENCIA`, `ANALISE`, `ACAO`.

`DC_PRODUTO` é exigida no cabeçalho mas **não é gravada**: a descrição de
referência é a do cadastro (`sysemp_produto`), não a que alguém digitou na
planilha.

`TIPO_SALDO` vazio ou `-` vira `Disponível para Faturamento` — é o que a
planilha significa quando não classifica.

**Linha que não bate com o cadastro é importada assim mesmo**, marcada com
`produto_encontrado = 0` ou `empresa_encontrada = 0`. A informação de
estoque e custo continua válida ainda que o produto não esteja sincronizado,
e o log conta quantas foram, para quem quiser investigar. Descartar seria
perder dado contábil por um problema de cadastro.

Linha sem chave (empresa, produto ou período inválido) é ignorada e listada
com o número da linha na planilha e o motivo.

A gravação de uma importação roda inteira dentro de `withTransaction`, em
lotes: ou a planilha entra toda, ou não entra nenhuma linha.

### 3.5. Cálculo de custo — a regra

Junta duas origens em `estoque_custo_fechamento`, distinguidas pela coluna
`origem`:

- **`FECHAMENTO`** — cópia direta de `estoque_fechamento_mensal`. Já tem
  custo próprio: `vu_custo_estoque` recebe o custo da planilha e
  `vu_custo_venda` fica nulo.
- **`ESTOQUE_FULL`** — cópia de `estoque_full_importado`, que só tem
  quantidade, **valorizada**: o custo unitário vem do Fechamento do mesmo
  produto e período, de qualquer empresa (`vu_custo_estoque`). Não havendo
  custo, ou sendo ele zero, cai para um percentual do preço de venda
  (`vu_custo_venda`) — ver seção 3.7.

O Estoque FULL guarda `cd_produto`, não `id_produto`: para achar o custo do
Fechamento é preciso resolver `cd_produto` contra
`sysemp_produto.codigo_auxiliar` primeiro. Produto que não resolve não tem
como ser valorizado por nenhum dos dois caminhos, e entra sem custo. É daí
que sai também a descrição, marca, unidade e NCM da linha `ESTOQUE_FULL`, que
a planilha não traz.

`vu_custo` é o que foi de fato adotado, e `valor_custo_total` é
`qtde × vu_custo`. Produto sem custo e sem preço de venda entra com custo
nulo e é contado como "sem custo" no resumo — não vira zero disfarçado.

A regra de valorização mora numa **função pura**, `valorizarLinhaFull`,
separada da persistência. É a única parte com risco contábil de verdade, e é
onde os testes se concentram.

**Recalcular um par (período, grupo) apaga o cálculo anterior e regrava.**
Não há histórico de re-execuções, só `data_calculo_custo` da última. Isso é
intencional: o cálculo é derivado das planilhas, e o que vale é o estado
atual delas.

### 3.6. Escopo: o seletor filtra, o cálculo é integral

Esta é a exceção do módulo ao padrão que o resto do portal segue, e por isso
está escrita aqui em vez de subentendida no código.

`buscarGruposPermitidos()` lista apenas os grupos que tenham ao menos uma
empresa no escopo SysEmp do usuário. Escopo vazio devolve lista vazia —
falha fechada, como em toda consulta de ERP. Pedir um grupo fora dessa lista
devolve 403.

Mas, **autorizado o grupo, o cálculo varre todas as empresas dele**, não só
as que estão no escopo de quem clicou. A Lista de Inventário é peça contábil
entregue para fora: se o recorte do usuário afetasse o resultado, dois
usuários gerariam listas diferentes para o mesmo grupo e período, e a
diferença passaria despercebida — os totais parecem plausíveis nos dois
casos.

Quem não pode ver um grupo não abre a tela dele; quem pode, vê o grupo
inteiro. Não "consertar" isso aplicando o escopo dentro do cálculo.

As três telas de importação são gateadas **por permissão, e não por
escopo**: a planilha traz várias empresas por natureza, e importar é
operação administrativa, não consulta.

### 3.7. Parâmetros configuráveis

Categoria `ESTOQUE` em `DEFINICAO_CAMPOS` (`services/parametros.ts`) e no
tipo `CategoriaParametro` de `packages/shared`, com dois campos não
sensíveis, seedados em `030` com os valores que o portal antigo tinha fixos
no código:

| Chave | Valor inicial | Significado |
|---|---|---|
| `FECHAMENTO_PERCENTUAL_CUSTO_VENDA` | `50` | percentual do preço de venda usado quando não há custo de estoque |
| `FECHAMENTO_ID_TABELA_PRECO` | `1` | `sysemp_preco.id_tb_preco` da tabela consultada (LUCRO REAL) |

O percentual é **percentual mesmo**: `preço × percentual / 100`. Com `50` o
resultado é idêntico ao `preco / 2` que o portal antigo fazia fixo no código.
Faixa aceita: maior que 0 e até 100.

Editáveis em Configurador → Parâmetros. O resumo do cálculo exibe o
percentual vigente ("usou 50% do preço de venda") lendo o parâmetro, e não um
literal na tela.

**Parâmetro ausente, não numérico ou fora de faixa aborta o cálculo** com
erro nomeando a chave. Não há default silencioso: um percentual errado
produz um custo errado que ninguém questiona, porque o número continua
parecendo razoável.

### 3.8. Cálculo — grade e exportações

A grade é paginada em 50, como as demais telas do módulo, com o total de
registros e o **custo total geral somado direto no banco** — nunca a soma da
página. Essa distinção derrubou um número real no portal antigo, onde o
limite da grade chegou a cortar linha do total exibido.

Duas saídas:

- **Exportação da grade**, com todas as colunas do cálculo.
- **Lista de Inventário**, formato fixo para a contabilidade:
  `CodigoProduto`, `NomeProduto`, `UnidadeMedida`, `NCM`, `DataFechamento`,
  `Quantidade`, `ValorUnitario`, `ValorTotal`, ordenada por código. Sai
  sempre de uma consulta nova, sem limite, e nunca da página carregada.
  `DataFechamento` é o último dia do mês do período.

Nas duas, **código do produto e NCM saem formatados como texto**. Código só
com dígitos perde zero à esquerda se o Excel o tratar como número — `0012`
vira `12`, e o arquivo chega quebrado na contabilidade.

### 3.9. Comparar Inventário × Fechamento

Tela só de leitura, sem tabela própria: calcula na hora a partir das duas
importações.

Junta `estoque_fechamento_mensal.estoque` (quantidade do livro) com
`estoque_inventario_fisico.contagem_final` (quantidade contada), pela chave
`(id_empresa, código do produto)`. A contagem é **somada entre
almoxarifados** antes de comparar, porque o Fechamento não distingue
almoxarifado (seção 3.3).

`divergencia = quantidade do inventário − quantidade do fechamento`, mesmo
sinal da coluna `DIVERGENCIA` da planilha: positivo significa contagem
física maior que o livro. O valor da divergência usa o custo unitário do
Fechamento, a mesma fonte de custo da origem `FECHAMENTO` do cálculo; sem
custo, o valor fica em branco em vez de zero.

Filtro de modo: todos os itens, ou só os que divergem.

### 3.10. Logs de importação

Histórico de `estoque_importacao_log`: tipo (`fechamento_estoque`,
`estoque_full`, `inventario_fisico`), arquivo, período, linhas processadas,
inseridas, atualizadas, ignoradas, produtos e empresas não encontrados,
custo total, quem executou e quando. Filtrável por tipo.

É o equivalente do Painel de Integração para upload de arquivo: sem ele, uma
importação parcial só aparece semanas depois, num total que não fecha.

### 3.11. Diferenças deliberadas em relação ao portal PHP

- **Grade paginada em 50**, no lugar do `LIMIT 20000` do antigo. As
  exportações continuam completas.
- **Lista de Inventário em `.xlsx` de verdade** via exceljs, no lugar do HTML
  servido com `Content-Type: application/vnd.ms-excel` e extensão `.xls` que
  o antigo emitia.
- **`id_empresa` resolvido na importação**, acabando com o casamento por
  razão social exata refeito em cada tela (seção 3.3).
- **Percentual e tabela de preço parametrizados** (seção 3.7), antes fixos no
  código.
- **Escopo de empresas no seletor de grupo** (seção 3.6). O portal antigo não
  tinha escopo por usuário.

### 3.12. Carga do histórico

`apps/api/src/scripts/migrarFechamentoLegado.ts`, exposto como
`npm run migracao:fechamento --workspace=apps/api`.

Os dois bancos são clusters diferentes em produção, então o script abre um
segundo pool para o banco antigo, lido de `LEGADO_DB_HOST`,
`LEGADO_DB_PORT`, `LEGADO_DB_USER`, `LEGADO_DB_PASSWORD` e `LEGADO_DB_NAME`,
passadas na execução. Nenhuma credencial no repositório.

Copia as cinco tabelas em lotes usando o **mesmo upsert das importações** —
reexecutar não duplica. Resolve `id_empresa` do fechamento na passagem, como
a importação faz.

Opções: `--periodo=AAAA-MM` para carga parcial e `--dry-run`, que não grava
nada e relata contagens por tabela mais **quantas chaves não casam com
`sysemp_produto` e `sysemp_empresa` no destino**. `id_produto` e `id_empresa`
vêm da SysEmp nos dois bancos e deveriam coincidir; o `--dry-run` existe para
confirmar isso antes de gravar, em vez de descobrir depois.

**A carga só pode rodar depois de a sincronização da SysEmp ter populado
`sysemp_produto` e `sysemp_empresa` no destino.** Rodar antes não dá erro —
é pior: grava tudo com `produto_encontrado = FALSE`, `empresa_encontrada =
FALSE` e `id_empresa` nulo, e o fechamento fica sem vínculo com grupo
nenhum, invisível no seletor da tela de cálculo. Foi o que o `--dry-run`
acusou num banco de desenvolvimento sem sincronização: 100% de órfãos.
Reexecutar a carga depois da sincronização corrige os marcadores, porque o
upsert os recalcula.

Senha vazia é configuração válida (root sem senha num MySQL local), então
`LEGADO_DB_PASSWORD` exige a variável **definida**, não preenchida — as
demais exigem valor.

### 3.13. Fora de escopo

A **Visão de Margem** do portal antigo (`dash/margem.php`,
`spec_visaomargem.md`) consome `tb_calculo_custo_fechamento` e não entra
nesta entrega. Quando entrar, é relatório de venda: pertence ao módulo
Faturamento, não a este. O índice citado na seção 3.3 é o que esta entrega
deixa preparado para ela.

### 3.14. Testes

Vitest ao lado do código, escritos antes da implementação:

- **Valorização** (`estoqueCustoFechamento.test.ts`): usa o custo do
  fechamento quando existe e é positivo; cai no percentual do preço de venda
  quando o custo é zero, nulo ou o produto não foi encontrado; fica sem custo
  quando também não há preço; quantidade nula não vira zero.
- **Leitura de planilha** (`planilha.test.ts`): cabeçalho fora de ordem
  funciona; coluna faltando derruba a importação nomeando a coluna; `MM/AAAA`
  inválido ignora a linha com o número certo; célula numérica que o Excel
  entrega como número, e não como texto, é lida igual.
- **Grupos e escopo** (`estoqueFechamentoGrupos.test.ts`): escopo vazio
  devolve lista vazia; grupo fora do escopo é recusado; grupo autorizado
  devolve todas as empresas dele, inclusive as fora do escopo do usuário
  (seção 3.6).
- **Comparativo** (`estoqueFechamentoComparativo.test.ts`): soma de
  almoxarifados antes de comparar; sinal da divergência; item que existe só
  no inventário e item que existe só no fechamento.
- **Parâmetros** (`estoqueFechamentoParametros.test.ts`): ausente, não
  numérico, zero, negativo e acima de 100 abortam nomeando a chave.
- **Extração de cada planilha** (`estoqueFechamentoMensal.test.ts`,
  `estoqueFullImportado.test.ts`, `estoqueInventarioFisico.test.ts`): a
  linha completa; o zero à esquerda preservado no código; a linha ignorada
  apontando o número certo na planilha; e o que cada chave de upsert larga
  precisa distinguir — dois tipos de saldo, dois almoxarifados.

Nenhum destes testes toca o banco: as funções cobertas recebem a planilha
já lida ou os valores já carregados, e a persistência fica fora. É o que
permite rodá-los sem MySQL no ambiente.
