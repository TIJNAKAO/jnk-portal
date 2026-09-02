# Especificação Técnica: Módulo Faturamento

## 1. Contexto

Adotando o conceito de HUB de Aplicativos, criar o aplicativo **Faturamento**
com duas telas: um **Dashboard** filtrável (empresa, marca, canal, datas) e um
**Relatório de Notas Fiscais** exportável para Excel, no grão de item de NF,
com apuração de impostos, taxa de marketplace, custo e margem.

A base das duas telas é **`etl_fatcom`** — a tabela-fato de faturamento, uma
linha por item de NF, que é o ponto de consolidação dos dois ERPs da empresa:
o **SysEmp** (atual) e o **KPL** (legado). A coluna `origem_dados` distingue
as origens. O módulo Integração (`Specs/spec_modulo_integracao.md`) já previa
essa tabela e deixou o "Relatório de Margem" explicitamente pendente na sua
seção 7.7.

### 1.1. Três bugs de produção encontrados no diagnóstico

Antes de desenhar qualquer tela, o banco de produção foi consultado. O que
apareceu mudou a ordem do trabalho: a fundação de dados estava quebrada em
três pontos independentes, todos silenciosos.

**Bug 1 — a gravação de NF descartava todo o bloco fiscal.** O consumidor de
fila criado em 19/08/2026 (`dfee4df`) gravava apenas 8 colunas do item.
ICMS, ICMS-ST, DIFAL, IPI, PIS, COFINS, FECP, frete seller, comissão e valor
líquido existiam no schema, vinham no payload da SysEmp e eram jogados fora.
1.321 itens afetados entre 19/08 e 31/08, crescendo ~1.300/mês.

**Bug 2 — o ETL Fatcom falhava em 100% das execuções.** 94 de 94 execuções em
erro com `Data too long for column 'cst' at row 300`: 8 itens em 30.389 têm
CST de 4 caracteres (`"0102"`) contra uma coluna `CHAR(3)`. A carga inteira
caía de hora em hora desde o deploy, deixando a tabela congelada em 19/08 com
70% de cobertura.

**Bug 3 — a chave única colidia.** 8.205 notas sem número (`nota_numero` = `''`
ou `'0'`) compartilhavam a mesma chave `(empresa, número, série)` e se
sobrescreviam: 7.232 linhas silenciosamente substituídas por outras.

Nenhum dos três gerou alarme. Todos foram descobertos porque fomos olhar o
dado. O padrão comum — descarte silencioso — é o que a seção 3.5 endereça.

### 1.2. O dado real (31/08/2026)

| Medida | Valor |
|---|---|
| Notas fiscais | 30.763 (29.903 saídas, 849 entradas) |
| Itens de NF | 34.813 |
| Notas autorizadas pela SEFAZ | 20.870 |
| Período coberto | 12/01/2026 a 31/08/2026 |
| Volume corrente | ~6.000 itens/mês |
| Empresas SysEmp | 9 — mas apenas **3 CNPJs distintos** |
| Canais de venda | 19 (marketplaces + BALCAO) |
| Marcas | 262 (com padding de espaços — exige `TRIM`) |
| Cobertura de custo | `custo_formacao` 77%, `custo_medio` 64% |
| Legado KPL | 838.974 notas, 17/08/2017 a 04/03/2026 |

**Impostos efetivamente usados:** PIS/COFINS 33.413 · ICMS 21.428 ·
DIFAL 15.411 · IPI 4.388 · FECP 440 · ICMS-ST 219.

**Sobreposição de períodos:** o KPL vai até março/2026 e a SysEmp começa em
janeiro/2026. São ~2 meses de sobreposição — risco de dupla contagem quando os
fatos do KPL forem carregados.

---

## 2. Decisões validadas

1. **Base dos relatórios: `etl_fatcom`**, não as tabelas `sysemp_*` direto.
   É onde os dois ERPs se consolidam.
2. **Corrigir a fundação antes das telas** — Fases 1 e 1b.
3. **Custo:** `custo_formacao` com fallback para `custo_medio`, por produto **e**
   empresa, **congelado** na linha do fato. Sem custo, a margem sai **vazia**,
   nunca zero — zero seria lido como "margem nula" em vez de "custo desconhecido".
4. **Só entra no fato o que a SEFAZ autorizou** (protocolo presente).
   Canceladas nunca entram; devoluções entram e ficam sob filtro.
