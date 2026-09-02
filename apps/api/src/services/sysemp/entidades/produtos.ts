import type { PoolConnection } from '../../../config/database.js';
import { booleano, inserirEmLote, inteiro, valor } from '../dbUtil.js';
import { registrarConsumidorFila } from '../fila.js';

/**
 * Consumidor de fila pra Produto (tipo_tabela 0). Migrado do lote por
 * offset (`/listarProdutos` paginado) pra fila, seguindo as demais
 * entidades — ver `sysemp_fila_config`, chave 'produtos', e
 * Specs/spec_modulo_integracao.md, seção 3.3.
 *
 * `tipo_tabela` é **zero**, o único do sistema. Não é problema pro motor
 * (a busca é num Map, e os filtros de tela comparam string, onde `"0"` é
 * truthy), mas qualquer checagem futura em cima do número precisa ser
 * `!== undefined`, nunca um teste de veracidade.
 *
 * `/listarProdutos` aceita `{id_produto}` e devolve uma linha só, então o
 * fetch genérico do motor serve — sem `buscarDetalhe` próprio, diferente
 * de Preço e Pedido.
 *
 * **Três correções em relação à versão em lote**, todas confirmadas
 * contra o banco de produção em 02/09/2026:
 *
 * 1. As sub-listas se chamam `origens` e `estoques` (PLURAL) na resposta;
 *    o código antigo lia `origem`/`estoque` e por isso
 *    `sysemp_produto_origem` e `sysemp_produto_estoque` tinham **zero
 *    linha**, enquanto `categoria_fiscal` (singular, nome certo) tinha as
 *    223.974 esperadas.
 * 2. `qtde_embalagem` vem sempre `null`; o valor está em
 *    `produto_quantidade_embalagem`. A coluna estava NULL nos 24.886
 *    produtos.
 * 3. `ativo` vinha fixo em `true`, ignorando o campo do payload.
 */

export const CAMPOS_PRODUTO = [
  'id_produto',
  'codigo_auxiliar',
  'nome_produto',
  'unidade',
  'tipo_produto',
  'cod_produto_pai',
  'codigo_barras',
  'codigo_marca',
  'descricao_marca',
  'codigo_categoria',
  'descricao_categoria',
  'codigo_grupo',
  'descricao_grupo',
  'codigo_subgrupo',
  'descricao_subgrupo',
  'produto_kit',
  'produto_temfilhos',
  'ncm',
  'peso_liquido',
  'altura',
  'largura',
  'comprimento',
  'qtde_embalagem',
  'ativo',
] as const;

/** Payload → parâmetros do upsert, na ordem de `CAMPOS_PRODUTO`. */
export function montarParametrosProduto(payload: Record<string, unknown>, idRegistro: number): unknown[] {
  return [
    idRegistro,
    valor(payload, 'codigo_auxiliar'),
    valor(payload, 'nome_produto') ?? '',
    valor(payload, 'unidade'),
    valor(payload, 'tipo_produto'),
    inteiro(payload, 'cod_produto_pai'),
    valor(payload, 'codigo_barras'),
    valor(payload, 'codigo_marca'),
    valor(payload, 'descricao_marca'),
    valor(payload, 'codigo_categoria'),
    valor(payload, 'descricao_categoria'),
    valor(payload, 'codigo_grupo'),
    valor(payload, 'descricao_grupo'),
    valor(payload, 'codigo_subgrupo'),
    valor(payload, 'descricao_subgrupo'),
    booleano(payload, 'produto_kit'),
    booleano(payload, 'produto_temfilhos'),
    valor(payload, 'ncm'),
    valor(payload, 'peso_liquido'),
    valor(payload, 'altura'),
    valor(payload, 'largura'),
    valor(payload, 'comprimento'),
    valor(payload, 'produto_quantidade_embalagem') ?? valor(payload, 'qtde_embalagem'),
    booleano(payload, 'ativo'),
  ];
}

