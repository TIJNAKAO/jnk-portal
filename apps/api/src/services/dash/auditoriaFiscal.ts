import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';
import type { EmpresaPermitida } from '../escopoEmpresas.js';
import { montarFiltroComEscopo, type FiltroFaturamento } from '../faturamentoFiltros.js';

/**
 * Auditoria fiscal das NFs de saída: confere a aritmética e a coerência dos
 * impostos destacados em cada item. Ver Specs/spec_modulo_dash.md, seção 3.
 *
 * As regras só usam o que está na própria nota (`etl_fatcom`): base,
 * alíquota e valor. Elas apontam o item cuja conta não fecha ou cuja
 * alíquota foge do regime; **não dizem qual é o imposto certo** — isso
 * depende de NCM, benefício fiscal e destinatário, e é decisão da
 * contabilidade. Cada alerta é um item para olhar, não um erro provado.
 */

/** Diferença em reais abaixo da qual é arredondamento, não divergência. */
const TOLERANCIA = 0.05;

/** Lucro real, regime não cumulativo. */
const ALIQ_PIS = 1.65;
const ALIQ_COFINS = 7.6;

/** Base esperada de PIS/COFINS: mercadoria + frete − desconto, sem o ICMS (exclusão do ICMS da base). */
const BASE_SEM_ICMS = '(f.vt_merc + f.vt_frete - f.vt_desconto - f.vt_icms)';

export interface RegraAuditoria {
  id: string;
  titulo: string;
  /** O que a regra confere e por que importa, em uma frase para a tela. */
  explicacao: string;
  /** Condição SQL sobre `etl_fatcom f`. Verdadeira = item em alerta. */
  condicao: string;
  /**
   * Imposto possivelmente pago a mais (positivo) por item, em SQL, quando a
   * regra permite estimar. Ausente quando não há como pôr número.
   */
  estimativa?: string;
}

export const REGRAS: RegraAuditoria[] = [
  {
    id: 'pis_cofins_base_com_icms',
    titulo: 'PIS/COFINS calculado com o ICMS na base',
    explicacao:
      'A base de PIS/COFINS do item é maior que mercadoria + frete − desconto − ICMS. O ICMS destacado não deveria compor essa base; a diferença é imposto possivelmente pago a mais.',
    condicao: `f.vt_pis + f.vt_cofins > 0 AND f.vt_icms > 0 AND f.vb_pis > ${BASE_SEM_ICMS} + ${TOLERANCIA}`,
    estimativa: `(f.vb_pis - ${BASE_SEM_ICMS}) * (f.aliq_pis + f.aliq_cofins) / 100`,
  },
  {
    id: 'pis_cofins_aliquota',
    titulo: 'Alíquota de PIS ou COFINS fora do lucro real',
    explicacao: `Item com PIS diferente de ${String(ALIQ_PIS).replace('.', ',')}% ou COFINS diferente de ${String(ALIQ_COFINS).replace('.', ',')}%, que são as alíquotas do regime não cumulativo.`,
    condicao: `(f.vt_pis > 0 AND ABS(f.aliq_pis - ${ALIQ_PIS}) > 0.001) OR (f.vt_cofins > 0 AND ABS(f.aliq_cofins - ${ALIQ_COFINS}) > 0.001)`,
  },
  {
    id: 'pis_cofins_conta',
    titulo: 'PIS ou COFINS não bate com base × alíquota',
    explicacao: 'O valor destacado difere da base multiplicada pela alíquota informada no próprio item.',
    condicao: `ABS(f.vt_pis - f.vb_pis * f.aliq_pis / 100) > ${TOLERANCIA} OR ABS(f.vt_cofins - f.vb_cofins * f.aliq_cofins / 100) > ${TOLERANCIA}`,
  },
  {
    id: 'icms_conta',
    titulo: 'ICMS não bate com base × alíquota',
    explicacao: 'O ICMS destacado difere da base de cálculo multiplicada pela alíquota informada no próprio item.',
    condicao: `f.aliq_icms > 0 AND ABS(f.vt_icms - f.vb_icms * f.aliq_icms / 100) > ${TOLERANCIA}`,
  },
  {
    id: 'icms_aliquota_incomum',
    titulo: 'Alíquota de ICMS fora das usuais',
    explicacao:
      'Alíquota diferente de 4%, 7%, 12% (interestaduais) e das internas mais comuns (17% a 23%). Pode ser benefício ou redução legítima; vale conferir.',
    condicao: `f.vt_icms > 0 AND f.aliq_icms NOT IN (4, 7, 12, 17, 17.5, 18, 19, 19.5, 20, 20.5, 21, 22, 22.5, 23)`,
  },
  {
    id: 'sem_pis_cofins',
    titulo: 'Venda sem PIS/COFINS',
    explicacao:
      'Item vendido sem nenhum PIS/COFINS destacado. É o esperado em produto monofásico ou alíquota zero; fora disso, é imposto não recolhido.',
    condicao: `f.vt_merc > 0 AND f.vt_pis + f.vt_cofins = 0`,
  },
  {
    id: 'sem_icms',
    titulo: 'Venda sem ICMS e sem ICMS-ST',
    explicacao:
      'Item vendido sem ICMS próprio e sem substituição tributária destacados. É o esperado quando o ICMS foi retido antes (ST) ou há isenção; fora disso, é imposto não destacado.',
    condicao: `f.vt_merc > 0 AND f.vt_icms = 0 AND f.vt_icms_st = 0`,
  },
];

export function regraValida(id: string | undefined): RegraAuditoria | undefined {
  return REGRAS.find((r) => r.id === id);
}

