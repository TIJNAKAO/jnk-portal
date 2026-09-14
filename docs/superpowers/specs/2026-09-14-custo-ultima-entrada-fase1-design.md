# Custo da Última Entrada — Fase 1: histórico e consulta

Módulo Compras. Porte do `spSsrsGerarUltCompra` (SQL Server / RDW) para o
portal, em três fases. Esta spec cobre **apenas a Fase 1**.

## 1. Objetivo

Trazer para o portal o custo de entrada do produto por período, que hoje
vive no SQL Server e alimenta cálculo de margem fora do portal.

A Fase 1 entrega o **histórico** e a **tela de consulta**. O cálculo novo
(Fase 2) e a planilha do despachante (Fase 3) ficam de fora, cada um com
sua spec.

## 2. O que foi medido no legado

Tudo abaixo foi apurado direto no SQL Server em 14/09/2026, não inferido
da leitura da procedure. Os números justificam decisões desta spec e
derrubam duas suposições iniciais.

| Medição | Resultado |
|---|---|
| Linhas em `KPL_ULT_COMPRA` | **742.830** |
| Cobertura | **201701 a 202604** (jan/2017 a abr/2026) |
| Empresas | JNK (713.678) e NK2 (29.152) |
| Produtos distintos | 11.509 |
| Duplicatas em `(PERIODO, CD_EMPRESA, CD_PROD)` | **zero** |
| Nulos/zeros/negativos em custo, qtde, data, produto | **zero** |
| Tabelas `TOTVS_*` | **todas com 0 linhas** |
| Última NF no `KPL_NF` | **31/12/2024** |
| Linhas vindas da lista `CUSTO_JNK` (docto `999999999`) | **2.137 de 6.902** no último período (31%) |

Três consequências:

- **TOTVS não existe.** As seis tabelas estão vazias. O bloco TOTVS da
  procedure é código morto, e não há nada a migrar.
- **KPL está congelado** em 31/12/2024 e já foi migrado para o portal
  (`bkpkpl_nf_entrada`, `012_bkpkpl_raw.sql`). É história, não fonte viva.
- **Um terço do custo nunca veio de nota fiscal.** Vem de
  `API.dbo.KPL_PRECO` com `NomeLista = 'CUSTO_JNK'`, uma lista digitada à
  mão, gravada com documento fictício `999999999` e impostos zerados.

### 2.1. Semântica: retrato cumulativo, não movimento do mês

O filtro da procedure é `DataMovimento <= @PERIODO`, e não "dentro do
período". Cada período é um **retrato da última compra conhecida de cada
produto naquela data**, não as compras daquele mês.

Verificado no dado: o produto `000001` tem última compra em 05/01/2022
(NF 957702, custo 21,62424) e essa mesma linha se repete idêntica em todo
período de então até 202604. O período 202604 contém compras com data de
movimento de 2017 a 2026.

Isso explica a redundância: 742.830 linhas armazenadas representam apenas
**107.576** eventos de compra distintos — sete oitavos da tabela é
repetição do mês anterior, e ela cresce ~6.900 linhas/mês.

**Decisão: manter o retrato mensal**, apesar da redundância. O motivo é de
negócio: a margem precisa do custo vigente de *todo* produto no período,
inclusive os sem compra recente. Um modelo de eventos (107 mil linhas)
responderia o mesmo com consulta indireta, e foi descartado a favor da
consulta trivial `WHERE periodo = X` e da comparação linha a linha com o
legado durante a validação.

### 2.2. Filtros reais da seleção de NF

Registrados aqui porque a Fase 2 depende deles e não estão documentados em
lugar nenhum fora da procedure:

- `EntradaSaida = 'E'`
- `StatusNota = 'FINALIZADA'`
- `GrupoComercializacao = '11'` (compra)
- `QuantidadeFiscal <> 0` — exclui nota de complemento
- `CodigoUnidadeNegocio <> '2'` — separa JNK de NK2
- Desempate pela última entrada: `data + hora + item + sequencial`

### 2.3. Precedência do custo — muda em relação ao legado