interface LinhasFilhas {
  origens: unknown[][];
  categoriaFiscal: unknown[][];
  estoques: unknown[][];
}

/**
 * Sub-listas por empresa → tuplas. `id_empresa` ausente descarta a linha:
 * a coluna é NOT NULL e tem FK pra `sysemp_empresa`, então um NULL
 * derrubaria o evento inteiro.
 */
export function montarLinhasFilhas(payload: Record<string, unknown>, idRegistro: number): LinhasFilhas {
  const lista = (chave: string): Record<string, unknown>[] => (Array.isArray(payload[chave]) ? (payload[chave] as Record<string, unknown>[]) : []);
  const comEmpresa = (linhas: unknown[][]): unknown[][] => linhas.filter((l) => l[1] !== null);

  return {
    origens: comEmpresa(lista('origens').map((o) => [idRegistro, inteiro(o, 'id_empresa'), inteiro(o, 'origem_mercadoria')])),
    categoriaFiscal: comEmpresa(lista('categoria_fiscal').map((c) => [idRegistro, inteiro(c, 'id_empresa'), inteiro(c, 'id_tes_saida')])),
    estoques: comEmpresa(
      lista('estoques').map((e) => [idRegistro, inteiro(e, 'id_empresa'), valor(e, 'estoque_maximo'), valor(e, 'estoque_minimo')]),
    ),
  };
}

async function gravarProduto(
  connection: PoolConnection,
  payload: Record<string, unknown> | null,
  acao: 'I' | 'U' | 'D',
  idRegistro: number,
): Promise<void> {
  if (acao === 'D' || !payload) {
    // `sysemp_produto` não tem coluna `deleted` — reaproveita `ativo`,
    // mesma escolha de `sysemp_parceiro`. As sub-tabelas ficam: elas
    // seguem o produto e somem junto via ON DELETE CASCADE se um dia ele
    // for removido de verdade.
    await connection.query('UPDATE sysemp_produto SET ativo = FALSE WHERE id_produto = ?', [idRegistro]);
    return;
  }

  await connection.query(
    `INSERT INTO sysemp_produto (${CAMPOS_PRODUTO.join(', ')}, synced_at)
     VALUES (${CAMPOS_PRODUTO.map(() => '?').join(', ')}, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE
       ${CAMPOS_PRODUTO.filter((c) => c !== 'id_produto')
         .map((c) => `${c} = VALUES(${c})`)
         .join(', ')},
       synced_at = CURRENT_TIMESTAMP`,
    montarParametrosProduto(payload, idRegistro),
  );

  // Sub-listas por empresa: delete + insert das filhas deste produto (não
  // upsert incremental) — empresa que sair da resposta some da tabela.
  const filhas = montarLinhasFilhas(payload, idRegistro);
  const agora = new Date();

  await connection.query('DELETE FROM sysemp_produto_origem WHERE id_produto = ?', [idRegistro]);
  await connection.query('DELETE FROM sysemp_produto_categoria_fiscal WHERE id_produto = ?', [idRegistro]);
  await connection.query('DELETE FROM sysemp_produto_estoque WHERE id_produto = ?', [idRegistro]);

  await inserirEmLote(
    connection,
    'sysemp_produto_origem',
    ['id_produto', 'id_empresa', 'origem_mercadoria', 'synced_at'],
    filhas.origens.map((l) => [...l, agora]),
  );
  await inserirEmLote(
    connection,
    'sysemp_produto_categoria_fiscal',
    ['id_produto', 'id_empresa', 'id_tes_saida', 'synced_at'],
    filhas.categoriaFiscal.map((l) => [...l, agora]),
  );
  await inserirEmLote(
    connection,
    'sysemp_produto_estoque',
    ['id_produto', 'id_empresa', 'estoque_maximo', 'estoque_minimo', 'synced_at'],
    filhas.estoques.map((l) => [...l, agora]),
  );
}

registrarConsumidorFila({ tipoTabela: 0, gravar: gravarProduto });