5. **Líquido e margem calculados na camada de consulta**, com dedução
   explícita — não se usa o `vr_item_liq` da SysEmp (ver 3.2).
6. **Fatos do KPL ficam para depois**; a dimensão de empresa já é consolidada
   agora (seção 3.6).
7. **Dashboard:** KPIs + evolução mensal, ranking por canal e marca, análise de
   margem, distribuição por UF.

### 2.1. Insumos no fato, derivados na consulta

`etl_fatcom` materializa **fatos** — impostos, custo unitário congelado,
comissão, frete seller. LÍQUIDO, MARGEM e % MARGEM são **regras**, calculadas
na camada de consulta.

A razão é prática: fórmula dentro de SQL de ETL é difícil de testar, e mudar a
definição de margem exigiria reprocessar a tabela inteira. Com a separação, as
fórmulas ficam num único lugar em TypeScript, cobertas por teste, e um ajuste
de regra vira deploy em vez de recarga.

---

## 3. Fase 1 e 1b — Correção da fundação

**Status: implementadas, aplicadas em produção e publicadas em 31/08/2026.**

### 3.1. Validação contra o payload real

Primeiro passo, e exatamente o que faltou na versão que introduziu o Bug 1:
três NFs reais de produção foram consultadas via `/listarNotasFiscais` — uma
de balcão sem imposto, uma de marketplace interestadual com DIFAL, e uma de
marketplace com IPI.

Os nomes confirmados **não** seguem o padrão das colunas:

| Coluna de destino | Campo no payload |
|---|---|
| `valor_icms` | `valoricms` |
| `icms_st` | `icmsst` |
| `valor_ipi` / `valor_pis` / `valor_cofins` | `valoripi` / `valorpis` / `valorcofins` |
| `valor_comissao_ml` | `valorcomissaoml` (e `valor_comissao`) |
| `vr_item_liquido` | `vr_item_liq` |
| `v_fcp_uf_dest` / `v_icms_uf_dest` / `v_icms_uf_remet` / `v_fcp_st` | `vfcpufdest` / `vicmsufdest` / `vicmsufremet` / `vfcpst` |
| `data_cancelamento_nfe` | `datacancelamento_nfe` |
| `chave_nfe` / `protocolo_nfe` | `chavenfe` / `protocolonfe` |

Particularidades de formato tratadas: `gera_financeiro` chega como `"S"`/`"N"`
(coluna é `BOOLEAN`); datas de cancelamento vêm como
`"2026-08-30 22:41:55.99543"`, que `DATETIME` não aceita; ids sem vínculo vêm
como `0`.

### 3.2. Gravação de NF — `016_nf_campos_fiscais.sql`

As colunas fiscais já existiam. Criadas apenas as que o payload traz e não
tinham destino: no item, `valor_unitario_liquido` e `quantidade_reservada`; no
cabeçalho, `tipo_documento`, `tipo_pedido`, `numero_pedido_marketplace`,
`data_pedido`, `data_venda`, `data_entrega` e `mensagem_nota`. Mais o índice
`idx_canal_venda`.

O consumidor passou a persistir o payload inteiro: **46 colunas no item, 62 no
cabeçalho**. O `INSERT` e o `ON DUPLICATE KEY UPDATE` são gerados de um único
mapa coluna→valor — foi a divergência entre essas duas listas escritas à mão
que deixou o Bug 1 passar.

**Backfill:** `npm run backfill:nf` rebusca e regrava notas já consumidas. Não
passa pela fila de propósito, porque esses eventos já foram confirmados na
SysEmp e não voltariam sozinhos. Critério `valor_icms IS NULL`, que distingue
"não gravado" de imposto zero legítimo. Executado: **1.190 notas, 0 falhas, 25
cancelamentos recuperados**.

### 3.3. ETL Fatcom — `017_fatcom_correcao.sql`

**Larguras.** `cst` de `CHAR(3)` para `VARCHAR(4)` (a causa das 94 falhas);
`dc_filial` de 25 para 100 — truncava razões sociais de até 60 caracteres, e
"Empresa" é a primeira coluna do relatório; `dc_clifor`, `dc_produto` e `um`
passam a acompanhar a origem.

**Colunas novas.** `vt_fecp`; `vu_custo` (nulável, para distinguir custo
desconhecido de custo zero); `ref_pendente`.

