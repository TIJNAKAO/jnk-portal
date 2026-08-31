import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import { condicaoEscopoDeUmaOrigem, type EmpresaPermitida } from './escopoEmpresas.js';

export interface FiltroCurvaAbc {
  empresas?: number[];
  marcas?: string[];
}

export interface LinhaCurvaAbc extends RowDataPacket {
  ordem: number;
  dc_filial: string;
  cd_produto: string | null;
  dc_produto: string;
  marca: string | null;
  kit: number;
  vt_custo_geral: number;
  per_valor: number;
  classe_valor: 'A70' | 'B20' | 'C10';
  qtde: number;
  vt_custo: number;
}

function montarFiltro(filtros: FiltroCurvaAbc, escopo: EmpresaPermitida[]): { where: string; params: unknown[] } {
  const condicoes: string[] = ['ef.deleted = FALSE', 'ef.saldo_disponivel > 0'];
  const params: unknown[] = [];

  // Escopo do usuário primeiro, sempre: a escolha da tela é aplicada dentro
  // dele, nunca por cima. Estoque só tem dado da SysEmp.
  const escopoSql = condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', 'ef.id_empresa');
  condicoes.push(escopoSql.where);
  params.push(...escopoSql.params);

  if (filtros.empresas?.length) {
    condicoes.push(`ef.id_empresa IN (${filtros.empresas.map(() => '?').join(',')})`);
    params.push(...filtros.empresas);
  }
  if (filtros.marcas?.length) {
    condicoes.push(`p.descricao_marca IN (${filtros.marcas.map(() => '?').join(',')})`);
    params.push(...filtros.marcas);
  }
  return { where: condicoes.join(' AND '), params };
}

/**
 * Curva ABC (classe 70/20/10) do estoque físico, sumarizado por produto x
 * empresa. Calculado on-the-fly a cada consulta — sysemp_estoque_fisico já
 * é atualizado de hora em hora pelo cron, não precisa de tabela ETL própria.
 * Ver Specs/spec_modulo_estoque.md.
 */
function montarCte(filtros: FiltroCurvaAbc, escopo: EmpresaPermitida[]): { sql: string; params: unknown[] } {
  const { where, params } = montarFiltro(filtros, escopo);
  const sql = `
    WITH base AS (
      SELECT
        ef.id_produto,
        ef.id_empresa,
        e.fantasia AS dc_filial,
        p.codigo_auxiliar AS cd_produto,
        p.nome_produto AS dc_produto,
        p.descricao_marca AS marca,
        p.produto_kit AS kit,
        ef.saldo_disponivel AS qtde,
        (ef.saldo_disponivel * COALESCE(ef.custo_medio, 0)) AS vt_custo
      FROM sysemp_estoque_fisico ef
      JOIN sysemp_produto p ON p.id_produto = ef.id_produto
      JOIN sysemp_empresa e ON e.id_empresa = ef.id_empresa
      WHERE ${where}
    ),
    totais AS (
      SELECT COALESCE(SUM(vt_custo), 0) AS vt_custo_geral FROM base
    ),
    ranked AS (
      SELECT
        base.*,
        ROW_NUMBER() OVER (ORDER BY vt_custo DESC, id_produto, id_empresa) AS ordem,
        SUM(vt_custo) OVER (ORDER BY vt_custo DESC, id_produto, id_empresa ROWS UNBOUNDED PRECEDING) AS acumulado,
        totais.vt_custo_geral
      FROM base, totais
    )
    SELECT
      ordem, dc_filial, cd_produto, dc_produto, marca, kit,
      vt_custo_geral,
      CASE WHEN vt_custo_geral = 0 THEN 0 ELSE ROUND(vt_custo / vt_custo_geral * 100, 2) END AS per_valor,
      CASE
        WHEN vt_custo_geral = 0 THEN 'C10'
        WHEN (acumulado / vt_custo_geral) <= 0.70 THEN 'A70'
        WHEN (acumulado / vt_custo_geral) <= 0.90 THEN 'B20'
        ELSE 'C10'
      END AS classe_valor,
      qtde, vt_custo
    FROM ranked
  `;
  return { sql, params };
}

export async function buscarCurvaAbcPaginada(
  filtros: FiltroCurvaAbc,
  escopo: EmpresaPermitida[],
  pagina: number,
  tamanhoPagina: number,
): Promise<{ linhas: LinhaCurvaAbc[]; total: number }> {
  const { sql, params } = montarCte(filtros, escopo);

  const [totalRows] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM (${sql}) contagem`, params);
  const total = totalRows[0]?.total ?? 0;

  const offset = (pagina - 1) * tamanhoPagina;
  const [linhas] = await pool.query<LinhaCurvaAbc[]>(`${sql} ORDER BY ordem LIMIT ? OFFSET ?`, [
    ...params,
    tamanhoPagina,
    offset,
  ]);

  return { linhas, total };
}

export async function buscarCurvaAbcCompleta(
  filtros: FiltroCurvaAbc,
  escopo: EmpresaPermitida[],
): Promise<LinhaCurvaAbc[]> {
  const { sql, params } = montarCte(filtros, escopo);
  const [linhas] = await pool.query<LinhaCurvaAbc[]>(`${sql} ORDER BY ordem`, params);
  return linhas;
}

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

export async function buscarFiltrosDisponiveis(
  escopo: EmpresaPermitida[],
): Promise<{ empresas: OpcaoFiltro[]; marcas: OpcaoFiltro[] }> {
  // Listar uma empresa fora do escopo já revelaria que ela existe.
  const esc = condicaoEscopoDeUmaOrigem(escopo, 'SYSEMP', 'id_empresa');
  const [empresas] = await pool.query<RowDataPacket[]>(
    `SELECT id_empresa, fantasia FROM sysemp_empresa WHERE ativa = TRUE AND ${esc.where} ORDER BY fantasia`,
    esc.params,
  );
  const [marcas] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT descricao_marca FROM sysemp_produto WHERE descricao_marca IS NOT NULL AND descricao_marca <> '' ORDER BY descricao_marca`,
  );

  return {
    empresas: empresas.map((e) => ({ valor: String(e.id_empresa), rotulo: e.fantasia as string })),
    marcas: marcas.map((m) => ({ valor: m.descricao_marca as string, rotulo: m.descricao_marca as string })),
  };
}
