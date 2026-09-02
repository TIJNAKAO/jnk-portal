import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { condicaoEscopoDeUmaOrigem, type EmpresaPermitida } from './escopoEmpresas.js';

/**
 * Consulta da tabela de preços sincronizada da SysEmp (`sysemp_preco`,
 * alimentada pela fila — ver Specs/spec_modulo_integracao.md, seção 3.3).
 *
 * `sysemp_preco` é de uma origem só, então o escopo entra por
 * `condicaoEscopoDeUmaOrigem` com origem SYSEMP: ter a empresa 4 do KPL não
 * pode liberar a empresa 4 da SysEmp, que é outra companhia.
 *
 * **Linha sem `id_empresa` não aparece pra ninguém.** São as gravadas pela
 * varredura antiga, anterior à migração pra fila, que não trazia a empresa
 * — sem ela não há como decidir quem tem direito de ver aquele preço, e a
 * regra da casa é falhar fechado. Elas somem naturalmente conforme cada
 * produto passa pela fila.
 */

export interface FiltroPrecos {
  empresas?: number[];
  marcas?: string[];
  busca?: string;
  /** Só linhas com promoção vigente na data de hoje. */
  soPromocao?: boolean;
}

export interface LinhaPreco extends RowDataPacket {
  id_empresa: number;
  empresa: string | null;
  id_produto: number;
  nome_produto: string | null;
  marca: string | null;
  nome_tabela: string | null;
  nome_condicao: string | null;
  preco_tabela: number | null;
  preco_promocao: number | null;
  data_inicio_promocao: string | null;
  data_termino_promocao: string | null;
  synced_at: string;
}

export interface Ordenacao {
  coluna?: string;
  direcao: 'asc' | 'desc';
}

/** Só colunas desta lista podem ser ordenadas — o valor vem da query string. */
const COLUNAS_ORDENAVEIS: Record<string, string> = {
  empresa: 'e.fantasia',
  id_produto: 'p.id_produto',
  nome_produto: 'pr.nome_produto',
  marca: 'pr.descricao_marca',
  nome_tabela: 'p.nome_tabela',
  nome_condicao: 'p.nome_condicao',
  preco_tabela: 'p.preco_tabela',
  preco_promocao: 'p.preco_promocao',
  data_inicio_promocao: 'p.data_inicio_promocao',
  data_termino_promocao: 'p.data_termino_promocao',
  synced_at: 'p.synced_at',
};

const DE_E_JOINS = `
  FROM sysemp_preco p
  LEFT JOIN sysemp_empresa e ON e.id_empresa = p.id_empresa
  LEFT JOIN sysemp_produto pr ON pr.id_produto = p.id_produto`;

/** Monta o WHERE completo: escopo (obrigatório) + filtros da tela. */
export function montarCondicoes(
  filtro: FiltroPrecos,
  escopo: EmpresaPermitida[],
): { where: string; params: unknown[] } {
  const { where: escopoWhere, params } = condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', 'p.id_empresa');
  const condicoes = [escopoWhere];

  // Interseção com o que a tela pediu — pedir empresa fora do escopo
  // descarta o pedido, nunca o concede (o escopo acima continua valendo).
  if (filtro.empresas?.length) {
    condicoes.push(`p.id_empresa IN (${filtro.empresas.map(() => '?').join(',')})`);
    params.push(...filtro.empresas);
  }

  if (filtro.marcas?.length) {
    condicoes.push(`pr.descricao_marca IN (${filtro.marcas.map(() => '?').join(',')})`);
    params.push(...filtro.marcas);
  }

  if (filtro.busca) {
    condicoes.push('(p.id_produto = ? OR pr.nome_produto LIKE ? OR pr.codigo_auxiliar LIKE ? OR pr.codigo_barras = ?)');
    const numero = Number(filtro.busca);
    params.push(Number.isInteger(numero) ? numero : -1, `%${filtro.busca}%`, `%${filtro.busca}%`, filtro.busca);
  }

  if (filtro.soPromocao) {
    condicoes.push(
      'p.preco_promocao > 0 AND p.data_inicio_promocao <= CURDATE() AND (p.data_termino_promocao IS NULL OR p.data_termino_promocao >= CURDATE())',
    );
  }

  return { where: condicoes.join(' AND '), params };
}

export async function buscarPrecosPaginados(
  filtro: FiltroPrecos,
  escopo: EmpresaPermitida[],
  pagina: number,
  tamanhoPagina: number,
  ordenacao: Ordenacao,
): Promise<{ linhas: LinhaPreco[]; total: number }> {
  const { where, params } = montarCondicoes(filtro, escopo);

  const [contagem] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total ${DE_E_JOINS} WHERE ${where}`, params);
  const total = Number(contagem[0]?.total ?? 0);
  if (total === 0) return { linhas: [], total: 0 };

  const coluna = COLUNAS_ORDENAVEIS[ordenacao.coluna ?? ''] ?? 'pr.nome_produto';
  const direcao = ordenacao.direcao === 'asc' ? 'ASC' : 'DESC';

  const [linhas] = await pool.query<LinhaPreco[]>(
    `SELECT
       p.id_empresa,
       e.fantasia AS empresa,
       p.id_produto,
       pr.nome_produto,
       pr.descricao_marca AS marca,
       p.nome_tabela,
       p.nome_condicao,
       p.preco_tabela,
       p.preco_promocao,
       p.data_inicio_promocao,
       p.data_termino_promocao,
       p.synced_at
     ${DE_E_JOINS}
     WHERE ${where}
     ORDER BY ${coluna} ${direcao}, p.id_produto, p.id_empresa, p.id_condpagto
     LIMIT ? OFFSET ?`,
    [...params, tamanhoPagina, (pagina - 1) * tamanhoPagina],
  );

  return { linhas, total };
}

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

/**
 * Opções dos seletores da tela, já restritas ao escopo — senão o próprio
 * combo de empresas viraria uma listagem de quem existe no ERP.
 */
export async function buscarFiltrosPrecos(escopo: EmpresaPermitida[]): Promise<{
  empresas: OpcaoFiltro[];
  marcas: OpcaoFiltro[];
  ultimaIntegracao: string | null;
}> {
  const { where, params } = montarCondicoes({}, escopo);

  const [empresas] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT p.id_empresa, e.fantasia ${DE_E_JOINS} WHERE ${where} ORDER BY e.fantasia`,
    params,
  );
  const [marcas] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT pr.descricao_marca ${DE_E_JOINS} WHERE ${where} AND pr.descricao_marca IS NOT NULL AND pr.descricao_marca <> '' ORDER BY pr.descricao_marca`,
    params,
  );
  const [ultima] = await pool.query<RowDataPacket[]>(`SELECT MAX(p.synced_at) AS ultima ${DE_E_JOINS} WHERE ${where}`, params);

  return {
    empresas: empresas.map((e) => ({ valor: String(e.id_empresa), rotulo: String(e.fantasia ?? e.id_empresa).trim() })),
    marcas: marcas.map((m) => ({ valor: String(m.descricao_marca), rotulo: String(m.descricao_marca) })),
    ultimaIntegracao: (ultima[0]?.ultima as string | null) ?? null,
  };
}