**Reescrita do ETL:**
- `LEFT JOIN` em vez de `INNER JOIN`, com `ref_pendente` marcando cliente ou
  produto ainda não sincronizado. Antes, esses itens sumiam da soma sem aviso.
- Custo congelado: `vu_custo` e `vt_custo` ficam fora do `ON DUPLICATE KEY
  UPDATE`, então a margem de um mês fechado não muda quando o custo sobe.
- Canceladas excluídas, com limpeza retroativa de notas canceladas após já
  terem sido carregadas.
- `vt_nota` recebe o total da **nota**, repetido em cada item (antes recebia o
  total do item). Somar essa coluna duplica em notas multi-item — o relatório
  sinaliza.
- Comissão e frete seller por item, com rateio pró-rata do cabeçalho como
  fallback. Como 93% das notas têm um único item, o rateio quase não atua.
- `LEFT()` em toda coluna de texto, para que dado fora do formato estrague uma
  célula em vez de parar o faturamento do mês.

### 3.4. Critério de faturamento e recuperação do número da NF

Só entram notas **autorizadas pela SEFAZ** (`protocolo_nfe` presente). As
8.205 notas sem número eram majoritariamente pré-notas ainda não emitidas
(R$ 1,37 milhão, sem protocolo) e colidiam todas na mesma chave única.

Restavam 89 notas autorizadas mas sem número gravado, que colidiam entre si.
Para essas, número e série são extraídos da **chave de acesso da NF-e**, que os
carrega em posição fixa (série nos dígitos 23–25, número nos 26–34). A
extração foi conferida contra as 22.523 notas que têm número **e** chave:
**bate em 100%**.

**Resultado da recarga:** 24.494 linhas, cobertura **100%** dos itens
elegíveis, zero colisões, custo unitário em 76%, período indo até 31/08 (antes
parava em 06/08).

### 3.5. Tornar a falha visível

Os três bugs sobreviveram porque nada os denunciava. O Painel de Integrações
mostrava apenas "a última execução falhou" — indistinguível de um tropeço
isolado. Agora o card exibe **falhas consecutivas desde o último sucesso**, com
destaque visual a partir de três. Noventa e quatro falhas seguidas deixam de
ser algo que só aparece para quem for procurar.

### 3.6. Consolidação da dimensão empresa — `018_etl_empresa_kpl.sql`

`etl_empresa` tinha apenas as 9 linhas SysEmp. As 4 filiais do KPL entram como
**seed**, não como ETL: o vínculo entre código de unidade de negócio e CNPJ não
existe em nenhuma tabela `bkpkpl_*` — é conhecimento de negócio. E o KPL está
congelado desde 04/03/2026, então esses dados não mudam mais.

| origem | grupo | cd_filial | dc_filial | CNPJ |
|---|---|---|---|---|
| KPL | JNK | 1 | JNK Barueri | 53.794.996/0001-10 |
| KPL | NK2 | 2 | NK2 Barueri | 19.933.110/0001-34 |
| KPL | JNK | 3 | JNK Louveira | 53.794.996/0004-63 |
| KPL | JNK | 4 | JNK Pinheiro | 53.794.996/0003-82 |

A chave é `(origem_dados, cd_filial)` e o **CNPJ aparece repetido entre as
origens de propósito**: o join a partir de `etl_fatcom` é sempre por origem +
filial. O CNPJ fica como atributo, para agrupar a mesma pessoa jurídica entre
os dois ERPs quando o relatório quiser essa visão.

**Descoberta relevante:** na SysEmp, as 9 "empresas" são apenas **3 CNPJs**.
O CNPJ 53.794.996/0003-82 aparece cinco vezes (ids 2, 5, 6, 7 e 8) — uma linha
por conta de fulfillment de marketplace. "Empresa" na SysEmp é uma unidade
operacional, não uma pessoa jurídica. JNK Louveira existe só no KPL.

**Armadilha registrada para a futura carga dos fatos KPL:** em
`bkpkpl_nf_saida`, a coluna `nf_cod_interno_da_unidade_de_negocio` **não é
confiável** como chave — o código 3 aponta para "FBM" em quase todo o
histórico mas para "PDV" em 3.093 notas de 2020, e 926 notas vêm sem código. A
identidade correta é o **nome** da unidade:

