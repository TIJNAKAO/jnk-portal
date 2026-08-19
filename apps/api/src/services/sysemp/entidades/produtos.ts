import { withTransaction, type PoolConnection } from '../../../config/database.js';
import * as integracaoLog from '../../integracaoLog.js';
import type { ResultadoSincronizacao } from '../../integracaoLog.js';
import { sysempPost } from '../client.js';
import { booleano, inteiro, inserirEmLote, valor } from '../dbUtil.js';

const TAMANHO_LOTE = 200;
const MAX_ITERACOES = 500; // trava de segurança — até ~100 mil produtos

interface ProdutoPayload {
  id_produto?: number;
  origem?: Record<string, unknown>[];
  categoria_fiscal?: Record<string, unknown>[];
  estoque?: Record<string, unknown>[];
  [chave: string]: unknown;
}

async function gravarLoteProdutos(connection: PoolConnection, produtos: ProdutoPayload[]): Promise<void> {
  for (const produto of produtos) {
    const idProduto = inteiro(produto, 'id_produto');
    if (idProduto === null) continue;

    await connection.query(
      `INSERT INTO sysemp_produto (
         id_produto, codigo_auxiliar, nome_produto, unidade, tipo_produto, cod_produto_pai, codigo_barras,
         codigo_marca, descricao_marca, codigo_categoria, descricao_categoria, codigo_grupo, descricao_grupo,
         codigo_subgrupo, descricao_subgrupo, produto_kit, produto_temfilhos, ncm, peso_liquido, altura, largura,
         comprimento, qtde_embalagem, ativo, synced_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE
         codigo_auxiliar = VALUES(codigo_auxiliar), nome_produto = VALUES(nome_produto), unidade = VALUES(unidade),
         tipo_produto = VALUES(tipo_produto), cod_produto_pai = VALUES(cod_produto_pai), codigo_barras = VALUES(codigo_barras),
         codigo_marca = VALUES(codigo_marca), descricao_marca = VALUES(descricao_marca), codigo_categoria = VALUES(codigo_categoria),
         descricao_categoria = VALUES(descricao_categoria), codigo_grupo = VALUES(codigo_grupo), descricao_grupo = VALUES(descricao_grupo),
         codigo_subgrupo = VALUES(codigo_subgrupo), descricao_subgrupo = VALUES(descricao_subgrupo),
         produto_kit = VALUES(produto_kit), produto_temfilhos = VALUES(produto_temfilhos), ncm = VALUES(ncm),
         peso_liquido = VALUES(peso_liquido), altura = VALUES(altura), largura = VALUES(largura),
         comprimento = VALUES(comprimento), qtde_embalagem = VALUES(qtde_embalagem), ativo = VALUES(ativo),
         synced_at = CURRENT_TIMESTAMP`,
      [
        idProduto,
        valor(produto, 'codigo_auxiliar'),
        valor(produto, 'nome_produto'),
        valor(produto, 'unidade'),
        valor(produto, 'tipo_produto'),
        inteiro(produto, 'cod_produto_pai'),
        valor(produto, 'codigo_barras'),
        valor(produto, 'codigo_marca'),
        valor(produto, 'descricao_marca'),
        valor(produto, 'codigo_categoria'),
        valor(produto, 'descricao_categoria'),
        valor(produto, 'codigo_grupo'),
        valor(produto, 'descricao_grupo'),
        valor(produto, 'codigo_subgrupo'),
        valor(produto, 'descricao_subgrupo'),
        booleano(produto, 'produto_kit'),
        booleano(produto, 'produto_temfilhos'),
        valor(produto, 'ncm'),
        valor(produto, 'peso_liquido'),
        valor(produto, 'altura'),
        valor(produto, 'largura'),
        valor(produto, 'comprimento'),
        valor(produto, 'qtde_embalagem'),
        true,
      ],
    );

    // Sub-listas por empresa: delete + insert dos filhos deste produto (não upsert incremental).
    await connection.query('DELETE FROM sysemp_produto_origem WHERE id_produto = ?', [idProduto]);
    await connection.query('DELETE FROM sysemp_produto_categoria_fiscal WHERE id_produto = ?', [idProduto]);
    await connection.query('DELETE FROM sysemp_produto_estoque WHERE id_produto = ?', [idProduto]);

    await inserirEmLote(
      connection,
      'sysemp_produto_origem',
      ['id_produto', 'id_empresa', 'origem_mercadoria', 'synced_at'],
      (produto.origem ?? [])
        .map((o) => [idProduto, inteiro(o, 'id_empresa'), inteiro(o, 'origem_mercadoria'), new Date()])
        .filter((linha) => linha[1] !== null),
    );
    await inserirEmLote(
      connection,
      'sysemp_produto_categoria_fiscal',
      ['id_produto', 'id_empresa', 'id_tes_saida', 'synced_at'],
      (produto.categoria_fiscal ?? [])
        .map((c) => [idProduto, inteiro(c, 'id_empresa'), inteiro(c, 'id_tes_saida'), new Date()])
        .filter((linha) => linha[1] !== null),
    );
    await inserirEmLote(
      connection,
      'sysemp_produto_estoque',
      ['id_produto', 'id_empresa', 'estoque_maximo', 'estoque_minimo', 'synced_at'],
      (produto.estoque ?? [])
        .map((e) => [idProduto, inteiro(e, 'id_empresa'), valor(e, 'estoque_maximo'), valor(e, 'estoque_minimo'), new Date()])
        .filter((linha) => linha[1] !== null),
    );
  }
}

/** Lote por offset de registro — avança pela `qtde` retornada, para em `qtde: 0`. */
export async function sincronizarProdutos(idLog: number): Promise<ResultadoSincronizacao> {
  let offset = 0;
  let total = 0;

  for (let iteracao = 0; iteracao < MAX_ITERACOES; iteracao++) {
    if (await integracaoLog.foiCancelado(idLog)) return { qtde: total, cancelado: true };

    const inicio = Date.now();
    const resposta = await sysempPost<{ qtde: number; retorno: ProdutoPayload[] }>('/listarProdutos', {
      offset: String(offset),
      limit: String(TAMANHO_LOTE),
    });
    const produtos = resposta.retorno ?? [];

    if (produtos.length === 0) {
      await integracaoLog.detalhe(idLog, { pagina: offset, status: 'ok', qtdeRegistros: 0, duracaoMs: Date.now() - inicio, mensagem: 'Fim da paginação.' });
      break;
    }

    try {
      await withTransaction((connection) => gravarLoteProdutos(connection, produtos));
      total += produtos.length;
      await integracaoLog.detalhe(idLog, { pagina: offset, status: 'ok', qtdeRegistros: produtos.length, duracaoMs: Date.now() - inicio });
    } catch (error) {
      await integracaoLog.detalhe(idLog, { pagina: offset, status: 'erro', mensagem: (error as Error).message, duracaoMs: Date.now() - inicio });
      throw error;
    }

    offset += produtos.length;
  }

  return { qtde: total };
}
