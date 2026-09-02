import { describe, expect, test } from 'vitest';
import { COLUNAS_PRECO, montarLinhasPreco } from './precos.js';

/**
 * Normalização do payload de `/listarPrecoVenda` em linhas de
 * `sysemp_preco`. Amostra real capturada em produção pro id_produto 13
 * (ver Specs/spec_modulo_integracao.md, seção 3.3): um único evento de
 * fila devolve 11 linhas — o mesmo produto em duas empresas, duas tabelas
 * de preço e nove condições de pagamento.
 */
const RETORNO_PRODUTO_13: Record<string, unknown>[] = [
  {
    id_empresa: '1',
    codigo_produto: '13',
    produto_descricao: '00107 SWISS 40 IXOX POLIDO N 00(025658)',
    id_tb_preco: '1',
    nome_tabela: 'LUCRO REAL',
    id_condpagto: '1',
    nome_condicao: 'LOJA PINHEIROS',
    preco_tabela: '16.0500',
    preco_promocao: '0.00',
    data_inicio_promocao: null,
    data_termino_promocao: null,
  },
  {
    id_empresa: '1',
    codigo_produto: '13',
    produto_descricao: '00107 SWISS 40 IXOX POLIDO N 00(025658)',
    id_tb_preco: '1',
    nome_tabela: 'LUCRO REAL',
    id_condpagto: '7',
    nome_condicao: 'B4X',
    preco_tabela: '16.0500',
    preco_promocao: '13.64',
    data_inicio_promocao: '2026-03-01',
    data_termino_promocao: '2026-12-31',
  },
  {
    id_empresa: '4',
    codigo_produto: '13',
    produto_descricao: '00107 SWISS 40 IXOX POLIDO N 00(025658)',
    id_tb_preco: '2',
    nome_tabela: 'SIMPLES NACIONAL',
    id_condpagto: '8',
    nome_condicao: 'MERCADO LIVRE CNK2',
    preco_tabela: '0.0000',
    preco_promocao: '0.00',
    data_inicio_promocao: null,
    data_termino_promocao: null,
  },
];

/** Índice de cada coluna dentro da tupla, pra não depender da ordem literal. */
function campo(linha: unknown[], coluna: (typeof COLUNAS_PRECO)[number]): unknown {
  return linha[COLUNAS_PRECO.indexOf(coluna)];
}

describe('montarLinhasPreco', () => {
  test('gera uma linha por registro do retorno — um evento de fila traz várias', () => {
    expect(montarLinhasPreco(RETORNO_PRODUTO_13, 13)).toHaveLength(3);
  });

  test('separa as linhas por empresa, tabela e condição de pagamento', () => {
    const linhas = montarLinhasPreco(RETORNO_PRODUTO_13, 13);

    expect(linhas.map((l) => [campo(l, 'id_empresa'), campo(l, 'id_tb_preco'), campo(l, 'id_condpagto')])).toEqual([
      [1, 1, 1],
      [1, 1, 7],
      [4, 2, 8],
    ]);
  });

  test('converte preço e promoção pra número, preservando as datas da promoção', () => {
    const promocional = montarLinhasPreco(RETORNO_PRODUTO_13, 13)[1]!;

    expect(campo(promocional, 'preco_tabela')).toBe(16.05);
    expect(campo(promocional, 'preco_promocao')).toBe(13.64);
    expect(campo(promocional, 'data_inicio_promocao')).toBe('2026-03-01');
    expect(campo(promocional, 'data_termino_promocao')).toBe('2026-12-31');
  });

  test('preço zerado é zero, não NULL — produto sem preço na tabela é informação', () => {
    const semPreco = montarLinhasPreco(RETORNO_PRODUTO_13, 13)[2]!;

    expect(campo(semPreco, 'preco_tabela')).toBe(0);
    expect(campo(semPreco, 'preco_promocao')).toBe(0);
    expect(campo(semPreco, 'data_inicio_promocao')).toBeNull();
  });

  test('grava nome da tabela e da condição junto, como vieram', () => {
    const primeira = montarLinhasPreco(RETORNO_PRODUTO_13, 13)[0]!;

    expect(campo(primeira, 'nome_tabela')).toBe('LUCRO REAL');
    expect(campo(primeira, 'nome_condicao')).toBe('LOJA PINHEIROS');
  });

  test('valor fora de faixa (lixo de cadastro do ERP) vira NULL em vez de derrubar o INSERT', () => {
    const linhas = montarLinhasPreco([{ ...RETORNO_PRODUTO_13[0], preco_tabela: '999999999999999999' }], 13);

    expect(campo(linhas[0]!, 'preco_tabela')).toBeNull();
  });

  test('campo vazio da SysEmp vira NULL', () => {
    const linhas = montarLinhasPreco([{ ...RETORNO_PRODUTO_13[0], nome_condicao: '', id_condpagto: '' }], 13);

    expect(campo(linhas[0]!, 'nome_condicao')).toBeNull();
    expect(campo(linhas[0]!, 'id_condpagto')).toBeNull();
  });

  test('cai pro id_registro da fila quando o retorno não traz codigo_produto', () => {
    const linhas = montarLinhasPreco([{ ...RETORNO_PRODUTO_13[0], codigo_produto: undefined }], 13);

    expect(campo(linhas[0]!, 'id_produto')).toBe(13);
  });

  test('ignora id_produto divergente do evento — a linha pertence ao produto da fila', () => {
    // A resposta é filtrada por id_produto, então divergência é dado
    // inconsistente da origem: gravar sob outro id_produto criaria linha
    // órfã que o próximo DELETE por id_produto nunca alcançaria.
    const linhas = montarLinhasPreco([{ ...RETORNO_PRODUTO_13[0], codigo_produto: '99' }], 13);

    expect(campo(linhas[0]!, 'id_produto')).toBe(13);
  });

  test('retorno vazio não gera linha — produto sem preço cadastrado', () => {
    expect(montarLinhasPreco([], 13)).toEqual([]);
  });
});
