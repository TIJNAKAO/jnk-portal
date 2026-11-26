import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import type { EmpresaPermitida } from './escopoEmpresas.js';
import { montarFiltroComEscopo, type FiltroFaturamento } from './faturamentoFiltros.js';
import {
  FAIXAS_MC,
  calcularMc,
  classificarAbc,
  classificarFaixa,
  componentesDaLinha,
  percentualSobre,
  type ClasseAbc,
  type ComponentesMc,
  type FaixaMc,
} from './mcVendasCalculos.js';

/**
 * Consultas da MC Vendas: margem de contribuição venda a venda.
 * Ver Specs/spec_modulo_faturamento.md, seção 12.
 *
 * Duas fontes, as duas já existentes no portal:
 * - `etl_fatcom`: uma linha por item de NF de saída, com ICMS, PIS, COFINS,
 *   DIFAL, FECP, tarifa do marketplace e frete do vendedor;
 * - `estoque_custo_fechamento`: o custo do Fechamento Mensal, que é custo
 *   **líquido** dos créditos de ICMS, PIS e COFINS (lucro real).
 *
 * O custo que vale para uma venda é o do fechamento mais recente até o fim
 * do período consultado, casado por produto e grupo de empresa. Não se usa
 * `etl_fatcom.vu_custo`: ele é o custo médio de estoque, bruto.
 */

/** Filtros da tela. Só saídas: devolução não é venda e distorceria a margem. */
export type FiltroMcVendas = Omit<FiltroFaturamento, 'tipoOperacao'> & { faixa?: FaixaMc };

/**
 * Custo líquido vigente por (grupo de empresa, produto).
 *
 * `AVG` porque um mesmo produto aparece mais de uma vez no fechamento do
 * mês (uma linha por empresa do grupo e por conta de fulfillment); custo
 * zero ou nulo não entra na média, senão puxaria o custo para baixo.
 *
 * As colunas saem com prefixo `cst_` para não colidir com as de
 * `etl_fatcom`, que os filtros referenciam sem qualificar.
 */
function joinCusto(temLimite: boolean): string {
  return `
    LEFT JOIN (
      SELECT c.grupo_empresa AS cst_grupo, c.codigo_auxiliar AS cst_codigo, AVG(c.vu_custo) AS vu_custo_liq
      FROM estoque_custo_fechamento c
      JOIN (
        SELECT grupo_empresa, codigo_auxiliar, MAX(periodo) AS periodo
        FROM estoque_custo_fechamento
        WHERE vu_custo > 0 AND codigo_auxiliar IS NOT NULL${temLimite ? ' AND periodo <= ?' : ''}
        GROUP BY grupo_empresa, codigo_auxiliar
      ) m ON m.grupo_empresa = c.grupo_empresa
         AND m.codigo_auxiliar = c.codigo_auxiliar
         AND m.periodo = c.periodo
      WHERE c.vu_custo > 0
      GROUP BY c.grupo_empresa, c.codigo_auxiliar
    ) cst ON cst.cst_grupo = f.grupo_empresa AND cst.cst_codigo = f.cd_produto`;
}

const TEM_CUSTO = 'cst.vu_custo_liq IS NOT NULL';

/**
 * A MC em SQL. Existe só para **filtrar e ordenar** no servidor; o número
 * que vai para a tela e para o Excel sai de `mcVendasCalculos.ts`. As duas
 * precisam dizer a mesma coisa — ao mudar a fórmula, mudar aqui também.
 */
const MC_SQL = `(f.vt_merc - f.qtde * cst.vu_custo_liq - f.vt_icms - f.vt_pis - f.vt_cofins
                 - f.vt_icms_difal - f.vt_fecp - f.vt_tx_fatur - f.vt_add_frete)`;
const PERC_MC_SQL = `(${MC_SQL} / NULLIF(f.vt_merc, 0) * 100)`;

