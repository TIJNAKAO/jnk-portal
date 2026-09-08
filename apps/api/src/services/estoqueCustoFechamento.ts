import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool, withTransaction } from '../config/database.js';
import type { GrupoEmpresa } from './estoqueFechamentoGrupos.js';
import type { ParametrosFechamento } from './estoqueFechamentoParametros.js';

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

export interface ResumoCalculo {
  linhasFechamento: number;
  linhasEstoqueFull: number;
  usouCustoEstoque: number;
  usouCustoVenda: number;
  semCusto: number;
  totalGeral: number;
}

/** Colunas de `estoque_custo_fechamento`, na ordem do INSERT em lote. */
const COLUNAS_CUSTO = [
  'periodo', 'grupo_empresa', 'id_empresa', 'nome_empresa', 'origem',
  'id_produto', 'codigo_auxiliar', 'descricao_produto', 'marca', 'unidade', 'ncm',
  'conta', 'tipo_saldo', 'qtde', 'vu_custo_estoque', 'vu_custo_venda', 'vu_custo',
  'valor_custo_total',
] as const;

type LinhaParaGravar = Record<(typeof COLUNAS_CUSTO)[number], unknown>;

async function gravarEmLotes(conexao: PoolConnection, linhas: LinhaParaGravar[]): Promise<void> {
  const TAMANHO_LOTE = 500;
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE);
    const grupoDeMarcadores = `(${COLUNAS_CUSTO.map(() => '?').join(',')})`;
    await conexao.query(
      `INSERT INTO estoque_custo_fechamento (${COLUNAS_CUSTO.join(',')})
       VALUES ${lote.map(() => grupoDeMarcadores).join(',')}`,
      lote.flatMap((l) => COLUNAS_CUSTO.map((c) => l[c])),
    );
  }
}

/** Custo do Fechamento por produto no período, de qualquer empresa. */
async function custoPorProduto(
  conexao: PoolConnection,
  periodo: string,
  idsProduto: number[],
): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();
  for (let i = 0; i < idsProduto.length; i += 1000) {
    const bloco = idsProduto.slice(i, i + 1000);
    const [linhas] = await conexao.query<RowDataPacket[]>(
      `SELECT id_produto, MAX(custo) AS custo
         FROM estoque_fechamento_mensal
        WHERE periodo = ? AND id_produto IN (${bloco.map(() => '?').join(',')})
        GROUP BY id_produto`,
      [periodo, ...bloco],
    );
    for (const l of linhas) {
      if (l.custo !== null) mapa.set(Number(l.id_produto), Number(l.custo));
    }
  }
  return mapa;
}

/** Preço da tabela configurada, por produto. Fallback da valorização. */
async function precoPorProduto(
  conexao: PoolConnection,
  idTabelaPreco: number,
  idsProduto: number[],
): Promise<Map<number, number>> {
  const mapa = new Map<number, number>();
  for (let i = 0; i < idsProduto.length; i += 1000) {
    const bloco = idsProduto.slice(i, i + 1000);
    const [linhas] = await conexao.query<RowDataPacket[]>(
      `SELECT id_produto, MAX(preco_tabela) AS preco
         FROM sysemp_preco
        WHERE id_tb_preco = ? AND id_produto IN (${bloco.map(() => '?').join(',')})
        GROUP BY id_produto`,
      [idTabelaPreco, ...bloco],
    );
    for (const l of linhas) {
      if (l.preco !== null) mapa.set(Number(l.id_produto), Number(l.preco));
    }
  }
  return mapa;
}

interface CadastroProduto {
  idProduto: number;
  nomeProduto: string | null;
  marca: string | null;
  unidade: string | null;
  ncm: string | null;
}

/**
 * O Estoque FULL guarda `cd_produto`, não `id_produto`: sem resolver
 * contra `sysemp_produto.codigo_auxiliar` não há como achar o custo do
 * Fechamento nem o preço de venda. É daí que sai também a descrição,
 * marca, unidade e NCM da linha, que a planilha não traz.
 */
async function cadastroPorCodigo(
  conexao: PoolConnection,
  codigos: string[],
): Promise<Map<string, CadastroProduto>> {
  const mapa = new Map<string, CadastroProduto>();
  for (let i = 0; i < codigos.length; i += 1000) {
    const bloco = codigos.slice(i, i + 1000);
    const [linhas] = await conexao.query<RowDataPacket[]>(
      `SELECT id_produto, codigo_auxiliar, nome_produto, descricao_marca, unidade, ncm
         FROM sysemp_produto
        WHERE codigo_auxiliar IN (${bloco.map(() => '?').join(',')})`,
      bloco,
    );
    for (const l of linhas) {
      mapa.set(String(l.codigo_auxiliar), {
        idProduto: Number(l.id_produto),
        nomeProduto: l.nome_produto === null ? null : String(l.nome_produto),
        marca: l.descricao_marca === null ? null : String(l.descricao_marca),
        unidade: l.unidade === null ? null : String(l.unidade),
        ncm: l.ncm === null ? null : String(l.ncm),
      });
    }
  }
  return mapa;
}

