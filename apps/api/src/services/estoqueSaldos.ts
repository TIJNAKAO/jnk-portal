import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { condicaoEscopoDeUmaOrigem, type EmpresaPermitida } from './escopoEmpresas.js';

/**
 * Consulta do saldo de estoque sincronizado da SysEmp
 * (`sysemp_estoque_fisico`, alimentada pela fila — ver
 * Specs/spec_modulo_integracao.md, seção 3.3).
 *
 * Diferente da Curva ABC, que é análise e por isso só olha item com saldo
 * positivo, esta tela é consulta: mostra a linha como ela está, saldo zero
 * ou negativo inclusive. O único corte fixo é `deleted = FALSE`.
 *
 * Escopo por `condicaoEscopoDeUmaOrigem` com origem SYSEMP: a tabela é de
 * uma origem só e não tem coluna de origem, então ter a empresa 4 do KPL
 * não pode liberar a 4 da SysEmp, que é outra companhia.
 */

export interface FiltroSaldos {
  empresas?: number[];
  marcas?: string[];
  busca?: string;
  /** Esconde as linhas zeradas em todos os depósitos. */
  soComSaldo?: boolean;
}

export interface LinhaSaldo extends RowDataPacket {
  id_empresa: number;
  empresa: string | null;
  id_produto: number;
  nome_produto: string | null;
  marca: string | null;
  saldo_disponivel: number | null;
  estoque_principal: number | null;
  estoque_reservado: number | null;
  estoque_importacao: number | null;
  estoque_avarias: number | null;
  estoque_loja: number | null;
  estoque_assistencia: number | null;
  estoque_armazem_externo: number | null;
  custo_formacao: number | null;
  custo_medio: number | null;
  synced_at: string;
}

export interface Ordenacao {
  coluna?: string;
  direcao: 'asc' | 'desc';
}

/** Só colunas desta lista podem ser ordenadas — o valor vem da query string. */
const COLUNAS_ORDENAVEIS: Record<string, string> = {
  empresa: 'e.fantasia',
  id_produto: 'ef.id_produto',
  nome_produto: 'pr.nome_produto',
  marca: 'pr.descricao_marca',
  saldo_disponivel: 'ef.saldo_disponivel',
  estoque_principal: 'ef.estoque_principal',
  estoque_reservado: 'ef.estoque_reservado',
  estoque_importacao: 'ef.estoque_importacao',
  estoque_avarias: 'ef.estoque_avarias',
  estoque_loja: 'ef.estoque_loja',
  estoque_assistencia: 'ef.estoque_assistencia',
  estoque_armazem_externo: 'ef.estoque_armazem_externo',
  custo_formacao: 'ef.custo_formacao',
  custo_medio: 'ef.custo_medio',
  synced_at: 'ef.synced_at',
};

const DE_E_JOINS = `
  FROM sysemp_estoque_fisico ef
  LEFT JOIN sysemp_empresa e ON e.id_empresa = ef.id_empresa
  LEFT JOIN sysemp_produto pr ON pr.id_produto = ef.id_produto`;

/** Depósitos somados quando a tela pede só quem tem saldo. */
const DEPOSITOS = [
  'ef.saldo_disponivel',
  'ef.estoque_principal',
  'ef.estoque_reservado',
  'ef.estoque_importacao',
  'ef.estoque_avarias',
  'ef.estoque_loja',
  'ef.estoque_assistencia',
  'ef.estoque_armazem_externo',
];

/** Monta o WHERE completo: deletados fora, escopo (obrigatório) e filtros da tela. */
export function montarCondicoes(filtro: FiltroSaldos, escopo: EmpresaPermitida[]): { where: string; params: unknown[] } {
  const { where: escopoWhere, params } = condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', 'ef.id_empresa');
  const condicoes = ['ef.deleted = FALSE', escopoWhere];

  // Interseção com o que a tela pediu — pedir empresa fora do escopo
  // descarta o pedido, nunca o concede (o escopo acima continua valendo).
  if (filtro.empresas?.length) {
    condicoes.push(`ef.id_empresa IN (${filtro.empresas.map(() => '?').join(',')})`);
    params.push(...filtro.empresas);
  }

  if (filtro.marcas?.length) {
    condicoes.push(`pr.descricao_marca IN (${filtro.marcas.map(() => '?').join(',')})`);
    params.push(...filtro.marcas);
  }

  if (filtro.busca) {
    condicoes.push('(ef.id_produto = ? OR pr.nome_produto LIKE ? OR pr.codigo_auxiliar LIKE ? OR pr.codigo_barras = ?)');
    const numero = Number(filtro.busca);
    params.push(Number.isInteger(numero) ? numero : -1, `%${filtro.busca}%`, `%${filtro.busca}%`, filtro.busca);
  }

  if (filtro.soComSaldo) {
    // COALESCE porque depósito não usado vem NULL, e NULL numa soma
    // anularia o total inteiro, escondendo item que tem saldo em outro.
    condicoes.push(`(${DEPOSITOS.map((d) => `COALESCE(${d}, 0)`).join(' + ')}) <> 0`);
  }

  return { where: condicoes.join(' AND '), params };
}

