import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import {
  calcularLiquido,
  calcularMargem,
  calcularPercentualMargem,
  type InsumosFaturamento,
} from './faturamentoCalculos.js';
import { montarFiltroComEscopo, type FiltroFaturamento } from './faturamentoFiltros.js';
import { condicaoEscopo, type EmpresaPermitida } from './escopoEmpresas.js';

/**
 * Consultas do módulo Faturamento sobre `etl_fatcom` — a tabela-fato que
 * consolida os dois ERPs. Ver Specs/spec_modulo_faturamento.md, seção 4.
 *
 * A tabela guarda insumos; líquido e margem saem de `faturamentoCalculos.ts`,
 * aplicados tanto a uma linha do relatório quanto a totais agregados. Como as
 * fórmulas são lineares, somar e depois calcular dá o mesmo que calcular e
 * depois somar — por isso o dashboard não reescreve fórmula nenhuma.
 */

export type { FiltroFaturamento };

/** Colunas de insumo somadas nas agregações — a mesma lista que alimenta as fórmulas. */
const COLUNAS_INSUMO = [
  'vt_merc',
  'vt_icms',
  'vt_icms_st',
  'vt_ipi',
  'vt_pis',
  'vt_cofins',
  'vt_icms_difal',
  'vt_fecp',
  'vt_tx_fatur',
  'vt_add_frete',
  'vt_custo',
] as const;

export interface LinhaFaturamento extends RowDataPacket, InsumosFaturamento {
  origem_dados: string;
  dc_filial: string;
  dt_movto: Date;
  nf: string;
  serie: string;
  dc_clifor: string;
  uf: string;
  cd_produto: string;
  dc_produto: string;
  marca: string;
  canal: string;
  qtde: number;
  vu_merc: number;
  vt_nota: number;
  ref_pendente: string | null;
}

/** Linha do relatório com os derivados já aplicados. */
export interface LinhaRelatorio extends LinhaFaturamento {
  vt_liquido_calc: number;
  vt_margem: number | null;
  perc_margem: number | null;
}

const SELECT_LINHA = `
  SELECT origem_dados, dc_filial, dt_movto, nf, serie, dc_clifor, uf,
         cd_produto, dc_produto, marca, canal, ref_pendente,
         qtde, vu_merc, vt_merc, vt_nota,
         vt_icms, vt_icms_st, vt_ipi, vt_pis, vt_cofins, vt_icms_difal, vt_fecp,
         vt_tx_fatur, vt_add_frete, vu_custo, vt_custo
  FROM etl_fatcom
`;

/**
 * Colunas que a tela pode usar para ordenar. Lista fechada de propósito: o
 * nome vem da query string e é interpolado no SQL, então só pode ser um valor
 * conhecido.
 */
const ORDENACOES_VALIDAS = new Set([
  'dt_movto',
  'dc_filial',
  'nf',
  'dc_clifor',
  'uf',
  'cd_produto',
  'dc_produto',
  'marca',
  'canal',
  'qtde',
  'vu_merc',
  'vt_merc',
  'vt_nota',
  'vt_custo',
]);

export interface Ordenacao {
  coluna?: string;
  direcao?: 'asc' | 'desc';
}

function montarOrderBy(ordenacao: Ordenacao): string {
  const coluna = ordenacao.coluna && ORDENACOES_VALIDAS.has(ordenacao.coluna) ? ordenacao.coluna : 'dt_movto';
  const direcao = ordenacao.direcao === 'asc' ? 'ASC' : 'DESC';
  // recno desempata: sem critério estável, duas páginas podem repetir ou pular linhas.
  return `ORDER BY ${coluna} ${direcao}, recno ASC`;
}

function aplicarDerivados(linha: LinhaFaturamento): LinhaRelatorio {
  return {
    ...linha,
    vt_liquido_calc: calcularLiquido(linha),
    vt_margem: calcularMargem(linha),
    perc_margem: calcularPercentualMargem(linha),
  };
}

