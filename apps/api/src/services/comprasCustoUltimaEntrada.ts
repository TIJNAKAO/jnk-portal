import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

export interface FiltroCusto {
  periodo?: string;
  empresa?: string;
  produto?: string;
  pagina: number;
  tamanho: number;
}

export interface LinhaCusto extends RowDataPacket {
  id: number;
  periodo: string;
  origem: string;
  empresa: string;
  cd_produto: string;
  descricao_produto: string | null;
  marca: string | null;
  dt_movto: string | null;
  documento: string | null;
  dc_clifor: string | null;
  qtde: string | null;
  vu_custo: string | null;
  vt_custo: string | null;
  produto_encontrado: number;
}

/** Monta WHERE e parametros uma vez so, pra contagem e pagina usarem o mesmo filtro. */
function montarFiltro(filtro: FiltroCusto): { where: string; params: unknown[] } {
  const condicoes: string[] = [];
  const params: unknown[] = [];

  if (filtro.periodo) {
    condicoes.push('periodo = ?');
    params.push(filtro.periodo);
  }
  if (filtro.empresa) {
    condicoes.push('empresa = ?');
    params.push(filtro.empresa);
  }
  if (filtro.produto) {
    condicoes.push('(cd_produto LIKE ? OR descricao_produto LIKE ?)');
    params.push(`%${filtro.produto}%`, `%${filtro.produto}%`);
  }

  return { where: condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '', params };
}

export async function buscarCustoUltimaEntradaPaginado(filtro: FiltroCusto) {
  const { where, params } = montarFiltro(filtro);

  const [totais] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM compras_custo_ultima_entrada ${where}`,
    params,
  );
  const total = Number(totais[0]?.total ?? 0);

  const offset = (filtro.pagina - 1) * filtro.tamanho;
  const [linhas] = await pool.query<LinhaCusto[]>(
    `SELECT id, periodo, origem, empresa, cd_produto, descricao_produto, marca,
            dt_movto, documento, dc_clifor, qtde, vu_custo, vt_custo, produto_encontrado
       FROM compras_custo_ultima_entrada
       ${where}
      ORDER BY periodo DESC, empresa, cd_produto
      LIMIT ? OFFSET ?`,
    [...params, filtro.tamanho, offset],
  );

  return { linhas, total };
}

export async function buscarPeriodosDisponiveis(): Promise<string[]> {
  const [linhas] = await pool.query<RowDataPacket[]>(
    'SELECT DISTINCT periodo FROM compras_custo_ultima_entrada ORDER BY periodo DESC',
  );
  return linhas.map((l) => String(l.periodo));
}