/** Auditoria olha só saídas: a nota de devolução espelha a de venda e dobraria os alertas. */
type FiltroAuditoria = Omit<FiltroFaturamento, 'tipoOperacao'>;

function montarWhere(filtros: FiltroAuditoria, escopo: EmpresaPermitida[]) {
  return montarFiltroComEscopo({ ...filtros, tipoOperacao: 'S' }, escopo);
}

export interface ResultadoRegra {
  id: string;
  titulo: string;
  explicacao: string;
  itens: number;
  /** Valor de venda dos itens em alerta. */
  vendas: number;
  /** Imposto possivelmente pago a mais, quando a regra permite estimar. */
  estimativa: number | null;
}

export interface ResumoAuditoria {
  itensAnalisados: number;
  regras: ResultadoRegra[];
}

/** Uma consulta só: cada regra vira um par de somas condicionais sobre o mesmo filtro. */
export function montarSqlResumo(where: string): string {
  const somas = REGRAS.map((r, i) => {
    const partes = [
      `COALESCE(SUM(${r.condicao}), 0) AS itens_${i}`,
      `COALESCE(SUM(CASE WHEN ${r.condicao} THEN f.vt_merc END), 0) AS vendas_${i}`,
    ];
    if (r.estimativa) partes.push(`COALESCE(SUM(CASE WHEN ${r.condicao} THEN ${r.estimativa} END), 0) AS estimativa_${i}`);
    return partes.join(', ');
  }).join(',\n       ');

  return `SELECT COUNT(*) AS itens,\n       ${somas}\n  FROM etl_fatcom f WHERE ${where}`;
}

export async function buscarResumoAuditoria(filtros: FiltroAuditoria, escopo: EmpresaPermitida[]): Promise<ResumoAuditoria> {
  const { where, params } = montarWhere(filtros, escopo);
  const [rows] = await pool.query<RowDataPacket[]>(montarSqlResumo(where), params);
  const l = rows[0] ?? ({} as RowDataPacket);

  return {
    itensAnalisados: Number(l.itens ?? 0),
    regras: REGRAS.map((r, i) => ({
      id: r.id,
      titulo: r.titulo,
      explicacao: r.explicacao,
      itens: Number(l[`itens_${i}`] ?? 0),
      vendas: Number(l[`vendas_${i}`] ?? 0),
      estimativa: r.estimativa ? Number(l[`estimativa_${i}`] ?? 0) : null,
    })),
  };
}

export interface LinhaAuditoria {
  recno: number;
  empresa: string;
  data: string;
  nf: string;
  serie: string;
  uf: string;
  canal: string;
  cdProduto: string;
  produto: string;
  ncm: string;
  cfop: string;
  cst: string;
  vendas: number;
  frete: number;
  desconto: number;
  baseIcms: number;
  aliqIcms: number;
  icms: number;
  difal: number;
  basePis: number;
  aliqPis: number;
  pis: number;
  baseCofins: number;
  aliqCofins: number;
  cofins: number;
  estimativa: number | null;
}

/** Teto de itens listados por regra. Quem precisa de todos restringe o período. */
export const LIMITE_LINHAS_AUDITORIA = 500;

export async function buscarLinhasAuditoria(
  filtros: FiltroAuditoria,
  escopo: EmpresaPermitida[],
  regra: RegraAuditoria,
): Promise<LinhaAuditoria[]> {
  const { where, params } = montarWhere(filtros, escopo);

  const [linhas] = await pool.query<RowDataPacket[]>(
    `SELECT f.recno, f.dc_filial, DATE_FORMAT(f.dt_movto, '%Y-%m-%d') AS dt_movto, f.nf, f.serie, f.uf, f.canal,
            f.cd_produto, f.dc_produto, f.ncm, f.cfop, f.cst,
            f.vt_merc, f.vt_frete, f.vt_desconto,
            f.vb_icms, f.aliq_icms, f.vt_icms, f.vt_icms_difal + f.vt_fecp AS difal,
            f.vb_pis, f.aliq_pis, f.vt_pis, f.vb_cofins, f.aliq_cofins, f.vt_cofins,
            ${regra.estimativa ?? 'NULL'} AS estimativa
       FROM etl_fatcom f
      WHERE ${where} AND (${regra.condicao})
      ORDER BY ${regra.estimativa ? 'estimativa DESC' : 'f.vt_merc DESC'}, f.recno ASC
      LIMIT ?`,
    [...params, LIMITE_LINHAS_AUDITORIA],
  );

  return linhas.map((l) => ({
    recno: Number(l.recno),
    empresa: String(l.dc_filial ?? ''),
    data: String(l.dt_movto ?? ''),
    nf: String(l.nf ?? ''),
    serie: String(l.serie ?? ''),
    uf: String(l.uf ?? ''),
    canal: String(l.canal ?? ''),
    cdProduto: String(l.cd_produto ?? ''),
    produto: String(l.dc_produto ?? ''),
    ncm: String(l.ncm ?? ''),
    cfop: String(l.cfop ?? ''),
    cst: String(l.cst ?? ''),
    vendas: Number(l.vt_merc),
    frete: Number(l.vt_frete),
    desconto: Number(l.vt_desconto),
    baseIcms: Number(l.vb_icms),
    aliqIcms: Number(l.aliq_icms),
    icms: Number(l.vt_icms),
    difal: Number(l.difal),
    basePis: Number(l.vb_pis),
    aliqPis: Number(l.aliq_pis),
    pis: Number(l.vt_pis),
    baseCofins: Number(l.vb_cofins),
    aliqCofins: Number(l.aliq_cofins),
    cofins: Number(l.vt_cofins),
    estimativa: l.estimativa === null || l.estimativa === undefined ? null : Number(l.estimativa),
  }));
}