const CONDICAO_FAIXA: Record<FaixaMc, string> = {
  lt10: `${PERC_MC_SQL} < 10`,
  f1015: `${PERC_MC_SQL} >= 10 AND ${PERC_MC_SQL} < 15`,
  f1520: `${PERC_MC_SQL} >= 15 AND ${PERC_MC_SQL} < 20`,
  f2025: `${PERC_MC_SQL} >= 20 AND ${PERC_MC_SQL} < 25`,
  ge25: `${PERC_MC_SQL} >= 25`,
  semcusto: 'cst.vu_custo_liq IS NULL',
};

export function faixaValida(valor: string | undefined): FaixaMc | undefined {
  return (FAIXAS_MC as readonly string[]).includes(valor ?? '') ? (valor as FaixaMc) : undefined;
}

interface Consulta {
  from: string;
  where: string;
  params: unknown[];
}

/** `FROM` com o custo já juntado, mais o `WHERE` da tela restrito ao escopo do usuário. */
export function montarConsulta(filtros: FiltroMcVendas, escopo: EmpresaPermitida[], comFaixa: boolean): Consulta {
  const { faixa, ...resto } = filtros;
  const filtro = montarFiltroComEscopo({ ...resto, tipoOperacao: 'S' }, escopo);
  const temLimite = Boolean(filtros.dataFim);

  const where = comFaixa && faixa ? `${filtro.where} AND (${CONDICAO_FAIXA[faixa]})` : filtro.where;

  return {
    from: `etl_fatcom f ${joinCusto(temLimite)}`,
    where,
    // O parâmetro do JOIN vem antes dos do WHERE, na ordem em que aparecem no SQL.
    params: [...(temLimite ? [filtros.dataFim] : []), ...filtro.params],
  };
}

// ---- Venda a venda ----

interface LinhaBanco extends RowDataPacket {
  recno: number;
  dc_filial: string;
  dt_movto: string;
  nf: string;
  serie: string;
  uf: string;
  cd_produto: string;
  dc_produto: string;
  marca: string;
  canal: string;
  qtde: number;
  vu_merc: number;
  vt_merc: number;
  vt_icms: number;
  vt_pis: number;
  vt_cofins: number;
  vt_icms_difal: number;
  vt_fecp: number;
  vt_tx_fatur: number;
  vt_add_frete: number;
  vu_custo_liq: string | number | null;
}

export interface LinhaMcVendas {
  recno: number;
  empresa: string;
  /** `YYYY-MM-DD`, já como texto: data de NF não tem hora nem fuso. */
  data: string;
  nf: string;
  serie: string;
  uf: string;
  canal: string;
  cdProduto: string;
  produto: string;
  marca: string;
  qtde: number;
  valorUnitario: number;
  vendas: number;
  custoLiquidoUnitario: number | null;
  custoLiquido: number | null;
  icms: number;
  percIcms: number | null;
  pisCofins: number;
  percPisCofins: number | null;
  difal: number;
  percDifal: number | null;
  tarifa: number;
  frete: number;
  mc: number | null;
  percMc: number | null;
  faixa: FaixaMc | null;
}

const SELECT_LINHA = `
  SELECT f.recno, f.dc_filial, DATE_FORMAT(f.dt_movto, '%Y-%m-%d') AS dt_movto, f.nf, f.serie, f.uf,
         f.cd_produto, f.dc_produto, f.marca, f.canal,
         f.qtde, f.vu_merc, f.vt_merc, f.vt_icms, f.vt_pis, f.vt_cofins, f.vt_icms_difal, f.vt_fecp,
         f.vt_tx_fatur, f.vt_add_frete, cst.vu_custo_liq,
         ${MC_SQL} AS mc_ord, ${PERC_MC_SQL} AS perc_mc_ord`;

/**
 * Colunas que a tela pode usar para ordenar. Lista fechada: a chave vem da
 * query string e o valor é interpolado no SQL.
 */
