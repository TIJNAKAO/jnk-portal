# Estoque FULL do Mercado Livre x SysEmp — desenho

## Intenção

Puxar da API do Mercado Livre o saldo de estoque do FULL (fulfillment) das contas
conectadas, gravar com histórico diário no portal e oferecer um relatório que
confronte esse saldo com o do SysEmp, para achar divergências.

Hoje o FULL só entra no portal por planilha mensal (`estoque_full_importado`,
fechamento). Esta entrega é outra coisa: saldo diário vindo da API, para consulta
e conferência, sem relação com o fechamento.

## Objetivos

- Sincronização `ml_estoque_full`, registrada em `integracaoRegistry.ts` (botão do
  Painel + job `SCHEDULED` diário), seguindo o padrão de `ml_pedidos`.
- Tabela com **uma foto por dia** por conta e SKU (rodar duas vezes no mesmo dia
  sobrescreve a foto do dia).
- Relatório comparativo por produto: saldo ML x saldo SysEmp x diferença, para as
  empresas **ML Axados-Oficial** e **Máquinas**.

## Não objetivos

- Não altera o fechamento mensal nem `estoque_full_importado`.
- Não escreve nada no ML nem no SysEmp (só leitura).
- Não concilia pedidos nem movimentação, só saldo.

## Decisões do Ricardo

- Saldo do SysEmp comparado: `sysemp_estoque_fisico.saldo_disponivel`.
- Vínculo de produto: SKU do anúncio ML (código do vendedor) =
  `sysemp_produto.codigo_auxiliar`.
- Histórico: uma foto por dia.
- Frequência: job `SCHEDULED` a cada 2 horas. Cada rodada sobrescreve a foto do
  dia, então o histórico guarda o último saldo lido de cada dia.
- Empresas do relatório: ML Axados-Oficial e Máquinas.

## Decisões minhas (a conferir)

1. **Quantidade ML comparada:** `available_units` (disponível para venda). O ML
   também devolve `total` e `not_available_units` com detalhe (avariado,
   extraviado, em transferência...). Tudo isso é gravado; a comparação usa só
   `available_units`, e o relatório mostra as demais colunas como informação.
2. **De-para conta ML → empresa SysEmp** em tabela de configuração
   (`ml_conta_empresa`), não fixo no código. Cada conta ML conectada aponta para
   uma `sysemp_empresa`. Conta sem de-para é ignorada pela sincronização e
   sinalizada no log.
3. **Produto sem correspondência:** SKU do ML que não existe em `codigo_auxiliar`
   aparece no relatório como "só no ML"; produto com saldo no SysEmp e sem
   anúncio FULL aparece como "só no SysEmp". Nunca é descartado em silêncio.
4. **Retenção:** sem expurgo na v1. Reavaliar se a tabela crescer demais.
5. **Autorização:** nova tela `/estoque/full-ml` (módulo Estoque), com
   `requirePermissao`. Filtro de empresas pelo `escopoEmpresas`, em pares
   `(origem, cd_filial)`, falha fechada. Seed em `telas_modulo` só depois da
   rota existir; liberar permissão é passo manual em Configurador → Perfis.

## Como funciona

### Sincronização (por conta ML com de-para)

1. `accessTokenValido(conta)` (já existe em `mercadoLivre/client.ts`).
2. Listar os anúncios FULL da conta (`/users/{id}/items/search` com
   `logistic_type=fulfillment`, paginação por scroll) e ler cada anúncio em lote
   (`/items?ids=...`) para obter `inventory_id` e SKU, inclusive por variação.
3. Para cada `inventory_id`, consultar o saldo do estoque fulfillment
   (`/inventories/{inventory_id}/stock/fulfillment`).
4. Gravar com upsert na tabela diária.

O `request` do client tem retry só para 429 (backoff 5/10/15s); como são muitas
chamadas, limitar concorrência. Os endpoints exatos e o formato real das
respostas devem ser confirmados contra a API real e documentados no spec
(seção 4.3 de `spec_modulo_integracao.md`), como as demais integrações.

### Dados (migration nova, aditiva)

- `ml_estoque_full`: `data_ref DATE`, `user_id_ml`, `inventory_id`, `item_id`,
  `variacao_id`, `sku`, `total`, `disponivel`, `nao_disponivel`,
  `nao_disponivel_detalhe JSON`, `atualizado_em`; único por
  `(data_ref, user_id_ml, inventory_id)`.
- `ml_conta_empresa`: `ml_conta_id` → `id_empresa`.
- `data_ref` é "dia de Brasília", calculado com `Date.UTC` conforme a regra de
  datas do CLAUDE.md.

### Relatório

Consulta `ml_estoque_full` (data escolhida, padrão: última foto) com
`sysemp_estoque_fisico` via `sku = codigo_auxiliar` e a empresa do de-para.
Colunas: empresa, código auxiliar, descrição, saldo ML (disponível, total, não
disponível), saldo SysEmp, diferença, situação (OK / divergente / só ML / só
SysEmp). Filtros: empresa, data, marca, busca, "só divergências". Exporta
Excel, como os relatórios do módulo. Mostra a data/hora da última sincronização
para ninguém comparar com dado velho.

## Fica para quem constrói

Formato exato do payload do ML (incluindo anúncios com variação), tela de
configuração do de-para (pode ser na própria página do ML), paginação do
relatório, testes (vitest ao lado do código) e atualização dos specs no mesmo
commit (`spec_modulo_integracao.md` e `spec_modulo_estoque.md`).
