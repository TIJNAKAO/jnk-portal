import type { PoolConnection } from '../../config/database.js';

export function valor(origem: Record<string, unknown> | null | undefined, chave: string): unknown {
  const v = origem?.[chave];
  return v === '' || v === undefined ? null : v;
}

export function inteiro(origem: Record<string, unknown> | null | undefined, chave: string): number | null {
  const v = valor(origem, chave);
  return v === null ? null : Number(v);
}

export function booleano(origem: Record<string, unknown> | null | undefined, chave: string): boolean {
  const v = valor(origem, chave);
  return v === 't' || v === true || v === 1 || v === '1';
}

/** Inteiro que trata 0 como ausência — a SysEmp usa `0`/`"0"` para "sem vínculo" em campos de id. */
export function inteiroNaoZero(origem: Record<string, unknown> | null | undefined, chave: string): number | null {
  const n = inteiro(origem, chave);
  return n === null || n === 0 ? null : n;
}

/** `"S"`/`"N"` da SysEmp → boolean. Distinto de `booleano`, que cobre o formato `t`/`1`. */
export function simNao(origem: Record<string, unknown> | null | undefined, chave: string): boolean | null {
  const v = valor(origem, chave);
  if (v === null) return null;
  return v === 'S' || v === 's' || v === true;
}

/**
 * SysEmp manda `"2026-08-30 22:41:55.99543"` (e às vezes com timezone,
 * `"...-03"`) — DATETIME do MySQL não aceita fração nem offset. Converte pro
 * formato aceito, ou NULL se não for data válida.
 */
export function dataHoraSysemp(valorBruto: unknown): string | null {
  if (valorBruto === null || valorBruto === undefined || valorBruto === '') return null;
  const data = new Date(String(valorBruto).replace(' ', 'T'));
  if (Number.isNaN(data.getTime())) return null;
  return data.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Número anulável com proteção contra dado sujo do ERP de origem: valores
 * fora de faixa razoável (ex: `>= 1e14`, lixo de cadastro) ou não numéricos
 * viram NULL em vez de derrubar o INSERT inteiro. Ver
 * Specs/spec_modulo_integracao.md, seção 3.3 (regra de Preço).
 */
export function numeroSeguro(origem: Record<string, unknown> | null | undefined, chave: string, limite = 1e14): number | null {
  const v = valor(origem, chave);
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || Math.abs(n) >= limite) return null;
  return n;
}

/** Insere várias linhas de uma vez (`VALUES (...),(...),...` em blocos de 200). */
export async function inserirEmLote(
  connection: PoolConnection,
  tabela: string,
  colunas: string[],
  linhas: unknown[][],
): Promise<void> {
  if (linhas.length === 0) return;

  for (let i = 0; i < linhas.length; i += 200) {
    const bloco = linhas.slice(i, i + 200);
    const placeholders = bloco.map(() => `(${colunas.map(() => '?').join(',')})`).join(',');
    const valores = bloco.flat();
    await connection.query(`INSERT INTO ${tabela} (${colunas.join(',')}) VALUES ${placeholders}`, valores);
  }
}