/**
 * Recalcula um par (período, grupo). **Apaga o cálculo anterior desse par
 * e grava de novo** — não acumula histórico de re-execuções, só a data da
 * última em `data_calculo_custo`. Intencional: o cálculo é derivado das
 * planilhas, e o que vale é o estado atual delas.
 *
 * Varre TODAS as empresas do grupo, não só as do escopo de quem clicou.
 * Ver `estoqueFechamentoGrupos.ts` e o spec, seção 3.6.
 */
export async function calcularCustoFechamento(
  periodo: string,
  grupo: GrupoEmpresa,
  parametros: ParametrosFechamento,
): Promise<ResumoCalculo> {
  const idsEmpresa = grupo.empresas.map((e) => e.idEmpresa);
  const nomePorId = new Map(grupo.empresas.map((e) => [e.idEmpresa, e.razaoSocial]));
  const marcadoresEmpresa = idsEmpresa.map(() => '?').join(',');

  return withTransaction(async (conexao) => {
    await conexao.query('DELETE FROM estoque_custo_fechamento WHERE periodo = ? AND grupo_empresa = ?', [
      periodo,
      grupo.grupo,
    ]);

    const paraGravar: LinhaParaGravar[] = [];

    // ---- 1. FECHAMENTO: cópia direta, já tem custo próprio ----
    const [linhasFechamento] = await conexao.query<RowDataPacket[]>(
      `SELECT id_empresa, id_produto, codigo_auxiliar, descricao, marca, unidade, ncm, estoque, custo, total
         FROM estoque_fechamento_mensal
        WHERE periodo = ? AND id_empresa IN (${marcadoresEmpresa})`,
      [periodo, ...idsEmpresa],
    );

    for (const f of linhasFechamento) {
      const custo = f.custo === null ? null : Number(f.custo);
      paraGravar.push({
        periodo,
        grupo_empresa: grupo.grupo,
        id_empresa: f.id_empresa,
        nome_empresa: nomePorId.get(Number(f.id_empresa)) ?? null,
        origem: 'FECHAMENTO' satisfies OrigemCusto,
        id_produto: f.id_produto,
        codigo_auxiliar: f.codigo_auxiliar,
        descricao_produto: f.descricao,
        marca: f.marca,
        unidade: f.unidade,
        ncm: f.ncm,
        conta: null,
        tipo_saldo: null,
        qtde: f.estoque,
        vu_custo_estoque: custo,
        vu_custo_venda: null,
        vu_custo: custo,
        valor_custo_total: f.total,
      });
    }

    // ---- 2. ESTOQUE FULL: valorizado ----
    const [linhasFull] = await conexao.query<RowDataPacket[]>(
      `SELECT id_empresa, conta, tipo_saldo, cd_produto, qtde
         FROM estoque_full_importado
        WHERE periodo = ? AND id_empresa IN (${marcadoresEmpresa})`,
      [periodo, ...idsEmpresa],
    );

    const cadastro = await cadastroPorCodigo(conexao, [
      ...new Set(linhasFull.map((r) => String(r.cd_produto))),
    ]);
    const idsProduto = [...new Set([...cadastro.values()].map((c) => c.idProduto))];
    const custos = await custoPorProduto(conexao, periodo, idsProduto);
    const precos = await precoPorProduto(conexao, parametros.idTabelaPreco, idsProduto);

    let usouCustoEstoque = 0;
    let usouCustoVenda = 0;
    let semCusto = 0;

    for (const r of linhasFull) {
      const codigo = String(r.cd_produto);
      const produto = cadastro.get(codigo) ?? null;

      const valorizacao = valorizarLinhaFull({
        qtde: r.qtde === null ? null : Number(r.qtde),
        custoEstoque: produto ? (custos.get(produto.idProduto) ?? null) : null,
        precoVenda: produto ? (precos.get(produto.idProduto) ?? null) : null,
        percentualCustoVenda: parametros.percentualCustoVenda,
      });

      if (valorizacao.vuCusto === null) semCusto++;
      else if (valorizacao.vuCustoVenda !== null) usouCustoVenda++;
      else usouCustoEstoque++;

      paraGravar.push({
        periodo,
        grupo_empresa: grupo.grupo,
        id_empresa: r.id_empresa,
        nome_empresa: nomePorId.get(Number(r.id_empresa)) ?? null,
        origem: 'ESTOQUE_FULL' satisfies OrigemCusto,
        id_produto: produto?.idProduto ?? null,
        codigo_auxiliar: codigo,
        descricao_produto: produto?.nomeProduto ?? null,
        marca: produto?.marca ?? null,
        unidade: produto?.unidade ?? null,
        ncm: produto?.ncm ?? null,
        conta: r.conta,
        tipo_saldo: r.tipo_saldo,
        qtde: r.qtde,
        vu_custo_estoque: valorizacao.vuCustoEstoque,
        vu_custo_venda: valorizacao.vuCustoVenda,
        vu_custo: valorizacao.vuCusto,
        valor_custo_total: valorizacao.valorCustoTotal,
      });
    }

    await gravarEmLotes(conexao, paraGravar);

    return {
      linhasFechamento: linhasFechamento.length,
      linhasEstoqueFull: linhasFull.length,
      usouCustoEstoque,
      usouCustoVenda,
      semCusto,
      totalGeral: paraGravar.reduce((soma, l) => soma + Number(l.valor_custo_total ?? 0), 0),
    };
  });
}

