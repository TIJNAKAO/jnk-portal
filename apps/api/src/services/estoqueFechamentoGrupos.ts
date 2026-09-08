import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';
import type { EmpresaPermitida } from './escopoEmpresas.js';

/**
 * Grupos de empresa do Fechamento de Custo (JNK, CNK2, NK2 —
 * `sysemp_empresa.grupo_empresa`).
 *
 * **A exceção do módulo**, e está no spec por isso (seção 3.6): o escopo
 * do usuário filtra QUAIS GRUPOS ele enxerga, mas, autorizado o grupo, o
 * cálculo varre todas as empresas dele. A Lista de Inventário é peça
 * contábil entregue para fora; se o recorte de quem clicou afetasse o
 * resultado, dois usuários gerariam listas diferentes para o mesmo grupo
 * e período, e a diferença passaria despercebida — os totais parecem
 * plausíveis nos dois casos.
 *
 * NÃO "consertar" isso aplicando o escopo dentro do cálculo.
 */

export interface EmpresaDoGrupo {
  idEmpresa: number;
  razaoSocial: string;
}

export interface GrupoEmpresa {
  grupo: string;
  empresas: EmpresaDoGrupo[];
}

/** Grupo pedido que não está entre os que o usuário enxerga. */
export class GrupoForaDoEscopoError extends Error {
  statusCode = 403;
}

/**
 * Escopo vazio devolve lista vazia, e não a lista inteira: é a diferença
 * entre "não vê nada" e "vê tudo". Só a origem SYSEMP conta — ter a
 * empresa 4 do KPL não pode liberar a 4 da SysEmp, que é outra companhia.
 */
export function filtrarGruposPorEscopo(
  grupos: GrupoEmpresa[],
  escopo: EmpresaPermitida[],
): GrupoEmpresa[] {
  const permitidas = new Set(escopo.filter((e) => e.origem === 'SYSEMP').map((e) => e.cdFilial));
  if (permitidas.size === 0) return [];

  return grupos.filter((g) => g.empresas.some((e) => permitidas.has(e.idEmpresa)));
}

interface EmpresaRow extends RowDataPacket {
  grupo_empresa: string;
  id_empresa: number;
  razao_social: string;
}

/** Todos os grupos existentes, com todas as suas empresas. Sem escopo. */
async function buscarTodosOsGrupos(): Promise<GrupoEmpresa[]> {
  const [linhas] = await pool.query<EmpresaRow[]>(
    `SELECT grupo_empresa, id_empresa, TRIM(razao_social) AS razao_social
       FROM sysemp_empresa
      WHERE grupo_empresa IS NOT NULL AND grupo_empresa <> ''
      ORDER BY grupo_empresa, razao_social`,
  );

  const porGrupo = new Map<string, GrupoEmpresa>();
  for (const l of linhas) {
    const chave = String(l.grupo_empresa);
    let grupo = porGrupo.get(chave);
    if (!grupo) {
      grupo = { grupo: chave, empresas: [] };
      porGrupo.set(chave, grupo);
    }
    grupo.empresas.push({ idEmpresa: Number(l.id_empresa), razaoSocial: String(l.razao_social) });
  }

  return [...porGrupo.values()];
}

export async function buscarGruposPermitidos(escopo: EmpresaPermitida[]): Promise<GrupoEmpresa[]> {
  return filtrarGruposPorEscopo(await buscarTodosOsGrupos(), escopo);
}

/**
 * Resolve o grupo pedido na tela, recusando o que o usuário não enxerga.
 * Toda rota do Fechamento que recebe `grupo` da query string passa por
 * aqui antes de tocar no banco.
 */
export async function exigirGrupoPermitido(
  grupo: string,
  escopo: EmpresaPermitida[],
): Promise<GrupoEmpresa> {
  const permitidos = await buscarGruposPermitidos(escopo);
  const encontrado = permitidos.find((g) => g.grupo === grupo);

  if (!encontrado) {
    throw new GrupoForaDoEscopoError('Sem permissão para este grupo de empresa.');
  }

  return encontrado;
}
