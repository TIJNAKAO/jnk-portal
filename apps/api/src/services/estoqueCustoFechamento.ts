/**
 * Cálculo de Custo de Fechamento. Ver Specs/spec_modulo_estoque.md,
 * seção 3.5.
 *
 * A regra de valorização mora numa função pura, separada da
 * persistência, porque é a única parte com risco contábil de verdade — e
 * é onde os testes se concentram.
 */

export type OrigemCusto = 'FECHAMENTO' | 'ESTOQUE_FULL';

export interface EntradaValorizacao {
  qtde: number | null;
  /** Custo do Fechamento do mesmo produto e período, de qualquer empresa. */
  custoEstoque: number | null;
  /** Preço da tabela configurada em FECHAMENTO_ID_TABELA_PRECO. */
  precoVenda: number | null;
  percentualCustoVenda: number;
}

export interface Valorizacao {
  vuCustoEstoque: number | null;
  vuCustoVenda: number | null;
  /** O que foi de fato adotado: o de estoque se positivo, senão o de venda. */
  vuCusto: number | null;
  valorCustoTotal: number | null;
}

/**
 * Valoriza uma linha do Estoque FULL, que só tem quantidade.
 *
 * Ordem: custo do Fechamento primeiro; não havendo custo, ou sendo ele
 * zero ou negativo, um percentual do preço de venda. Não havendo nem
 * preço, a linha fica **sem custo** — nula, e não zero. Zero disfarçado
 * some no total e ninguém percebe que faltou dado; nulo aparece no resumo
 * como "sem custo encontrado".
 */
export function valorizarLinhaFull(entrada: EntradaValorizacao): Valorizacao {
  const { qtde, custoEstoque, precoVenda, percentualCustoVenda } = entrada;

  const temCustoEstoque = custoEstoque !== null && custoEstoque > 0;
  const temPrecoVenda = precoVenda !== null && precoVenda > 0;

  const vuCustoVenda =
    !temCustoEstoque && temPrecoVenda ? (precoVenda * percentualCustoVenda) / 100 : null;

  const vuCusto = temCustoEstoque ? custoEstoque : vuCustoVenda;

  return {
    vuCustoEstoque: custoEstoque,
    vuCustoVenda,
    vuCusto,
    valorCustoTotal: vuCusto !== null && qtde !== null ? qtde * vuCusto : null,
  };
}
