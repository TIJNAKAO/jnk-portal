# Especificação Técnica: Módulo DASH JULINHO

## 1. Contexto

Aplicativo próprio no HUB, **separado dos demais**, onde entram as visões
gerenciais novas pedidas pela diretoria. Existe para que essas visões
cresçam sem mexer nas telas e nas regras dos módulos já em uso (Faturamento,
Estoque, Compras, Integração, TI).

É a continuação, dentro do portal, do "DASH JULINHO" do portal PHP anterior
(`dash/` no repositório SiteRDW).

### 1.1. Regras de isolamento

1. **Lê, não escreve.** As visões consultam o que os outros módulos já
   sincronizam e calculam (`etl_fatcom`, `sysemp_*`, `ml_*`,
   `estoque_custo_fechamento`, `compras_*`). Não alteram tabela, ETL nem
   regra de outro módulo. Se uma visão precisar de dado que não existe, a
   tabela nova é deste módulo, com prefixo `dash_`.
2. **Código em pastas próprias:** `apps/api/src/routes/dash/`,
   `apps/api/src/services/dash/` e `apps/portal/src/pages/dash/`. Reusar
   função de outro módulo por import é permitido; editar o arquivo dele por
   causa de uma visão daqui, não.
3. **Rotas próprias:** telas em `/dash/...`, API em `/api/dash/...`. O menu
   lateral descobre o módulo ativo pelo prefixo da rota, então uma tela
   daqui nunca aparece no menu de outro módulo.
4. **Pontos de contato com o resto do portal**, e só estes: uma linha de
   import e uma de rota em `apps/api/src/app.ts` e em
   `apps/portal/src/App.tsx` por tela, e o ícone do módulo em
   `apps/portal/src/lib/icons.ts`.
5. **Escopo de empresas e permissão valem igual** (spec de Faturamento,
   seção 10; spec de infra): toda consulta de ERP passa pelo escopo do
   usuário, e toda rota declara `requirePermissao`.

### 1.2. Módulo e permissão

`045_dash_modulo_seed.sql` cria o módulo `DASH` (nome "DASH JULINHO", ícone
`TrendingUp`) e a primeira tela. Como todo módulo novo, **nasce invisível
para todos, inclusive administrador**, até as telas serem marcadas em
Configurador → Perfis. As visões daqui expõem custo e margem: liberar só
para quem deve ver.

Tela nova neste módulo: página em `pages/dash/`, router em `routes/dash/`,
as duas linhas de registro e uma migration de seed da linha em
`telas_modulo` com `chave_modulo = 'DASH'`. Para agrupar telas num submenu,
preencher `grupo_menu`.

---

## 2. MC Vendas

**Rota:** `/dash/mc-vendas` · **API:** `/api/dash/mc-vendas` ·
**Seed:** `045_dash_modulo_seed.sql`

Margem de contribuição venda a venda, para a operação de **lucro real**. É a
"Visão de Margem" que a seção 3.13 do spec de Estoque deixou reservada para
o Faturamento, e a resposta à pendência 6 do spec de Faturamento (seção 9): a margem das
telas do Faturamento compara receita líquida com custo **bruto**; esta compara com custo
**líquido de créditos**.

Origem do pedido: o módulo "MC Vendas" de outra operação (coletores por
marketplace em tempo real, com quatro abas). Esta entrega traz a parte que
os dados do portal já sustentam; o que ficou de fora está na seção 2.6.

### 2.1. Fontes

Nenhuma tabela nova. Duas que já existem:

- **`etl_fatcom`** — uma linha por item de NF de saída autorizada. Dá o
  valor da venda, ICMS, PIS, COFINS, DIFAL, FECP, tarifa do marketplace
  (`vt_tx_fatur`) e frete do vendedor (`vt_add_frete`). Os impostos são os
  **destacados na NF de saída**, por item, como a SysEmp os entrega.
- **`estoque_custo_fechamento`** — o custo do Fechamento Mensal. `vu_custo`
  é custo **líquido**: a planilha contábil já chega sem os créditos de ICMS,
  PIS (1,65%) e COFINS (7,6%) da entrada; IPI e ICMS-ST da compra compõem o
  custo, porque comércio não os credita.

`etl_fatcom.vu_custo` **não é usado aqui**. Ele é o custo médio de estoque,
bruto, e é exatamente o que produz a margem de 1,7% da pendência 6 do spec de Faturamento.

### 2.2. Custo vigente

O custo de uma venda é o do **fechamento mais recente até a data final do
filtro**, casado por `cd_produto` = `codigo_auxiliar` e `grupo_empresa`.
É a mesma regra do `dash/margem.php` do portal anterior.

- Um produto aparece mais de uma vez no fechamento do mês (uma linha por
  empresa do grupo e por conta de fulfillment): vale a **média**.
- Custo zero ou nulo não entra na média nem conta como fechamento do
  produto: o mês "mais recente" de um produto é o último em que ele teve
  custo de verdade.
- O índice `idx_custo_grupo_codigo_periodo`, criado na 029 para esta tela, é
  o que sustenta a busca.

