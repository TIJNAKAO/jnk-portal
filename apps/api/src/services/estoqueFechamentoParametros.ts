import { ConfiguracaoAusenteError } from './erros.js';
import { obterParametro } from './parametros.js';

/**
 * Os dois parâmetros do Cálculo de Custo de Fechamento. No portal PHP
 * anterior eram literais no código (`preco / 2` e `id_tb_preco = 1`);
 * aqui vivem em Configurador → Parâmetros, categoria ESTOQUE.
 *
 * Nada aqui tem default: parâmetro ausente ou inválido **aborta o
 * cálculo** com o nome da chave. Um percentual errado produz um custo
 * errado que ninguém questiona, porque o número continua parecendo
 * razoável. Ver Specs/spec_modulo_estoque.md, seção 3.7.
 */

export interface ParametrosFechamento {
  /** Percentual mesmo: o custo vira `preço × percentual / 100`. */
  percentualCustoVenda: number;
  /** `sysemp_preco.id_tb_preco` da tabela consultada (LUCRO REAL = 1). */
  idTabelaPreco: number;
}

function exigirNumero(valor: string | null, chave: string, valido: (n: number) => boolean): number {
  const texto = valor?.trim() ?? '';
  if (texto === '') {
    throw new ConfiguracaoAusenteError(
      `Parâmetro ${chave} não está preenchido. Configure-o em Configurador → Parâmetros → Estoque.`,
    );
  }

  const numero = Number(texto);
  if (!Number.isFinite(numero) || !valido(numero)) {
    throw new ConfiguracaoAusenteError(
      `Parâmetro ${chave} tem valor inválido ("${texto}"). Corrija-o em Configurador → Parâmetros → Estoque.`,
    );
  }

  return numero;
}

export function interpretarParametrosFechamento(
  percentual: string | null,
  idTabela: string | null,
): ParametrosFechamento {
  return {
    percentualCustoVenda: exigirNumero(
      percentual,
      'FECHAMENTO_PERCENTUAL_CUSTO_VENDA',
      (n) => n > 0 && n <= 100,
    ),
    idTabelaPreco: exigirNumero(idTabela, 'FECHAMENTO_ID_TABELA_PRECO', (n) => Number.isInteger(n) && n > 0),
  };
}

export async function obterParametrosFechamento(): Promise<ParametrosFechamento> {
  const [percentual, idTabela] = await Promise.all([
    obterParametro('ESTOQUE', 'FECHAMENTO_PERCENTUAL_CUSTO_VENDA'),
    obterParametro('ESTOQUE', 'FECHAMENTO_ID_TABELA_PRECO'),
  ]);

  return interpretarParametrosFechamento(percentual, idTabela);
}