const ORDENACOES: Record<string, string> = {
  data: 'f.dt_movto',
  canal: 'f.canal',
  nf: 'f.nf',
  uf: 'f.uf',
  cdProduto: 'f.cd_produto',
  produto: 'f.dc_produto',
  qtde: 'f.qtde',
  vendas: 'f.vt_merc',
  custoLiquido: 'f.qtde * cst.vu_custo_liq',
  icms: 'f.vt_icms',
  pisCofins: '(f.vt_pis + f.vt_cofins)',
  difal: '(f.vt_icms_difal + f.vt_fecp)',
  tarifa: 'f.vt_tx_fatur',
  frete: 'f.vt_add_frete',
  mc: 'mc_ord',
  percMc: 'perc_mc_ord',
};

export interface OrdenacaoMc {
  coluna?: string;
  direcao?: 'asc' | 'desc';
}

function montarOrderBy(ordenacao: OrdenacaoMc): string {
  const expressao = (ordenacao.coluna && ORDENACOES[ordenacao.coluna]) || ORDENACOES.data;
  const direcao = ordenacao.direcao === 'asc' ? 'ASC' : 'DESC';
  // recno desempata: sem critério estável, duas páginas podem repetir ou pular linhas.
  return `ORDER BY ${expressao} ${direcao}, f.recno ASC`;
}

export function montarLinha(l: LinhaBanco): LinhaMcVendas {
  // AVG de DECIMAL chega como string no mysql2; as colunas FLOAT já são número.
  const custoUnitario = l.vu_custo_liq === null ? null : Number(l.vu_custo_liq);
  const c = componentesDaLinha({
    qtde: Number(l.qtde),
    vt_merc: Number(l.vt_merc),
    vt_icms: Number(l.vt_icms),
    vt_pis: Number(l.vt_pis),
    vt_cofins: Number(l.vt_cofins),
    vt_icms_difal: Number(l.vt_icms_difal),
    vt_fecp: Number(l.vt_fecp),
    vt_tx_fatur: Number(l.vt_tx_fatur),
    vt_add_frete: Number(l.vt_add_frete),
    vu_custo_liquido: custoUnitario,
  });
  const mc = calcularMc(c);
  const percMc = percentualSobre(mc, c.vendas);

  return {
    recno: l.recno,
    empresa: l.dc_filial,
    data: l.dt_movto,
    nf: l.nf,
    serie: l.serie,
    uf: l.uf,
    canal: l.canal,
    cdProduto: l.cd_produto,
    produto: l.dc_produto,
    marca: l.marca,
    qtde: Number(l.qtde),
    valorUnitario: Number(l.vu_merc),
    vendas: c.vendas,
    custoLiquidoUnitario: custoUnitario,
    custoLiquido: c.custoLiquido,
    icms: c.icms,
    percIcms: percentualSobre(c.icms, c.vendas),
    pisCofins: c.pisCofins,
    percPisCofins: percentualSobre(c.pisCofins, c.vendas),
    difal: c.difal,
    percDifal: percentualSobre(c.difal, c.vendas),
    tarifa: c.tarifa,
    frete: c.frete,
    mc,
    percMc,
    faixa: classificarFaixa(percMc, custoUnitario !== null),
  };
}

export async function buscarLinhasPaginadas(
  filtros: FiltroMcVendas,
  escopo: EmpresaPermitida[],
  pagina: number,
  tamanhoPagina: number,
  ordenacao: OrdenacaoMc = {},
): Promise<{ linhas: LinhaMcVendas[]; total: number }> {
  const { from, where, params } = montarConsulta(filtros, escopo, true);

  const [totalRows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM ${from} WHERE ${where}`, params);
  const total = Number(totalRows[0]?.total ?? 0);

  const [linhas] = await pool.query<LinhaBanco[]>(
    `${SELECT_LINHA} FROM ${from} WHERE ${where} ${montarOrderBy(ordenacao)} LIMIT ? OFFSET ?`,
    [...params, tamanhoPagina, (pagina - 1) * tamanhoPagina],
  );

  return { linhas: linhas.map(montarLinha), total };
}

export async function contarLinhas(filtros: FiltroMcVendas, escopo: EmpresaPermitida[]): Promise<number> {
  const { from, where, params } = montarConsulta(filtros, escopo, true);
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM ${from} WHERE ${where}`, params);
  return Number(rows[0]?.total ?? 0);
}