No legado, a lista `CUSTO_JNK` **vence** a nota fiscal: o bloco da NF tem
um `NOT EXISTS` contra as linhas já inseridas pela lista.

A partir da Fase 2, a ordem passa a ser, por decisão do dono do processo:

1. Nota fiscal de entrada
2. `sysemp_estoque_fisico.custo_formacao`
3. Replicar o último custo da própria tabela (carry-forward)

**Isso inverte a precedência atual.** Para produto que tem lista e nota, o
custo novo vai diferir do legado, e a margem desses itens muda quando a
Fase 2 entrar. É decisão consciente, registrada aqui para não virar
surpresa.

A regra 3 torna o retrato auto-suficiente: nenhuma fonte legada precisa
seguir viva.

## 3. Escopo da Fase 1

### 3.1. Tabela `compras_custo_ultima_entrada`

Equivalente do `KPL_ULT_COMPRA`, com quatro diferenças deliberadas:

- **`DECIMAL` no lugar de `FLOAT`.** O original usa `FLOAT` em valor
  monetário; `FLOAT` é binário e não representa `0,01` exatamente. Totais
  em `DECIMAL(14,4)`, unitários em `DECIMAL(18,6)` porque `vu_custo` é
  resultado de divisão.
- **`periodo` como `DATE`** no primeiro dia do mês, convenção já firmada
  no Estoque, em vez de `VARCHAR(6)` no formato `aaaamm`.
- **Código-texto ao lado do id resolvido.** `empresa`/`cd_produto` sempre
  preenchidos, `id_empresa`/`id_produto` nulos quando não casam, com
  `empresa_encontrada`/`produto_encontrado`. Mesmo princípio da `029`
  (Fechamento de Custo) e pelo mesmo motivo: linha de 2017 cujo produto
  não existe mais no cadastro **entra mesmo assim**, marcada. Sem FK.
- **`origem`** (`SQLSERVER` | `SYSEMP` | `ESTOQUE` | `CARRY` |
  `DESPACHANTE`) — de onde veio aquele custo.

**Chave única: `(periodo, origem, empresa, cd_produto)`.**

O `origem` entra na chave por razão operacional: o recálculo da Fase 2
apaga e regrava apenas as linhas que ele mesmo produz. O histórico
`SQLSERVER` fica congelado e nunca é tocado — não há como uma rodada de
cron sobrescrever sete anos que não temos como recalcular.

A chave usa o **texto** e não os ids porque `id_produto` pode ser nulo, e
`NULL` não deduplica em chave única do MySQL (a `029` documenta a mesma
armadilha).

Colunas, além das de controle: `dt_movto`, `dt_emissao`, `documento`,
`serie`, dados do fornecedor (`cd_clifor`, `dc_clifor`, `mun_clifor`,
`uf_clifor`), `qtde`, `vu_merc`, as alíquotas/bases/valores de ICMS,
ICMS-ST, ST-GNRE, IPI, PIS e COFINS, `vt_nf`, `vt_custo`, `vu_custo`,
`vt_fob_euro`, `cst`, `marca`, `ncm`, `descricao_produto`.

Índices: a chave única, mais `(periodo, id_empresa)` e `(id_produto)`,
que são os acessos da tela e do futuro consumo por margem.

### 3.2. Carga do histórico

Script de uso único em `apps/api/src/scripts/`, no padrão do
`backfillNotasFiscais.ts` que já existe.

1. Exportar `KPL_ULT_COMPRA` com `bcp` para CSV no scratchpad — `sqlcmd` e
   `bcp` já estão instalados na máquina, então **nenhuma dependência npm é
   adicionada** ao projeto para isso.
2. Carregar em lotes de 200 com `inserirEmLote`.
3. Converter `PERIODO` `aaaamm` → `DATE` no primeiro dia do mês.
4. Resolver **`id_produto`** contra o cadastro atual pelo `codigo_auxiliar`;
   o que não casar entra com id nulo e `produto_encontrado = FALSE`.

   **`id_empresa` fica nulo em toda a carga histórica**, e isso é decisão,
   não omissão. O legado grava `CD_EMPRESA` como `'JNK'`/`'NK2'`, e a
   `018_etl_empresa_kpl.sql` mostra por que a tradução não é direta: `'NK2'`
   corresponde a uma única filial, mas `'JNK'` é **grupo de três filiais**
   do KPL. Resolver só metade faria `empresa_encontrada` significar coisas
   diferentes em linhas diferentes da mesma tabela. O texto da empresa é
   preservado, a tela filtra por ele, e a tradução fica para quando houver
   regra de negócio que diga qual filial representa o grupo.