```
'J NAKAO LTDA'                                    -> cd_filial 1 (JNK Barueri)
'NK2 IMPORTACAO E EXPORTACAO DE FERRAMENTAS LTDA' -> cd_filial 2 (NK2 Barueri)
'CASA J NAKAO LT - FBM'                           -> cd_filial 3 (JNK Louveira)
'CASA J NAKAO LT - PDV'                           -> cd_filial 4 (JNK Pinheiro)
```

---

## 4. Fase 2 — Camada de consulta

`apps/api/src/services/faturamento.ts`, lendo `etl_fatcom` — uma tabela, sem
joins. Empresa, marca, canal e datas já são colunas do fato.

### 4.1. Filtros

Empresas, marcas, canais, período, tipo de operação (saídas por padrão) e
"gera financeiro" (`ctrl_financeiro`). Origem (`SYSEMP`/`KPL`) fica disponível
para quando os fatos do KPL existirem.

### 4.2. Fórmulas

```
LÍQUIDO  = vt_merc − vt_icms − vt_icms_st − vt_ipi − vt_pis − vt_cofins
                   − vt_icms_difal − vt_fecp − vt_tx_fatur − vt_add_frete
MARGEM   = LÍQUIDO − vt_custo
% MARGEM = MARGEM ÷ vt_merc
```

`MARGEM` e `% MARGEM` ficam **nulas** quando `vu_custo` é nulo.

> **Não usar `vt_liquido` como valor líquido.** Ele carrega o `vr_item_liq` da
> SysEmp, que é base de ICMS, não receita líquida. A sonda de payload provou:
> ```
> NF 124992: 727,95 − 37,00 (desconto) + 8,00 (frete)               = 698,95
> NF 114165: 166,67 − 12,22 (desconto) + 23,99 (frete) + 9,28 (IPI) = 187,72
> ```
> Ou seja, `mercadoria − desconto + frete + IPI`. Usá-lo como líquido comercial
> inflaria a margem.

---

## 5. Fase 3 — Relatório de Notas Fiscais

**Rota:** `/faturamento/notas-fiscais` · **API:** `/api/faturamento/notas-fiscais`

Três endpoints no padrão de `estoqueCurvaAbc`: `/filtros`, `/` (paginado) e
`/exportar` (ExcelJS).

**Colunas:** Empresa · Data do faturamento · Número da NF · Série · Nome do
cliente · UF do cliente · Código do produto · Descrição do produto · Marca ·
Canal · Quantidade · Valor unitário · Valor total mercadoria · Valor ICMS ·
Valor ICMS ST · Valor IPI · Valor PIS · Valor COFINS · Valor DIFAL · Valor
FECP · Valor Total da NF · Valor Frete Seller · Valor da Taxa do Marketplace ·
Valor líquido · Custo unitário · Margem · % da margem.

`Marca` e `Canal` foram acrescentados por serem filtros do relatório — sem eles
quem recebe a planilha não consegue reagrupar. `FECP` vem da versão anterior
deste spec.

**Performance:** ~6.000 itens/mês. Export síncrono é adequado; acima de 100.000
linhas a tela avisa antes de gerar.

---

## 6. Fase 4 — Dashboard

**Rota:** `/faturamento/dashboard` · **API:** `/api/faturamento/dashboard`

Um único endpoint devolve todas as agregações sobre os mesmos filtros.

- **KPIs:** faturamento bruto, devoluções, líquido, qtde de NFs, ticket médio,
  margem %, e **cobertura de custo** — o percentual de itens sobre os quais a
  margem foi calculável. Indicador de honestidade do próprio painel.
- **Evolução mensal** de faturamento e margem.
- **Ranking por canal e por marca.**
- **Análise de margem:** margem % por canal e marca, melhores e piores produtos.
- **Distribuição por UF** — relevante porque 15.411 itens têm DIFAL.
- **"Atualizado em"**, vindo de `MAX(atualizado_em)`: o dado é do último ETL,
  não ao vivo.

Gráficos com **Recharts**, seguindo a skill `dataviz`.

---

## 7. Fase 5 — Integração ao portal

- Migrations de seed: `019_faturamento_seed.sql` cria o módulo `FATURAMENTO`
  (ícone `Receipt`, registrado em `lib/icons.ts`) e a tela de Notas Fiscais;
  `020_faturamento_dashboard_seed.sql` acrescenta a tela de Dashboard. São
  separadas porque uma linha em `telas_modulo` aparece no menu: só pode existir
  depois da rota que ela aponta.
