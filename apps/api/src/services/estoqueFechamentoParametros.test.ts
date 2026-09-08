import { describe, expect, test } from 'vitest';
import { ConfiguracaoAusenteError } from './erros.js';
import { interpretarParametrosFechamento } from './estoqueFechamentoParametros.js';

/**
 * Um percentual errado produz um custo errado que ninguém questiona, porque
 * o número continua parecendo razoável. Por isso nada aqui tem default
 * silencioso: valor ausente ou inválido derruba o cálculo com o nome da
 * chave. Ver Specs/spec_modulo_estoque.md, seção 3.7.
 */
describe('interpretarParametrosFechamento', () => {
  test('lê os dois parâmetros como número', () => {
    expect(interpretarParametrosFechamento('50', '1')).toEqual({
      percentualCustoVenda: 50,
      idTabelaPreco: 1,
    });
  });

  test('aceita percentual fracionário', () => {
    expect(interpretarParametrosFechamento('47.5', '1').percentualCustoVenda).toBe(47.5);
  });

  test('percentual ausente aborta, nomeando a chave', () => {
    expect(() => interpretarParametrosFechamento(null, '1')).toThrow(ConfiguracaoAusenteError);
    expect(() => interpretarParametrosFechamento(null, '1')).toThrow(/FECHAMENTO_PERCENTUAL_CUSTO_VENDA/);
  });

  test('tabela de preço ausente aborta, nomeando a chave', () => {
    expect(() => interpretarParametrosFechamento('50', null)).toThrow(/FECHAMENTO_ID_TABELA_PRECO/);
  });

  test('percentual não numérico aborta em vez de virar NaN', () => {
    expect(() => interpretarParametrosFechamento('cinquenta', '1')).toThrow(ConfiguracaoAusenteError);
  });

  test('percentual zero aborta — valorizaria tudo a custo zero', () => {
    expect(() => interpretarParametrosFechamento('0', '1')).toThrow(ConfiguracaoAusenteError);
  });

  test('percentual negativo aborta', () => {
    expect(() => interpretarParametrosFechamento('-10', '1')).toThrow(ConfiguracaoAusenteError);
  });

  test('percentual acima de 100 aborta', () => {
    expect(() => interpretarParametrosFechamento('101', '1')).toThrow(ConfiguracaoAusenteError);
  });

  test('percentual exatamente 100 é aceito', () => {
    expect(interpretarParametrosFechamento('100', '1').percentualCustoVenda).toBe(100);
  });

  test('id de tabela de preço não inteiro aborta', () => {
    expect(() => interpretarParametrosFechamento('50', '1.5')).toThrow(ConfiguracaoAusenteError);
  });

  test('espaço em volta do valor não atrapalha', () => {
    expect(interpretarParametrosFechamento(' 50 ', ' 1 ')).toEqual({
      percentualCustoVenda: 50,
      idTabelaPreco: 1,
    });
  });

  test('string vazia conta como ausente', () => {
    expect(() => interpretarParametrosFechamento('', '1')).toThrow(/FECHAMENTO_PERCENTUAL_CUSTO_VENDA/);
  });
});