export async function buscarLinhasCompletas(
  filtros: FiltroMcVendas,
  escopo: EmpresaPermitida[],
  ordenacao: OrdenacaoMc = {},
): Promise<LinhaMcVendas[]> {
  const { from, where, params } = montarConsulta(filtros, escopo, true);
  const [linhas] = await pool.query<LinhaBanco[]>(
    `${SELECT_LINHA} FROM ${from} WHERE ${where} ${montarOrderBy(ordenacao)}`,
    params,
  );
  return linhas.map(montarLinha);
}

// ---- Agregados ----

/**
 * Somas de um grupo. Cada componente sai duas vezes: sobre todas as linhas
 * e só sobre as que têm custo (`_cc`). A MC é calculada sobre o segundo
 * conjunto — misturar venda sem custo na base faria a margem parecer maior.
 */
const SOMAS_SQL = `
  COUNT(*) AS itens,
  COALESCE(SUM(${TEM_CUSTO}), 0) AS itens_cc,
  COALESCE(SUM(f.qtde), 0) AS qtde,
  COALESCE(SUM(f.vt_merc), 0) AS vendas,
  COALESCE(SUM(f.vt_icms), 0) AS icms,
  COALESCE(SUM(f.vt_pis + f.vt_cofins), 0) AS pis_cofins,
  COALESCE(SUM(f.vt_icms_difal + f.vt_fecp), 0) AS difal,
  COALESCE(SUM(f.vt_tx_fatur), 0) AS tarifa,
  COALESCE(SUM(f.vt_add_frete), 0) AS frete,
  COALESCE(SUM(CASE WHEN ${TEM_CUSTO} THEN f.vt_merc END), 0) AS vendas_cc,
  COALESCE(SUM(f.qtde * cst.vu_custo_liq), 0) AS custo_cc,
  COALESCE(SUM(CASE WHEN ${TEM_CUSTO} THEN f.vt_icms END), 0) AS icms_cc,
  COALESCE(SUM(CASE WHEN ${TEM_CUSTO} THEN f.vt_pis + f.vt_cofins END), 0) AS pis_cofins_cc,
  COALESCE(SUM(CASE WHEN ${TEM_CUSTO} THEN f.vt_icms_difal + f.vt_fecp END), 0) AS difal_cc,
  COALESCE(SUM(CASE WHEN ${TEM_CUSTO} THEN f.vt_tx_fatur END), 0) AS tarifa_cc,
  COALESCE(SUM(CASE WHEN ${TEM_CUSTO} THEN f.vt_add_frete END), 0) AS frete_cc`;

export interface AgregadoMc {
  itens: number;
  itensComCusto: number;
  qtde: number;
  /** Vendas de todas as linhas do grupo, com ou sem custo. */
  vendas: number;
  /** Componentes só das linhas com custo: é sobre eles que a MC é calculada. */
  comCusto: ComponentesMc & { custoLiquido: number };
  mc: number | null;
  /** MC sobre as vendas com custo, não sobre o total. */
  percMc: number | null;
  /** Parcela das vendas, em valor, que tem custo e por isso entrou na MC. */
  cobertura: number | null;
}

export function montarAgregado(l: RowDataPacket): AgregadoMc {
  const n = (coluna: string) => Number(l[coluna] ?? 0);
  const itensComCusto = n('itens_cc');
  const vendas = n('vendas');

  const comCusto = {
    vendas: n('vendas_cc'),
    custoLiquido: n('custo_cc'),
    icms: n('icms_cc'),
    pisCofins: n('pis_cofins_cc'),
    difal: n('difal_cc'),
    tarifa: n('tarifa_cc'),
    frete: n('frete_cc'),
  };
  // Grupo em que nenhuma linha tem custo: a MC é desconhecida, não zero.
  const mc = itensComCusto > 0 ? calcularMc(comCusto) : null;

  return {
    itens: n('itens'),
    itensComCusto,
    qtde: n('qtde'),
    vendas,
    comCusto,
    mc,
    percMc: percentualSobre(mc, comCusto.vendas),
    cobertura: percentualSobre(comCusto.vendas, vendas),
  };
}