- Rotas em `apps/portal/src/App.tsx`; routers em `apps/api/src/app.ts`.

### 7.1. Conceder a permissão é um passo manual — e obrigatório

**Criar o módulo não o torna visível.** `buscarPermissoesEfetivas` não tem
exceção para administrador: o Hub lista apenas módulos com linha em
`perfis_telas` ou `permissoes_usuario`. Um módulo recém-seedado tem zero
permissões e fica invisível para todos, inclusive para quem o instalou.

Nenhuma migration do projeto concede permissão — é decisão de negócio, tomada
em **Configurador → Perfis → [perfil] → marcar as telas → Salvar**. A tela
lista todas as telas do sistema (`LEFT JOIN perfis_telas`), então a do módulo
novo aparece desmarcada, pronta para liberar.

Referência de como o módulo Estoque foi liberado: Administrador com as quatro
ações, Gerente somente visualizar. Faturamento expõe custo, margem e taxa de
marketplace — mais sensível que estoque, então a liberação foi deixada
deliberadamente a cargo do administrador, perfil a perfil.

---

## 8. Testes

O repositório não tem infraestrutura de teste. Este módulo introduz **Vitest**
cobrindo apenas a camada de cálculo — fórmulas de líquido e margem, exclusão de
canceladas, tratamento de custo ausente. Não cobre UI nem banco.

A justificativa é o próprio histórico desta spec: três bugs sobreviveram em
produção porque nada verificava o resultado. Cálculo de margem errado é
igualmente silencioso — chega errado numa reunião, não num log de erro.

---

## 9. Pendências conhecidas

1. **Fatos do KPL** — 838.974 notas e 1.047.585 itens ainda fora de
   `etl_fatcom`. A dimensão de empresa já está pronta (2.6) e a armadilha do
   código de unidade de negócio está documentada. Vira spec própria.
2. **Sobreposição jan–mar/2026** entre os dois ERPs precisa ser resolvida antes
   da carga do KPL, sob risco de dupla contagem.
3. **Cobertura de custo de 76%.** Um quarto dos itens vendidos sai sem margem;
   melhorar isso depende da SysEmp.
4. **7.310 pré-notas** (R$ 1,37 milhão) ficam fora do faturamento por não
   terem autorização da SEFAZ. Se muitas nunca forem autorizadas, vale
   entender por quê.
5. **`dc_fantasia` truncado em 25 caracteres** em `etl_empresa` produz rótulos
   como "FULL ML CNK2 COM, IMP E E". Cosmético, mas aparece em filtro.
6. **A margem apurada é "margem sobre receita líquida", não lucro.** A fórmula
   deduz ICMS, PIS e COFINS integralmente da receita e compara com um custo de
   estoque que é **bruto** — inclui os tributos pagos na compra. Como parte
   desses tributos gera crédito na entrada, deduzir a saída inteira contra um
   custo cheio subestima o resultado. Com os dados de 31/08/2026 isso produz
   margem global de **1,7%**: mercadoria R$ 7,68 mi, deduções de 27,5%, custo
   equivalente a 71% da mercadoria. A conta fecha e é consistente, mas não é
   lucro contábil. Para virar margem de verdade, seria preciso comparar
   receita líquida com **custo líquido de créditos** — decisão a tomar com a
   contabilidade antes de o número circular como "margem" em reunião.
7. **Colunas de valor em `etl_fatcom` são `FLOAT`**, não `DECIMAL`. Somar
   3.271 linhas já produz divergência de R$ 0,009 contra o agregado. Irrelevante
   hoje, mas é precisão de ponto flutuante em dinheiro — vale converter para
   `DECIMAL(14,4)` antes que o volume cresça.

---

## 10. Escopo de empresas por usuário

Um usuário só vê, nos relatórios, as empresas do ERP às quais está vinculado.

### 10.1. Por que não reaproveitar `filiais`

**Filial** é unidade organizacional: é o que o módulo TI usa para localizar um
equipamento, o que Avisos e Log de Acesso filtram, e o que o seletor da barra
lateral troca. **Empresa** é entidade do ERP.

Colapsar os dois quebraria o TI — "FULL SHOPEE CASA J NAKAO" não é um lugar
onde existem computadores. E os números não permitem: das 9 empresas da
SysEmp, cinco compartilham o CNPJ 53.794.996/0003-82; são contas de fulfillment
de marketplace, não companhias distintas.