5. Gravar tudo com `origem = 'SQLSERVER'`.

O script é **idempotente**: reexecutar não duplica, porque a chave única
barra e a carga usa upsert por ela.

**Não há recálculo a partir do `bkpkpl_*`.** O KPL está congelado e o
resultado já está calculado no legado; reimportar o resultado é fiel e
barato, enquanto recalcular significaria refazer sete anos de regra fiscal
sem ganho.

### 3.3. Tela de consulta

Grade em Compras, com filtro por período, empresa e produto, mostrando a
última entrada (data, documento, fornecedor) e o custo apurado, com a
`origem` visível.

A tela não é enfeite: sem ela, conferir 742 mil linhas importadas exige
abrir o banco. Ela é o instrumento de validação da própria carga.

Segue o caminho normal de tela nova do projeto: rota em `App.tsx`, router
em `app.ts`, e migration de seed em `telas_modulo` — lembrando que a linha
em `telas_modulo` só pode ser seedada depois que a rota existir, e que
**seedar não concede permissão a ninguém**: liberar é passo manual em
Configurador → Perfis.

## 4. Fora do escopo

| Item | Fase |
|---|---|
| Cálculo a partir de `sysemp_nota_fiscal` | 2 |
| Precedência NF → `custo_formacao` → carry-forward | 2 |
| Entidade no `integracaoRegistry` e job agendado | 2 |
| Fechar a lacuna de mai–ago/2026 | 2 |
| Planilha do despachante e override de importação | 3 |
| Mudar a margem do Faturamento para usar este custo | — |
| Escopo por empresa do ERP na tela (`escopoEmpresas`) | 2 |

A tela **não** aplica `escopoEmpresas.ts`, ao contrário das outras telas de
relatório do projeto. Não há o que filtrar: `id_empresa` é nulo em toda a
carga, então não existe chave para o escopo casar. A contenção nesta fase é
a permissão de tela, que ninguém tem até ser marcada em Configurador →
Perfis — conceda-a apenas a quem pode ver as duas empresas. **Quando a Fase
2 gravar linhas com `id_empresa` preenchido, isto precisa ser revisto**, e
está anotado também no código da rota.

A margem fica de fora por decisão explícita: há hoje custo contábil
(Fechamento de Custo) e custo médio, e trocar a base de cálculo muda
número que já vai para reunião.

## 5. Riscos e pontos em aberto

- **`sysemp_estoque_fisico` é foto do agora** (PK `id_produto, id_empresa`,
  sem período). Usar `custo_formacao` para recompor maio/2026 atribuiria o
  custo de hoje àquele mês. Correto para o período corrente, questionável
  para a lacuna. **Decidir na Fase 2.**
- **Taxa de casamento de produto desconhecida.** 11.509 códigos do legado
  contra o cadastro atual do SysEmp; quantos casam só se sabe ao rodar. A
  carga não falha por isso — marca e conta —, mas se a taxa for baixa a
  tela fica pouco útil e vale reavaliar a chave de casamento.
- **NK2 tem 428 produtos** e some do cálculo novo se não tiver NF de
  entrada no SysEmp. Fica no histórico; verificar na Fase 2.
- **Lacuna de mai a ago/2026** sem custo, até a Fase 2 rodar.

## 6. Como validar

- Contagem por período e empresa no portal **bate exatamente** com o
  SQL Server (742.830 no total, 201701–202604).
- Amostra de produtos conferida linha a linha: `vu_custo`, `dt_movto`,
  `documento` idênticos à origem.
- Soma de `vt_custo` por período igual à do legado, dentro da diferença
  esperada de `FLOAT` para `DECIMAL`.
- Reexecutar o script não altera contagem nenhuma (idempotência).