export async function buscarLinhasPaginadas(
  filtros: FiltroFaturamento,
  escopo: EmpresaPermitida[],
  pagina: number,
  tamanhoPagina: number,
  ordenacao: Ordenacao = {},
): Promise<{ linhas: LinhaRelatorio[]; total: number }> {
  const { where, params } = montarFiltroComEscopo(filtros, escopo);

  const [totalRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM etl_fatcom WHERE ${where}`,
    params,
  );
  const total = Number(totalRows[0]?.total ?? 0);

  const [linhas] = await pool.query<LinhaFaturamento[]>(
    `${SELECT_LINHA} WHERE ${where} ${montarOrderBy(ordenacao)} LIMIT ? OFFSET ?`,
    [...params, tamanhoPagina, (pagina - 1) * tamanhoPagina],
  );

  return { linhas: linhas.map(aplicarDerivados), total };
}

export async function buscarLinhasCompletas(
  filtros: FiltroFaturamento,
  escopo: EmpresaPermitida[],
  ordenacao: Ordenacao = {},
): Promise<LinhaRelatorio[]> {
  const { where, params } = montarFiltroComEscopo(filtros, escopo);
  const [linhas] = await pool.query<LinhaFaturamento[]>(
    `${SELECT_LINHA} WHERE ${where} ${montarOrderBy(ordenacao)}`,
    params,
  );
  return linhas.map(aplicarDerivados);
}

// ---- Agregações do dashboard ----

/** `SUM()` de cada insumo, opcionalmente restrito a uma condição. */
function somasSql(condicao?: string): string {
  return COLUNAS_INSUMO.map((c) =>
    condicao
      ? `COALESCE(SUM(CASE WHEN ${condicao} THEN ${c} END), 0) AS ${c}_cc`
      : `COALESCE(SUM(${c}), 0) AS ${c}`,
  ).join(', ');
}

/** Só as linhas com custo conhecido entram na margem — as demais não têm resposta. */
const COM_CUSTO = 'vu_custo IS NOT NULL';

function insumosDaLinha(linha: RowDataPacket, sufixo = ''): InsumosFaturamento {
  const valor = (coluna: string) => Number(linha[`${coluna}${sufixo}`] ?? 0);
  return {
    vt_merc: valor('vt_merc'),
    vt_icms: valor('vt_icms'),
    vt_icms_st: valor('vt_icms_st'),
    vt_ipi: valor('vt_ipi'),
    vt_pis: valor('vt_pis'),
    vt_cofins: valor('vt_cofins'),
    vt_icms_difal: valor('vt_icms_difal'),
    vt_fecp: valor('vt_fecp'),
    vt_tx_fatur: valor('vt_tx_fatur'),
    vt_add_frete: valor('vt_add_frete'),
    vt_custo: valor('vt_custo'),
    // Nas agregações, "custo conhecido" é uma propriedade do conjunto: se
    // nenhuma linha tinha custo, a margem do grupo é indeterminada.
    vu_custo: null,
  };
}

export interface AgregadoFaturamento {
  rotulo: string;
  itens: number;
  faturamento: number;
  liquido: number;
  margem: number | null;
  percMargem: number | null;
}

/** Monta um agregado a partir de uma linha que traz somas totais e somas restritas ao custo conhecido. */
function montarAgregado(linha: RowDataPacket, rotulo: string): AgregadoFaturamento {
  const totais = insumosDaLinha(linha);
  const itensComCusto = Number(linha.itens_com_custo ?? 0);

  const comCusto = { ...insumosDaLinha(linha, '_cc'), vu_custo: itensComCusto > 0 ? 0 : null };

  return {
    rotulo,
    itens: Number(linha.itens ?? 0),
    faturamento: totais.vt_merc,
    liquido: calcularLiquido(totais),
    margem: calcularMargem(comCusto),
    percMargem: calcularPercentualMargem(comCusto),
  };
}

const SELECT_AGREGADO = `${somasSql()}, ${somasSql(COM_CUSTO)},
    COUNT(*) AS itens,
    COALESCE(SUM(${COM_CUSTO}), 0) AS itens_com_custo`;

async function agregarPor(
  coluna: string,
  filtros: FiltroFaturamento,
  escopo: EmpresaPermitida[],
  limite = 15,
): Promise<AgregadoFaturamento[]> {
  const { where, params } = montarFiltroComEscopo(filtros, escopo);
  const [linhas] = await pool.query<RowDataPacket[]>(
    `SELECT ${coluna} AS rotulo, ${SELECT_AGREGADO}
     FROM etl_fatcom WHERE ${where}
     GROUP BY ${coluna} ORDER BY vt_merc DESC LIMIT ?`,
    [...params, limite],
  );
  return linhas.map((l) => montarAgregado(l, String(l.rotulo ?? '')));
}

export interface ResumoFaturamento {
  kpis: {
    faturamentoBruto: number;
    devolucoes: number;
    faturamentoLiquido: number;
    qtdeNotas: number;
    qtdeItens: number;
    ticketMedio: number;
    margem: number | null;
    percMargem: number | null;
    /** Percentual de itens sobre os quais a margem foi calculável. */
    coberturaCusto: number;
  };
  evolucaoMensal: AgregadoFaturamento[];
  porCanal: AgregadoFaturamento[];
  porMarca: AgregadoFaturamento[];
  porUf: AgregadoFaturamento[];
  porEmpresa: AgregadoFaturamento[];
  atualizadoEm: Date | null;
}

export async function buscarResumo(filtros: FiltroFaturamento, escopo: EmpresaPermitida[]): Promise<ResumoFaturamento> {
  const { where, params } = montarFiltroComEscopo(filtros, escopo);

  const [totaisRows] = await pool.query<RowDataPacket[]>(
    `SELECT ${SELECT_AGREGADO},
            COUNT(DISTINCT CONCAT_WS('|', origem_dados, cd_filial, nf, serie)) AS qtde_notas,
            MAX(atualizado_em) AS atualizado_em
     FROM etl_fatcom WHERE ${where}`,
    params,
  );
  const totais = totaisRows[0] ?? ({} as RowDataPacket);
  const agregadoTotal = montarAgregado(totais, 'total');

  // Devoluções vêm de fora do filtro de operação — o KPI as mostra ao lado do
  // bruto, mesmo quando a tela está vendo só saídas.
  const filtroDevolucoes = montarFiltroComEscopo({ ...filtros, tipoOperacao: 'E' }, escopo);
  const [devolucoesRows] = await pool.query<RowDataPacket[]>(
    `SELECT COALESCE(SUM(vt_merc), 0) AS total FROM etl_fatcom WHERE ${filtroDevolucoes.where}`,
    filtroDevolucoes.params,
  );

  const qtdeNotas = Number(totais.qtde_notas ?? 0);
  const itens = agregadoTotal.itens;
  const itensComCusto = Number(totais.itens_com_custo ?? 0);

  const [evolucaoMensal, porCanal, porMarca, porUf, porEmpresa] = await Promise.all([
    agregarPorPeriodo(filtros, escopo),
    agregarPor('canal', filtros, escopo),
    agregarPor('marca', filtros, escopo),
    agregarPor('uf', filtros, escopo),
    agregarPor('dc_filial', filtros, escopo),
  ]);

  return {
    kpis: {
      faturamentoBruto: agregadoTotal.faturamento,
      devolucoes: Number(devolucoesRows[0]?.total ?? 0),
      faturamentoLiquido: agregadoTotal.liquido,
      qtdeNotas,
      qtdeItens: itens,
      ticketMedio: qtdeNotas > 0 ? agregadoTotal.faturamento / qtdeNotas : 0,
      margem: agregadoTotal.margem,
      percMargem: agregadoTotal.percMargem,
      coberturaCusto: itens > 0 ? (itensComCusto / itens) * 100 : 0,
    },
    evolucaoMensal,
    porCanal,
    porMarca,
    porUf,
    porEmpresa,
    atualizadoEm: (totais.atualizado_em as Date | null) ?? null,
  };
}

/** Evolução mensal sai em ordem cronológica, não por valor — é uma série temporal. */
async function agregarPorPeriodo(filtros: FiltroFaturamento, escopo: EmpresaPermitida[]): Promise<AgregadoFaturamento[]> {
  const { where, params } = montarFiltroComEscopo(filtros, escopo);
  const [linhas] = await pool.query<RowDataPacket[]>(
    `SELECT periodo AS rotulo, ${SELECT_AGREGADO}
     FROM etl_fatcom WHERE ${where}
     GROUP BY periodo ORDER BY periodo ASC`,
    params,
  );
  return linhas.map((l) => montarAgregado(l, String(l.rotulo ?? '')));
}

// ---- Opções de filtro ----

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

export interface FiltrosDisponiveis {
  empresas: OpcaoFiltro[];
  marcas: OpcaoFiltro[];
  canais: OpcaoFiltro[];
  origens: OpcaoFiltro[];
  periodo: { minimo: string | null; maximo: string | null };
}

/**
 * As opções saem do próprio fato, não dos cadastros: oferecer uma marca que
 * não tem nenhuma venda produz filtro que devolve tela vazia.
 *
 * Restritas ao escopo do usuário, e não só por estética: listar uma empresa
 * que ele não pode ver já revelaria que ela existe e quanto movimenta assim
 * que aparecesse num rótulo.
 */
export async function buscarFiltrosDisponiveis(escopo: EmpresaPermitida[]): Promise<FiltrosDisponiveis> {
  const { where: esc, params: pEsc } = condicaoEscopo(escopo);

  const [empresas] = await pool.query<RowDataPacket[]>(
    `SELECT cd_filial, MIN(dc_filial) AS dc_filial FROM etl_fatcom WHERE ${esc} GROUP BY cd_filial ORDER BY dc_filial`,
    pEsc,
  );
  const [marcas] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT marca FROM etl_fatcom WHERE ${esc} AND marca <> '' ORDER BY marca`,
    pEsc,
  );
  const [canais] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT canal FROM etl_fatcom WHERE ${esc} AND canal <> '' ORDER BY canal`,
    pEsc,
  );
  const [origens] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT origem_dados FROM etl_fatcom WHERE ${esc} ORDER BY origem_dados`,
    pEsc,
  );
  const [periodo] = await pool.query<RowDataPacket[]>(
    `SELECT MIN(dt_movto) AS minimo, MAX(dt_movto) AS maximo FROM etl_fatcom WHERE ${esc}`,
    pEsc,
  );

  const texto = (linhas: RowDataPacket[], coluna: string): OpcaoFiltro[] =>
    linhas.map((l) => ({ valor: String(l[coluna]), rotulo: String(l[coluna]) }));

  return {
    empresas: empresas.map((e) => ({ valor: String(e.cd_filial), rotulo: String(e.dc_filial) })),
    marcas: texto(marcas, 'marca'),
    canais: texto(canais, 'canal'),
    origens: texto(origens, 'origem_dados'),
    periodo: {
      minimo: periodo[0]?.minimo ? new Date(periodo[0].minimo).toISOString().slice(0, 10) : null,
      maximo: periodo[0]?.maximo ? new Date(periodo[0].maximo).toISOString().slice(0, 10) : null,
    },
  };
}
