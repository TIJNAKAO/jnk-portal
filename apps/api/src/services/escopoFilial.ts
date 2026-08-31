import type { RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

/**
 * Escopo de filiais por usuário.
 *
 * Duas dimensões que não se confundem (Specs/spec_config_filial.md, seção 3):
 *
 * - **Permissão** — o que o usuário PODE ver, em `usuarios_filiais`. Fronteira
 *   de segurança: aplicada no servidor, falha fechada, não contornável pela
 *   query string.
 * - **Foco** — o que ele ESTÁ vendo agora, pelo seletor da barra lateral.
 *   Conveniência: o usuário troca à vontade. Filtra, nunca amplia.
 */

export interface FilialPermitida {
  /** Chave em `config_filial`, usada pelas tabelas do portal. */
  recno: number;
  /** `SYSEMP`, `KPL` ou `MANUAL`. */
  origem: string;
  /** Código no ERP de origem, usado pelas tabelas de fato. */
  cdFilial: number;
  nome: string;
  grupo: string;
  empresa: string | null;
}

interface FilialRow extends RowDataPacket {
  recno: number;
  origem_dados: string;
  cd_filial: number;
  dc_fantasia: string;
  grupo: string;
  empresa: string | null;
}

export async function buscarFiliaisPermitidas(usuarioId: number): Promise<FilialPermitida[]> {
  const [linhas] = await pool.query<FilialRow[]>(
    `SELECT cf.recno, cf.origem_dados, cf.cd_filial, cf.dc_fantasia, cf.grupo, cf.empresa
     FROM usuarios_filiais uf
     JOIN config_filial cf ON cf.recno = uf.filial_id
     WHERE uf.usuario_id = ? AND cf.ativa = TRUE
     ORDER BY cf.origem_dados, cf.cd_filial`,
    [usuarioId],
  );
  return linhas.map((l) => ({
    recno: l.recno,
    origem: l.origem_dados,
    cdFilial: l.cd_filial,
    nome: l.dc_fantasia,
    grupo: l.grupo,
    empresa: l.empresa,
  }));
}

/**
 * Aplica a filial em foco. `null` significa "todas as permitidas".
 *
 * Focar uma filial fora da permissão devolve vazio — o seletor filtra dentro
 * do que a pessoa já pode ver, e jamais concede acesso novo.
 */
export function aplicarFoco(permitidas: FilialPermitida[], filialAtivaId: number | null): FilialPermitida[] {
  if (filialAtivaId === null) return permitidas;
  return permitidas.filter((f) => f.recno === filialAtivaId);
}

/** Interseção entre o que a tela pediu (por `recno`) e o que o usuário pode ver. */
export function aplicarEscopo(pedidas: number[] | undefined, permitidas: FilialPermitida[]): FilialPermitida[] {
  if (!pedidas?.length) return permitidas;
  const alvo = new Set(pedidas);
  return permitidas.filter((f) => alvo.has(f.recno));
}

/**
 * Condição para as tabelas de fato, que identificam a filial por origem +
 * código: o código 1 é Barueri na SysEmp e JNK Barueri no KPL.
 *
 * Escopo vazio devolve condição sempre falsa, não ausência de condição — a
 * diferença entre não ver nada e ver tudo.
 */
export function condicaoEscopo(
  escopo: FilialPermitida[],
  colunaOrigem = 'origem_dados',
  colunaEmpresa = 'cd_filial',
): { where: string; params: unknown[] } {
  if (escopo.length === 0) return { where: '1 = 0', params: [] };
  return {
    where: `(${escopo.map(() => `(${colunaOrigem} = ? AND ${colunaEmpresa} = ?)`).join(' OR ')})`,
    params: escopo.flatMap((f) => [f.origem, f.cdFilial]),
  };
}

/** Condição para as tabelas do portal, que apontam para `config_filial(recno)`. */
export function condicaoEscopoPorRecno(
  escopo: FilialPermitida[],
  coluna: string,
): { where: string; params: unknown[] } {
  if (escopo.length === 0) return { where: '1 = 0', params: [] };
  return { where: `${coluna} IN (${escopo.map(() => '?').join(',')})`, params: escopo.map((f) => f.recno) };
}