export async function buscarSaldosPaginados(
  filtro: FiltroSaldos,
  escopo: EmpresaPermitida[],
  pagina: number,
  tamanhoPagina: number,
  ordenacao: Ordenacao,
): Promise<{ linhas: LinhaSaldo[]; total: number }> {
  const { where, params } = montarCondicoes(filtro, escopo);

  const [contagem] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total ${DE_E_JOINS} WHERE ${where}`, params);
  const total = Number(contagem[0]?.total ?? 0);
  if (total === 0) return { linhas: [], total: 0 };

  const coluna = COLUNAS_ORDENAVEIS[ordenacao.coluna ?? ''] ?? 'pr.nome_produto';
  const direcao = ordenacao.direcao === 'desc' ? 'DESC' : 'ASC';

  const [linhas] = await pool.query<LinhaSaldo[]>(
    `SELECT
       ef.id_empresa,
       e.fantasia AS empresa,
       ef.id_produto,
       pr.nome_produto,
       pr.descricao_marca AS marca,
       ef.saldo_disponivel,
       ef.estoque_principal,
       ef.estoque_reservado,
       ef.estoque_importacao,
       ef.estoque_avarias,
       ef.estoque_loja,
       ef.estoque_assistencia,
       ef.estoque_armazem_externo,
       ef.custo_formacao,
       ef.custo_medio,
       ef.synced_at
     ${DE_E_JOINS}
     WHERE ${where}
     ORDER BY ${coluna} ${direcao}, ef.id_produto, ef.id_empresa
     LIMIT ? OFFSET ?`,
    [...params, tamanhoPagina, (pagina - 1) * tamanhoPagina],
  );

  return { linhas, total };
}

/**
 * Acima disto o Excel fica pesado demais para gerar dentro de uma request.
 * `sysemp_estoque_fisico` tem uma linha por produto × empresa, então o teto
 * cobre o catálogo inteiro nas nove empresas com folga.
 */
export const LIMITE_EXPORTACAO = 300_000;

/** Mesma consulta da tela, sem paginação — para a exportação em Excel. */
export async function buscarSaldosCompletos(
  filtro: FiltroSaldos,
  escopo: EmpresaPermitida[],
  ordenacao: Ordenacao,
): Promise<LinhaSaldo[]> {
  const { linhas } = await buscarSaldosPaginados(filtro, escopo, 1, LIMITE_EXPORTACAO, ordenacao);
  return linhas;
}

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

/**
 * Opções dos seletores da tela, já restritas ao escopo — senão o próprio
 * combo de empresas viraria uma listagem de quem existe no ERP.
 */
export async function buscarFiltrosSaldos(escopo: EmpresaPermitida[]): Promise<{
  empresas: OpcaoFiltro[];
  marcas: OpcaoFiltro[];
  ultimaIntegracao: string | null;
}> {
  const { where, params } = montarCondicoes({}, escopo);

  const [empresas] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT ef.id_empresa, e.fantasia ${DE_E_JOINS} WHERE ${where} ORDER BY e.fantasia`,
    params,
  );
  const [marcas] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT pr.descricao_marca ${DE_E_JOINS} WHERE ${where} AND pr.descricao_marca IS NOT NULL AND pr.descricao_marca <> '' ORDER BY pr.descricao_marca`,
    params,
  );
  const [ultima] = await pool.query<RowDataPacket[]>(`SELECT MAX(ef.synced_at) AS ultima ${DE_E_JOINS} WHERE ${where}`, params);

  return {
    empresas: empresas.map((e) => ({ valor: String(e.id_empresa), rotulo: String(e.fantasia ?? e.id_empresa).trim() })),
    marcas: marcas.map((m) => ({ valor: String(m.descricao_marca), rotulo: String(m.descricao_marca) })),
    ultimaIntegracao: (ultima[0]?.ultima as string | null) ?? null,
  };
}