/** Períodos que já têm Fechamento importado — é o que a tela oferece. */
export async function buscarPeriodosDisponiveis(): Promise<string[]> {
  const [linhas] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT DATE_FORMAT(periodo, '%Y-%m-%d') AS periodo
       FROM estoque_fechamento_mensal
      ORDER BY periodo DESC`,
  );
  return linhas.map((l) => String(l.periodo));
}

export interface LinhaCusto extends RowDataPacket {
  id_empresa: number | null;
  nome_empresa: string | null;
  origem: string;
  id_produto: number | null;
  codigo_auxiliar: string | null;
  descricao_produto: string | null;
  marca: string | null;
  unidade: string | null;
  ncm: string | null;
  conta: string | null;
  tipo_saldo: string | null;
  qtde: number | null;
  vu_custo_estoque: number | null;
  vu_custo_venda: number | null;
  vu_custo: number | null;
  valor_custo_total: number | null;
}

const SELECT_CUSTO = `
  SELECT id_empresa, nome_empresa, origem, id_produto, codigo_auxiliar, descricao_produto,
         marca, unidade, ncm, conta, tipo_saldo, qtde, vu_custo_estoque, vu_custo_venda,
         vu_custo, valor_custo_total
    FROM estoque_custo_fechamento
   WHERE periodo = ? AND grupo_empresa = ?
   ORDER BY origem, nome_empresa, descricao_produto`;

/**
 * Uma página da grade, mais o total de registros e o **custo total geral
 * somado direto no banco**.
 *
 * O total geral nunca sai da página: no portal PHP anterior o limite da
 * grade chegou a cortar linha de um total exibido, e o número continuava
 * parecendo plausível. Ver Specs/spec_modulo_estoque.md, seção 3.8.
 */
export async function buscarCalculoPaginado(
  periodo: string,
  grupo: GrupoEmpresa,
  pagina: number,
  tamanhoPagina: number,
): Promise<{ linhas: LinhaCusto[]; total: number; totalGeral: number }> {
  const [totais] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(valor_custo_total), 0) AS total_geral
       FROM estoque_custo_fechamento
      WHERE periodo = ? AND grupo_empresa = ?`,
    [periodo, grupo.grupo],
  );

  const [linhas] = await pool.query<LinhaCusto[]>(`${SELECT_CUSTO} LIMIT ? OFFSET ?`, [
    periodo,
    grupo.grupo,
    tamanhoPagina,
    (pagina - 1) * tamanhoPagina,
  ]);

  return {
    linhas,
    total: Number(totais[0]?.total ?? 0),
    totalGeral: Number(totais[0]?.total_geral ?? 0),
  };
}

/** Todas as linhas do par (período, grupo), para a exportação da grade. */
export async function buscarCalculoCompleto(periodo: string, grupo: GrupoEmpresa): Promise<LinhaCusto[]> {
  const [linhas] = await pool.query<LinhaCusto[]>(SELECT_CUSTO, [periodo, grupo.grupo]);
  return linhas;
}

export interface LinhaInventarioContabil extends RowDataPacket {
  codigo_auxiliar: string | null;
  descricao_produto: string | null;
  unidade: string | null;
  ncm: string | null;
  qtde: number | null;
  vu_custo: number | null;
  valor_custo_total: number | null;
}

/**
 * A Lista de Inventário — formato fixo para a contabilidade. Sai sempre
 * de uma consulta nova, sem limite, e nunca da página carregada.
 */
export async function buscarListaInventario(
  periodo: string,
  grupo: GrupoEmpresa,
): Promise<LinhaInventarioContabil[]> {
  const [linhas] = await pool.query<LinhaInventarioContabil[]>(
    `SELECT codigo_auxiliar, descricao_produto, unidade, ncm, qtde, vu_custo, valor_custo_total
       FROM estoque_custo_fechamento
      WHERE periodo = ? AND grupo_empresa = ?
      ORDER BY codigo_auxiliar`,
    [periodo, grupo.grupo],
  );
  return linhas;
}

/** Último dia do mês do período — a DataFechamento da Lista de Inventário. */
export function ultimoDiaDoMes(periodo: string): Date {
  const [ano, mes] = periodo.split('-').map(Number);
  // Dia 0 do mês seguinte é o último dia deste mês.
  return new Date(Number(ano), Number(mes), 0);
}
