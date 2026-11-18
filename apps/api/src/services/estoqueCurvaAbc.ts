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
  /** De onde veio o custo unitário: média, formação (quando a média é zero) ou nenhum (valor 0). */
  origem_custo: 'MEDIO' | 'FORMACAO' | 'SEM_CUSTO';
  vt_custo_geral: number;
  per_valor: number;
  classe_valor: 'A70' | 'B20' | 'C10';
  qtde: number;
  vt_custo: number;
}

/** Quantas linhas do resultado não têm custo médio (custo de formação ou valor zero → classe C). */
export interface ResumoCusto {
  comCustoFormacao: number;
  semCusto: number;
  unidadesSemCusto: number;
}

function montarFiltro(filtros: FiltroCurvaAbc, escopo: EmpresaPermitida[]): { where: string; params: unknown[] } {
  // Kit (produto_kit = 1) fica FORA: o saldo dele não é físico (o estoque mora nos
  // componentes, que já entram na curva) e inflava a base em 83%. O kit montado
  // que vai pronto para o FULL é cadastrado como produto normal e continua dentro.
  const condicoes: string[] = ['ef.deleted = FALSE', 'ef.saldo_disponivel > 0', 'p.produto_kit = 0'];
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
        CASE
          WHEN COALESCE(ef.custo_medio, 0) > 0 THEN 'MEDIO'
          WHEN COALESCE(ef.custo_formacao, 0) > 0 THEN 'FORMACAO'
          ELSE 'SEM_CUSTO'
        END AS origem_custo,
        ef.saldo_disponivel AS qtde,
        (ef.saldo_disponivel * CASE
          WHEN COALESCE(ef.custo_medio, 0) > 0 THEN ef.custo_medio
          WHEN COALESCE(ef.custo_formacao, 0) > 0 THEN ef.custo_formacao
          ELSE 0
        END) AS vt_custo
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
      ordem, dc_filial, cd_produto, dc_produto, marca, origem_custo,
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
): Promise<{ linhas: LinhaCurvaAbc[]; total: number; resumo: ResumoCusto }> {
  const { sql, params } = montarCte(filtros, escopo);

  // Uma consulta só para o total e para o resumo de custo: a curva é calculada
  // uma vez por chamada, então não vale rodar a CTE duas vezes.
  const [totalRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(origem_custo = 'FORMACAO'), 0) AS com_custo_formacao,
            COALESCE(SUM(origem_custo = 'SEM_CUSTO'), 0) AS sem_custo,
            COALESCE(SUM(CASE WHEN origem_custo = 'SEM_CUSTO' THEN qtde ELSE 0 END), 0) AS unidades_sem_custo
       FROM (${sql}) contagem`,
    params,
  );
  const total = Number(totalRows[0]?.total ?? 0);
  const resumo: ResumoCusto = {
    comCustoFormacao: Number(totalRows[0]?.com_custo_formacao ?? 0),
    semCusto: Number(totalRows[0]?.sem_custo ?? 0),
    unidadesSemCusto: Number(totalRows[0]?.unidades_sem_custo ?? 0),
  };

  const offset = (pagina - 1) * tamanhoPagina;
  const [linhas] = await pool.query<LinhaCurvaAbc[]>(`${sql} ORDER BY ordem LIMIT ? OFFSET ?`, [
    ...params,
    tamanhoPagina,
    offset,
  ]);

  return { linhas, total, resumo };
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