Casar por CNPJ também não resolve: o CNPJ cadastrado na filial "JNakao" é o de
Pinheiros (…0003-82), que deixa de fora a empresa 1 (Barueri, …0001-10), também
JNakao. Só `grupo_empresa` (JNK/NK2/CNK2) cobre as nove corretamente.

### 10.2. Modelo

`usuarios_empresas (usuario_id, origem_dados, cd_filial)` — a chave casa com
`etl_empresa`, então já nasce cobrindo as 4 empresas do KPL além das 9 da
SysEmp. Semeada em `021_usuarios_empresas.sql` a partir do vínculo de filial
existente, casando pelo grupo.

### 10.3. Regras, em `services/escopoEmpresas.ts`

- **Falha fechada:** sem vínculo, o usuário não vê nada. A ausência de
  configuração nunca vira acesso total. `condicaoEscopo([])` devolve `1 = 0`,
  não uma condição vazia — a diferença entre não ver nada e ver tudo.
- **O escopo intersecciona, nunca substitui:** o código da empresa chega pela
  query string; pedir uma empresa fora do escopo devolve vazio, jamais a
  concede.
- **Origem faz parte da identidade:** o código 1 é Barueri na SysEmp e JNK
  Barueri no KPL. Tabelas de uma origem só (`sysemp_estoque_fisico`) usam
  `condicaoEscopoDeUmaOrigem`, que filtra por origem antes de usar os códigos.
- **As opções de filtro também são restritas.** Listar uma empresa fora do
  escopo já revelaria que ela existe e quanto movimenta.

Aplicado ao Faturamento **e** à Curva ABC do Estoque, que tinha a mesma falha.

Verificado em produção: faturamento total R$ 7.696.209 sem escopo contra
R$ 7.559.859 com o escopo do administrador — a diferença de R$ 136.350 é
exatamente NK2 + CNK2. Pedir `?empresas=3` fora do escopo devolve R$ 0.

### 10.4. Consequência operacional

A semeadura derivou do vínculo de filial, e ambos os usuários tinham apenas
"JNakao". Portanto **NK2 e CNK2 estão invisíveis para todos** até que o
administrador marque essas empresas em Configurador → Usuários. A seção
"Empresas do ERP" do formulário é sempre enviada, inclusive vazia — é assim
que se remove todo o acesso.

---

## 11. Consulta de Preços

**Rota:** `/faturamento/precos` · **API:** `/api/faturamento/precos` ·
**Seed:** `025_faturamento_precos_seed.sql`

Consulta direta de `sysemp_preco`, a tabela alimentada pela fila da SysEmp
(ver spec de Integração, seção 3.3). Colunas: empresa, código e descrição do
produto, marca, tabela, condição de pagamento, preço de tabela, preço
promocional, início e término da promoção, e data da última integração
(`synced_at`). Filtros de empresa, marca, busca (código, descrição, código
auxiliar ou código de barras) e "só promoção vigente"; paginada em 50,
ordenável por qualquer coluna e exportável para Excel — a exportação passa
pelo mesmo caminho da consulta, então não é porta lateral para o que a tela
não mostraria.

Duas particularidades que a distinguem das outras telas do módulo:

- **Não passa por `etl_fatcom`.** É a única consulta do módulo que lê a
  tabela sincronizada direto, sem camada de ETL — não há o que consolidar,
  já que preço só existe na SysEmp e o KPL não entra nessa conta. Por isso
  usa `condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', ...)`, e não
  `condicaoEscopo`: ter a empresa 4 do KPL não pode liberar a 4 da SysEmp.
- **Linha sem `id_empresa` não aparece pra ninguém.** São as gravadas pela
  varredura antiga, anterior à migração pra fila, que não trazia a empresa.
  Sem ela não há como decidir quem tem direito de ver aquele preço, e a
  regra é falhar fechado (seção 10.3). Consequência prática, medida em
  02/09/2026: das 249.251 linhas da tabela, apenas as que já passaram pela
  fila são visíveis — as demais só aparecem conforme o produto delas tiver
  evento de preço na SysEmp. Uma carga inicial que percorra
  `/listarPrecoVenda` produto a produto resolveria de uma vez; ainda não
  existe.
