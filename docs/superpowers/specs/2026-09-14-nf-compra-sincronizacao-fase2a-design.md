# NF de Compra — Fase 2a: sincronização

Módulo Integração. Pré-requisito da Fase 2b (cálculo do custo da última
entrada), que não tem de onde calcular sem isto.

## 1. Objetivo

Fazer a **nota fiscal de compra** chegar da SysEmp ao portal, pela fila que
já existe.

Entrega pequena e de mecanismo conhecido. O valor está em destravar a Fase
2b, mas o histórico de compras no portal serve por si só.

## 2. Por que isto existe

A Fase 2 foi desenhada para calcular custo a partir das NF de entrada. Ao
medir a produção antes de desenhar, descobriu-se que **elas não estão lá**.

| Medição (produção, 14/09/2026) | Resultado |
|---|---|
| Notas de saída (`entrada_saida='S'`) | 31.288 |
| Notas de entrada (`entrada_saida='E'`) | 892 |
| Dessas, com CFOP de compra | **2** |
| CFOP `220x` / `120x` (devolução de venda) | 427 / 395 |
| CFOP `194x` (outra entrada) | 68 |
| Tipos de fila já sincronizados | 0, 2, 4, 5, 6, 7, 9 — **nunca o 3** |

As 892 notas de entrada são quase todas **devolução de venda**, que entram
de carona com as de venda pelo `tipo_tabela=2`.

A resposta estava escrita no próprio banco, na observação da linha
`notas_fiscais` de `sysemp_fila_config`:

> "tipo_tabela=2 (NF Venda). **NF Compra (3) usa o mesmo endpoint —
> adicionar linha própria se for preciso tratar separado.**"

A NF de Compra existe na SysEmp como `tipo_tabela=3`. Nunca foi pedida.

## 3. Escopo

### 3.1. Onde grava: `sysemp_nota_fiscal`, a mesma tabela

Não há tabela nova. A NF de Compra entra na tabela que já existe,
distinguida por `entrada_saida` e pelo CFOP.

Duas medições sustentam a decisão:

- **Não há colisão de chave.** `id_nota_saida` é sequência única na SysEmp:
  as notas de entrada vão de 2.861 a 203.215 e as de saída de 186 a 210.675
  — as faixas se intercalam por completo.
- **O mapeamento fiscal já foi pago caro uma vez.** O consumidor atual
  acertou ~46 colunas contra payload real, e o comentário no arquivo
  registra que o descompasso de nomes fez uma versão anterior gravar 8
  colunas e descartar todo o bloco fiscal entre 19 e 31/08/2026. Duplicar
  esse mapeamento numa tabela própria criaria um segundo lugar para o mesmo
  defeito.

### 3.2. As quatro peças

1. **Migration**: linha em `sysemp_fila_config` com `chave='notas_compra'`,
   `tipo_tabela=3`, mesmos endpoints da linha de NF Venda
   (`/listarFila`, `/listarNotasFiscais`, `/updateFilaApi`).
2. **Consumidor**: registrar o **mesmo** `gravarNotaFiscal` sob
   `tipoTabela: 3`. O registro é um `Map<tipoTabela, consumidor>`, então é
   uma linha. Nenhum código de mapeamento novo.
3. **Entidade** no `integracaoRegistry`, que já dá de graça o botão manual
   no Painel de Integração.
4. **Job `cron-notas-compra`** no `.do/app.yaml`, no minuto **`:20`**.

O minuto não é arbitrário: `:15` já tem três jobs, `:30` três, `:45` dois, e
cada um abre pool de 10 conexões contra um cluster `db-s-1vcpu-1gb`. `:20`
está livre.

### 3.3. O passo que normalmente não entraria numa spec

**Conferir uma nota de compra real, campo a campo, antes de confiar na
carga.**

O consumidor foi calibrado contra três NFs de **venda** de produção. Ninguém
nunca viu o payload de uma NF de **compra**: o fornecedor provavelmente chega
no campo do cliente, e pode haver campo que só existe na compra.

O modo de falha, se isso não for conferido, é o pior possível — dado
chegando, contagem batendo e bloco fiscal silenciosamente vazio. E é
exatamente o bloco fiscal (IPI, ICMS-ST, PIS, COFINS, base e alíquota) que a
Fase 2b consome para calcular o custo. O erro só apareceria lá na frente,
como custo errado na margem.

Por isso a validação desta fase não é "chegaram N notas", é "os campos
fiscais de uma nota de compra real batem com a origem".

## 4. Fora do escopo

| Item | Onde |
|---|---|
| Cálculo do custo da última entrada | Fase 2b |
| Preencher a lacuna de mai–ago/2026 | Fase 2b |
| Tela de consulta das notas de compra | entrega própria, se houver demanda |
| Qualquer mudança no consumidor de NF de venda | — |

A ausência de tela é decisão: o consumidor desta fase é a Fase 2b, não uma
pessoa. A conferência é por consulta ao banco.

## 5. Riscos e pontos em aberto

- **Volume e histórico desconhecidos.** Ninguém sabe quantas notas de compra
  a fila tem represadas, nem de quando. Pode ser que a SysEmp só enfileire a
  partir de agora, e aí o histórico de compras nasce vazio — o que não
  quebra nada, mas muda o que a Fase 2b vai encontrar.
- **Campos exclusivos da compra.** Se o payload trouxer campo que a tabela
  não tem, a decisão (coluna nova ou descartar) é da Fase 2b, que é quem
  sabe do que precisa.
- **`custo_formacao` cobre 40%.** Medido: 9.962 de 24.921 produtos têm
  `custo_formacao > 0` em `sysemp_estoque_fisico`. A regra 2 da precedência
  da Fase 2b não cobre o parque inteiro, e isso precisa ser considerado lá.

## 6. Como validar

- A entidade aparece no Painel de Integração e o botão manual roda sem erro.
- Após uma rodada, `SELECT COUNT(*) FROM sysemp_nota_fiscal WHERE
  entrada_saida='E' AND nota_cfop LIKE '1.1%' OR nota_cfop LIKE '2.1%'`
  passa de 2 para um número compatível com o que a SysEmp enfileirou.
- **Uma nota de compra conferida campo a campo contra a origem**, com
  atenção ao bloco fiscal: `valor_ipi`, `icms_st`, `valor_pis`,
  `valor_cofins`, `valor_icms`, `base_pis`, `base_cofins`, `item_cfop`.
- O job `cron-notas-compra` aparece no App Spec e roda no minuto `:20`.