export interface GrupoMc extends AgregadoMc {
  rotulo: string;
}

export interface ResumoMcVendas {
  total: AgregadoMc & { notas: number };
  porCanal: GrupoMc[];
  topProdutos: (GrupoMc & { produto: string })[];
  /** Mês do Fechamento de Custo mais recente usado como custo (`YYYY-MM-DD`), ou `null` se não há nenhum. */
  fechamentoCusto: string | null;
  atualizadoEm: Date | null;
}

export async function buscarResumo(filtros: FiltroMcVendas, escopo: EmpresaPermitida[]): Promise<ResumoMcVendas> {
  const { from, where, params } = montarConsulta(filtros, escopo, false);

  const [totalRows] = await pool.query<RowDataPacket[]>(
    `SELECT ${SOMAS_SQL},
            COUNT(DISTINCT CONCAT_WS('|', f.origem_dados, f.cd_filial, f.nf, f.serie)) AS notas,
            MAX(f.atualizado_em) AS atualizado_em
     FROM ${from} WHERE ${where}`,
    params,
  );
  const totais = totalRows[0] ?? ({} as RowDataPacket);

  const [canais] = await pool.query<RowDataPacket[]>(
    `SELECT f.canal AS rotulo, ${SOMAS_SQL}
     FROM ${from} WHERE ${where}
     GROUP BY f.canal ORDER BY vendas DESC LIMIT 20`,
    params,
  );

  const [produtos] = await pool.query<RowDataPacket[]>(
    `SELECT f.cd_produto AS rotulo, MIN(f.dc_produto) AS produto, ${SOMAS_SQL}
     FROM ${from} WHERE ${where}
     GROUP BY f.cd_produto ORDER BY vendas DESC LIMIT 5`,
    params,
  );

  const [fechamento] = await pool.query<RowDataPacket[]>(
    `SELECT DATE_FORMAT(MAX(periodo), '%Y-%m-%d') AS periodo
     FROM estoque_custo_fechamento
     WHERE vu_custo > 0${filtros.dataFim ? ' AND periodo <= ?' : ''}`,
    filtros.dataFim ? [filtros.dataFim] : [],
  );

  return {
    total: { ...montarAgregado(totais), notas: Number(totais.notas ?? 0) },
    porCanal: canais.map((l) => ({ ...montarAgregado(l), rotulo: String(l.rotulo ?? '') })),
    topProdutos: produtos.map((l) => ({
      ...montarAgregado(l),
      rotulo: String(l.rotulo ?? ''),
      produto: String(l.produto ?? ''),
    })),
    fechamentoCusto: (fechamento[0]?.periodo as string | null) ?? null,
    atualizadoEm: (totais.atualizado_em as Date | null) ?? null,
  };
}

// ---- Ranking por produto ----

export interface ItemRanking extends GrupoMc {
  produto: string;
  marca: string;
  abc: ClasseAbc | null;
}

/** Acima disto o ranking deixa de ser lista para virar relatório; quem precisa de tudo exporta a venda a venda. */
export const LIMITE_RANKING = 1000;

export async function buscarRanking(filtros: FiltroMcVendas, escopo: EmpresaPermitida[]): Promise<ItemRanking[]> {
  const { from, where, params } = montarConsulta(filtros, escopo, false);

  const [linhas] = await pool.query<RowDataPacket[]>(
    `SELECT f.cd_produto AS rotulo, MIN(f.dc_produto) AS produto, MIN(f.marca) AS marca, ${SOMAS_SQL}
     FROM ${from} WHERE ${where}
     GROUP BY f.cd_produto ORDER BY vendas DESC LIMIT ?`,
    [...params, LIMITE_RANKING],
  );

  const itens = linhas.map((l) => ({
    ...montarAgregado(l),
    rotulo: String(l.rotulo ?? ''),
    produto: String(l.produto ?? ''),
    marca: String(l.marca ?? ''),
  }));
  const classes = classificarAbc(itens.map((i) => i.mc));

  return itens.map((item, indice) => ({ ...item, abc: classes[indice] ?? null }));
}
