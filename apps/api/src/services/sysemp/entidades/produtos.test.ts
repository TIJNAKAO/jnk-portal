import { describe, expect, test } from 'vitest';
import { CAMPOS_PRODUTO, montarLinhasFilhas, montarParametrosProduto } from './produtos.js';

/**
 * Normalização do payload de `/listarProdutos` (busca por `id_produto`).
 * Amostra real capturada em produção pro id_produto 13 — ver
 * Specs/spec_modulo_integracao.md, seção 3.3.
 *
 * Os nomes das sub-listas são o ponto sensível: a resposta traz `origens`
 * e `estoques` no PLURAL, e `categoria_fiscal` no singular. A versão em
 * lote lia `origem`/`estoque` e por isso gravou zero linha nessas duas
 * tabelas durante toda a vida da integração.
 */
const PRODUTO_13: Record<string, unknown> = {
  id_produto: '13',
  codigo_auxiliar: '025658',
  nome_produto: '00107 SWISS 40 IXOX POLIDO N 00(025658)',
  unidade: 'PC',
  tipo_produto: 'MERCADORIA PARA REVENDA',
  cod_produto_pai: null,
  codigo_barras: '7898948177709',
  codigo_marca: '197',
  descricao_marca: 'DISPLAY SHOW',
  codigo_categoria: null,
  descricao_categoria: null,
  codigo_grupo: '11',
  descricao_grupo: ' ACESSÓRIO PARA FERRAMENTAS',
  codigo_subgrupo: '591',
  descricao_subgrupo: 'FAMILIA',
  produto_kit: 'f',
  produto_temfilhos: 'f',
  ncm: '83100000',
  peso_liquido: '1.0000',
  altura: '0.0500',
  largura: '0.0800',
  comprimento: '0.1500',
  produto_quantidade_embalagem: '0.0000',
  qtde_embalagem: null,
  origens: [
    { id_empresa: 1, origem_mercadoria: '0' },
    { id_empresa: 2, origem_mercadoria: '0' },
    { id_empresa: 3, origem_mercadoria: '1' },
    { id_empresa: 4, origem_mercadoria: '0' },
  ],
  categoria_fiscal: [
    { id_empresa: 1, id_tes_saida: 1 },
    { id_empresa: 2, id_tes_saida: 1 },
    { id_empresa: 3, id_tes_saida: 1 },
  ],
  estoques: [
    { id_empresa: 8, estoque_maximo: null, estoque_minimo: null },
    { id_empresa: 3, estoque_maximo: 0, estoque_minimo: 0 },
    { id_empresa: 1, estoque_maximo: 0, estoque_minimo: 0 },
  ],
  ativo: true,
};

function campo(parametros: unknown[], nome: (typeof CAMPOS_PRODUTO)[number]): unknown {
  return parametros[CAMPOS_PRODUTO.indexOf(nome)];
}

describe('montarParametrosProduto', () => {
  test('id_produto vem do evento de fila, não do payload', () => {
    const p = montarParametrosProduto({ ...PRODUTO_13, id_produto: '99' }, 13);

    expect(campo(p, 'id_produto')).toBe(13);
  });

  test('qtde_embalagem vem de produto_quantidade_embalagem', () => {
    // A resposta traz as duas chaves: `qtde_embalagem` sempre null e
    // `produto_quantidade_embalagem` com o valor. Ler a errada foi o que
    // deixou a coluna NULL nos 24.886 produtos.
    expect(campo(montarParametrosProduto(PRODUTO_13, 13), 'qtde_embalagem')).toBe('0.0000');
  });

  test('usa qtde_embalagem quando produto_quantidade_embalagem não vier', () => {
    const p = montarParametrosProduto({ ...PRODUTO_13, produto_quantidade_embalagem: undefined, qtde_embalagem: '12.0000' }, 13);

    expect(campo(p, 'qtde_embalagem')).toBe('12.0000');
  });

  test('converte os booleanos "f" da SysEmp', () => {
    const p = montarParametrosProduto(PRODUTO_13, 13);

    expect(campo(p, 'produto_kit')).toBe(false);
    expect(campo(p, 'produto_temfilhos')).toBe(false);
  });

  test('ativo vem do payload, não fixo em true', () => {
    expect(campo(montarParametrosProduto(PRODUTO_13, 13), 'ativo')).toBe(true);
    expect(campo(montarParametrosProduto({ ...PRODUTO_13, ativo: false }, 13), 'ativo')).toBe(false);
  });

  test('nome_produto ausente vira string vazia — a coluna é NOT NULL', () => {
    const p = montarParametrosProduto({ ...PRODUTO_13, nome_produto: undefined }, 13);

    expect(campo(p, 'nome_produto')).toBe('');
  });

  test('mantém os campos de cadastro como vieram', () => {
    const p = montarParametrosProduto(PRODUTO_13, 13);

    expect(campo(p, 'codigo_barras')).toBe('7898948177709');
    expect(campo(p, 'ncm')).toBe('83100000');
    expect(campo(p, 'descricao_marca')).toBe('DISPLAY SHOW');
    expect(campo(p, 'cod_produto_pai')).toBeNull();
  });
});

describe('montarLinhasFilhas', () => {
  test('lê a sub-lista de origens no plural', () => {
    expect(montarLinhasFilhas(PRODUTO_13, 13).origens).toEqual([
      [13, 1, 0],
      [13, 2, 0],
      [13, 3, 1],
      [13, 4, 0],
    ]);
  });

  test('lê a sub-lista de estoques no plural, preservando os nulls', () => {
    expect(montarLinhasFilhas(PRODUTO_13, 13).estoques).toEqual([
      [13, 8, null, null],
      [13, 3, 0, 0],
      [13, 1, 0, 0],
    ]);
  });

  test('lê categoria_fiscal, que é singular', () => {
    expect(montarLinhasFilhas(PRODUTO_13, 13).categoriaFiscal).toEqual([
      [13, 1, 1],
      [13, 2, 1],
      [13, 3, 1],
    ]);
  });

  test('sub-lista ausente vira lista vazia, não quebra', () => {
    const filhas = montarLinhasFilhas({ id_produto: '13' }, 13);

    expect(filhas.origens).toEqual([]);
    expect(filhas.categoriaFiscal).toEqual([]);
    expect(filhas.estoques).toEqual([]);
  });

  test('descarta sub-linha sem id_empresa — a coluna é NOT NULL e tem FK', () => {
    const filhas = montarLinhasFilhas({ ...PRODUTO_13, origens: [{ origem_mercadoria: '0' }, { id_empresa: 5, origem_mercadoria: '0' }] }, 13);

    expect(filhas.origens).toEqual([[13, 5, 0]]);
  });

  test('as filhas usam o id_produto do evento, não o do payload', () => {
    const filhas = montarLinhasFilhas({ ...PRODUTO_13, id_produto: '99' }, 13);

    expect(filhas.origens.every((l) => l[0] === 13)).toBe(true);
    expect(filhas.estoques.every((l) => l[0] === 13)).toBe(true);
  });
});
