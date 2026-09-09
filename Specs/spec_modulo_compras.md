# Especificação Técnica: Módulo Compras

## 1. Contexto e Origem

Módulo novo (`modulos_sistema.chave_modulo = 'COMPRAS'`), nascido da
integração de **Pedido de Compra** com a SysEmp (`tipo_tabela=5` da fila —
ver `Specs/spec_modulo_integracao.md`, seção 3.3, que documenta a
sincronização em si: consumidor de fila, schema de `sysemp_pedido_compra` /
`sysemp_pedido_compra_item`, as pegadinhas do payload). Este spec cobre só o
que é específico de Compras: a tela de consulta que dá visibilidade a esse
dado.

Módulo dedicado, e não uma tela dentro de Estoque ou Integração — decisão
tomada na validação desta spec. Estoque é sobre saldo físico; Integração é
operação técnica de sincronização, não relatório de negócio. Compras cria
espaço para crescer (requisição, cotação) sem forçar essas telas dentro de
um módulo que não é sobre isso.

**Pedido de Compra não é Nota Fiscal de Compra.** `sysemp_nota_fiscal` com
`entrada_saida='E'` (tipo_tabela=3) é o documento fiscal de entrada; Pedido
de Compra (`sysemp_pedido_compra`, tipo_tabela=5) é o pedido em si, e pode
existir sem NF nenhuma emitida contra ele ainda (`status_entrega` no payload
chega a admitir "RECEBIDO PARCIAL"). As duas tabelas não têm relação
declarada entre si nesta entrega.

## 2. Consulta de Pedidos de Compra

**Rota:** `/compras/pedidos` · **API:** `/api/compras/pedidos` ·
**Migration de seed:** `035_compras_modulo_seed.sql`

Uma linha por **pedido** (cabeçalho), não por item — decisão tomada na
validação: dá visão geral de "quais pedidos estão pendentes" mais rápido do
que uma grade item a item. Detalhe por item fica para uma tela de
drill-down futura, se precisar.

### 2.1. Colunas

Empresa (join `sysemp_empresa`), fornecedor (`razao_social` de
`sysemp_parceiro` via `id_parceiro_fornecedor`), data do pedido, previsão de
entrega, comprador, status do pedido, status da entrega, valor bruto,
desconto, IPI, frete, total geral.

### 2.2. Filtros

Empresa, fornecedor, status do pedido, status da entrega, intervalo de data
do pedido. Paginada em 50, ordenável, exportável para Excel — mesmo padrão
das demais telas de consulta do portal (Saldos, Preços).

Os campos monetários da exportação passam por `numeroXlsx()`
(`services/numeroXlsx.ts`) antes de `sheet.addRows()` — sem isso o Excel
mostra "número armazenado como texto" com ponto em vez de vírgula, o mesmo
bug já corrigido nos outros cinco exportadores do projeto. Nova exportação
nasce já usando o helper, não repete o problema.

### 2.3. Escopo

`condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', ...)` sobre `id_empresa` —
`sysemp_pedido_compra` é tabela de uma origem só (SysEmp), sem coluna de
origem, então ter a empresa 4 do KPL não pode liberar a 4 da SysEmp. Mesmo
padrão de Saldos e Curva ABC. Escopo vazio gera `WHERE 1 = 0` — falha
fechada.

### 2.4. Sem sub-tabela própria

A tela lê direto de `sysemp_pedido_compra` (mais o join de nome). Nenhuma
tabela nova nasce para a consulta em si — só para a sincronização (spec de
Integração, seção 4.2).

## 3. Módulo e permissão

`modulos_sistema`: `('Compras', 'COMPRAS', 'ShoppingCart', 'Pedidos de
compra sincronizados da SysEmp.')`. Ícone `ShoppingCart` do lucide-react,
adicionado ao mapa explícito em `src/lib/icons.ts` (o projeto não importa o
dicionário inteiro do lucide — ~600KB minificados — só para resolver um
nome dinâmico).

Como em todo módulo novo: seedar `modulos_sistema` + `telas_modulo` **não
concede permissão a ninguém**, nem a administrador. A tela fica invisível
até ser marcada em Configurador → Perfis → Salvar — decisão de negócio, não
de deploy.

A migration de seed da linha em `telas_modulo` só pode rodar depois que a
rota existir nas duas pontas (`App.tsx` + `app.ts`) — é por isso que
`035_compras_modulo_seed.sql` é migration própria, separada de
`033`/`034` (mesmo padrão do `019`/`020` do Faturamento).

## 4. Migrations desta entrega

| Migration | Conteúdo |
|---|---|
| `033_pedido_compra_schema.sql` | `sysemp_pedido_compra` + `sysemp_pedido_compra_item` (documentadas em `spec_modulo_integracao.md`, seção 4.2) |
| `034_pedido_compra_fila_seed.sql` | linha em `sysemp_fila_config` para `tipo_tabela=5` (spec de Integração, seção 3.3) |
| `035_compras_modulo_seed.sql` | `modulos_sistema` + a tela `/compras/pedidos` em `telas_modulo` |

## 5. Job agendado

`.do/app.yaml`, novo `cron-pedidos-compra`, `kind: SCHEDULED`, mesmo formato
dos demais consumidores de fila (`run_command: npm run cron:sincronizar
--workspace=apps/api -- pedidos_compra`). Horário `"50 * * * *"` — os
minutos `:0`, `:15`, `:30`, `:45` já estão ocupados por outros jobs
horários, mais um diário às 6h; `:50` é o primeiro livre.

## 6. Testes

`extrairLinhaPedidoCompra` (mapeamento payload → colunas do cabeçalho e do
item) como função pura testável, no molde de `estoqueFechamentoMensal.ts`:
campo ausente vira `null` e não quebra a linha; `id_compra` do parâmetro de
busca não é o mesmo campo que `id_pedcompra` da resposta (a pegadinha da
seção 3.3 de Integração); item sem número (`item` ausente) é ignorado sem
derrubar os demais.

Filtro de escopo (`estoqueComprasFiltros.test.ts` ou equivalente): escopo
vazio devolve `1 = 0`; escopo só de KPL não libera empresa SysEmp de mesmo
código — mesma bateria que as demais telas de consulta já cobrem.

## 7. Fora de escopo

- **Tela de detalhe por item** (drill-down dentro de um pedido) — a grade
  desta entrega é só de cabeçalho.
- **OS (`tipo_tabela=8`)** — continua fora de escopo (spec de Integração,
  seção 7, decisão 5).
- **Relação entre Pedido de Compra e a NF de entrada correspondente** — as
  duas tabelas não se referenciam nesta entrega.