Consequência a conhecer: o custo é o do fechamento vigente no **fim do
período consultado**, não o do mês de cada venda. Consultar janeiro a
novembro valoriza janeiro com o custo de outubro. Para análise de um mês
fechado, filtrar aquele mês.

Venda cujo produto não tem fechamento fica **sem custo**: custo e MC saem
em branco, nunca zero, e a venda não entra na MC dos totais.

### 2.3. Fórmula

```
MC   = vt_merc − custo líquido − ICMS − PIS/COFINS − DIFAL − tarifa − frete
MC % = MC ÷ vt_merc

custo líquido = qtde × vu_custo (do fechamento vigente)
PIS/COFINS    = vt_pis + vt_cofins
DIFAL         = vt_icms_difal + vt_fecp
tarifa        = vt_tx_fatur
frete         = vt_add_frete
```

Diferenças deliberadas em relação ao LÍQUIDO do spec de Faturamento (seção 4.2):

- **IPI e ICMS-ST não são deduzidos.** São cobrados por fora do valor da
  mercadoria; não saem da receita que `vt_merc` representa.
- **FECP entra somado ao DIFAL**, numa coluna só: os dois são devidos ao
  estado de destino na mesma operação.

As fórmulas moram em `services/mcVendasCalculos.ts`, cobertas por teste, e
servem a uma linha e a um total. Existe uma cópia da MC em SQL em
`services/mcVendas.ts`, usada **só para filtrar por faixa e ordenar** no
servidor; o número exibido nunca sai dela. Mudar a fórmula exige mudar os
dois lugares.

### 2.4. Tela

Filtros: período (com atalhos Hoje, Ontem, Mês atual, Mês anterior),
empresa, canal, marca e busca. Abre no mês da última venda disponível, não
no histórico inteiro. Só saídas: devolução não é venda.

- **Cards:** vendas do período; MC em R$ e %; "para onde vai a venda"
  (custo líquido, ICMS, PIS/COFINS, DIFAL, tarifa e frete, cada um com o
  percentual sobre as vendas); **cobertura de custo**.
- **Vendas por canal** e **Top 5 produtos**, com a MC % de cada um.
- **Venda a venda:** data, canal e empresa, NF, UF, produto, quantidade,
  valor, custo líquido, **ICMS R$ e %, PIS/COFINS R$ e %, DIFAL R$ e %**,
  tarifa, frete, MC R$ e %. **ICMS % e PIS/COFINS % são as alíquotas da
  própria nota** (`aliq_icms`, `aliq_pis` + `aliq_cofins`); DIFAL % é
  DIFAL + FECP sobre a base de cálculo do ICMS, porque a nota não traz a
  alíquota do DIFAL por item. Não é o peso do imposto sobre a venda: a
  primeira versão mostrava valor ÷ mercadoria e produzia números como 8,6%
  de ICMS (7% sobre mercadoria + frete) e 7,1% de PIS/COFINS (9,25% sobre a
  base sem ICMS), que parecem erro fiscal e não são. O peso sobre a venda
  continua nos cards e sai no Excel em coluna própria. Filtro
  por faixa de MC % (abaixo de 10, 10 a 15, 15 a 20, 20 a 25, 25 ou mais,
  sem custo), ordenação no servidor, 50 por página, exportação para Excel
  pelo mesmo caminho da consulta.
- **Ranking de produtos:** quatro visões (maior margem R$, maior margem %,
  mais faturam, mais unidades) e curva ABC sobre a MC acumulada (A até 80%,
  B até 95%, C o restante). Produto de MC negativa é C; sem custo não é
  classificado.

**Link da venda e DANFE.** O título do produto vira link para a venda no
painel do vendedor do canal (Mercado Livre, Shopee, Amazon), e cada linha
tem um botão DANFE. Os dois saem de `sysemp_nota_fiscal` (número do pedido
no marketplace e chave de acesso), buscados numa segunda consulta restrita
às notas da página: `etl_fatcom` não carrega esses campos, e incluí-los
seria mexer no ETL do Faturamento.

- O link só é montado quando o canal é reconhecido pelo nome **e** o número
  tem o formato daquele canal (`services/dash/linkVenda.ts`). Abrir exige
  estar logado no painel do canal, na conta que vendeu.
- O portal não guarda PDF nem XML da nota. O botão DANFE copia a chave de
  acesso e abre a consulta pública da SEFAZ, que pede captcha e não aceita
  a chave pela URL.
- Nota cujo número foi recuperado da chave (spec de Faturamento, seção 3.4)
  não casa na busca e fica sem link e sem botão.

**A MC dos totais é calculada só sobre as vendas com custo**, e o
percentual é sobre essas vendas, não sobre o total. Misturar venda sem
custo na base faria a margem parecer maior do que é. A cobertura de custo
diz quanto do faturamento a MC está de fato medindo.

### 2.5. Escopo e permissão

Escopo de empresas igual ao do Faturamento (spec de Faturamento, seção 10): usa
`montarFiltroComEscopo`, falha fechada. O custo é casado por
`grupo_empresa`, que não é restringido pelo escopo, mas só valoriza linhas
que o escopo já deixou passar.

A tela expõe custo líquido e margem por venda.
Como toda tela nova, nasce invisível até ser marcada em Configurador →
Perfis (seção 1.2).

### 2.6. Fora desta entrega

1. **Ao vivo.** A tela mostra o que já virou NF e passou pelo ETL (de hora
   em hora), não o pedido no instante da venda. Venda do dia aparece depois
   de faturada.
2. **Tarifa e frete reais do Mercado Livre por pedido.** Hoje vêm da NF
   (`valor_comissao_ml`, `frete_seller`). **Em produção a coluna Frete
   vem zerada**: a SysEmp não preenche `frete_seller`, e a tarifa chega a
   mais de 30% da venda em itens acima de R$ 79, o que indica comissão,
   taxa fixa e frete grátis somados em `valor_comissao_ml`. A MC não muda
   (o total deduzido é o mesmo), mas a separação entre tarifa e frete só
   sai da API do canal. `ml_pedido_item.taxa_venda` já
   existe; o frete do vendedor exige `/shipments/{id}/costs`, ainda não
   sincronizado (spec de Integração, seção 4.3).
3. **Canceladas e devoluções do período** como indicadores.
4. **Abas Análise e Preços** do módulo original (efeito de promoção, faixas
   de preço, simulador, preço de maior lucro por dia).
5. **Ads** rateado por venda.
6. **Leitura do XML da NF-e.** Os impostos vêm do payload da SysEmp, que
   espelha a nota. Ler o XML direto só se justifica se aparecer divergência
   entre os dois.

### 2.7. A validar com dado real

Não houve acesso ao banco de produção durante o desenvolvimento. Conferir no
primeiro uso:

- o casamento `etl_fatcom.cd_produto` ↔ `estoque_custo_fechamento.codigo_auxiliar`
  (a cobertura de custo no card denuncia se não casar);
- se `vu_custo` do Fechamento é de fato líquido de créditos em todas as
  linhas, inclusive as valorizadas por percentual do preço de venda
  (`ESTOQUE_FULL` sem custo no Fechamento, spec de Estoque seção 3.5);
- o tempo de resposta: cada consulta materializa o custo vigente de todo o
  fechamento. Se pesar no banco de 1 vCPU, o caminho é materializar o custo
  vigente numa tabela própria, atualizada a cada cálculo de fechamento.

---

## 3. Auditoria fiscal

Aba da MC Vendas (`/api/dash/mc-vendas/auditoria`). Confere a aritmética e
a coerência dos impostos destacados em cada item de NF de saída do período
filtrado. Nasceu de uma suspeita de imposto errado na venda a venda que era,
na verdade, diferença entre alíquota e peso sobre a venda (seção 2.4): a
aba existe para que a próxima suspeita seja respondida com a conta da nota
à vista.

### 3.1. O que ela é e o que não é

As regras usam só o que está em `etl_fatcom`: base, alíquota, valor, frete,
desconto. Apontam o item cuja conta não fecha ou cuja alíquota foge do
regime. **Não dizem qual é o imposto certo**: isso depende de NCM, benefício
fiscal e destinatário, e é decisão da contabilidade. Cada alerta é um item
para conferir, não um erro provado.

Tolerância de R$ 0,05 por item, para arredondamento.

### 3.2. Regras

Definidas em `services/dash/auditoriaFiscal.ts` (`REGRAS`), cada uma com
uma condição SQL e, quando dá para pôr número, uma estimativa do imposto
possivelmente pago a mais.

| Regra | Alerta quando |
|---|---|
| PIS/COFINS com o ICMS na base | base de PIS > mercadoria + frete − desconto − ICMS. Estima o excesso: diferença de base × (alíq. PIS + alíq. COFINS) |
| Alíquota de PIS ou COFINS fora do lucro real | PIS ≠ 1,65% ou COFINS ≠ 7,6% |
| PIS ou COFINS não bate com base × alíquota | valor destacado ≠ base × alíquota do item |
| ICMS não bate com base × alíquota | idem, para o ICMS |
| Alíquota de ICMS fora das usuais | diferente de 4, 7, 12 e das internas de 17 a 23% |
| Venda sem PIS/COFINS | item com mercadoria e PIS + COFINS zerados |
| Venda sem ICMS e sem ICMS-ST | item com mercadoria e os dois zerados |

As duas últimas são esperadas em produto monofásico e em ICMS já retido por
substituição; a regra não distingue esses casos.

### 3.3. Fora desta entrega

- Regras que dependem de dado que o fato não tem: UF do emitente (para
  validar alíquota interestadual por destino), se o destinatário é
  contribuinte (para validar a presença do DIFAL), tabela de NCM
  monofásico e de alíquotas internas por UF.
- Auditoria das notas de **entrada** (crédito aproveitado).
- Comparação com o XML da NF-e ou com a apuração da contabilidade.

### 3.4. A validar com dado real

Sem acesso ao banco no desenvolvimento, as regras não foram calibradas. É
esperado que alguma gere ruído na primeira execução (por exemplo, base de
PIS/COFINS que já desconta o DIFAL além do ICMS, como aparece nas notas
interestaduais). Ajustar a condição da regra, não a tolerância.
