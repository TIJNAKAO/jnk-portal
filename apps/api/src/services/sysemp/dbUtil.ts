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
 * Brasil aboliu o horário de verão em 2019, então o offset é fixo — não
 * precisa de tabela de fuso nem de `Intl` pra converter.
 */
const OFFSET_BRASILIA_MS = 3 * 60 * 60 * 1000;

/**
 * Instante → texto `"YYYY-MM-DD HH:MM:SS"` no relógio de Brasília, que é
 * como o banco guarda DATETIME (ver
 * Specs/spec_infra_portal_base_monorepo.md, seção 10.1).
 *
 * Só é preciso onde o código monta a string na mão; valores passados como
 * `Date` são serializados pelo driver, que já está configurado no mesmo
 * fuso em `config/database.ts`.
 */
export function paraDatetimeBrasilia(instante: Date): string {
  return new Date(instante.getTime() - OFFSET_BRASILIA_MS).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * SysEmp manda `"2026-08-30 22:41:55.99543"` (e às vezes com timezone,
 * `"...-03"`) — DATETIME do MySQL não aceita fração nem offset. Converte pro
 * formato aceito, ou NULL se não for data válida.
 */
export function dataHoraSysemp(valorBruto: unknown): string | null {
  if (valorBruto === null || valorBruto === undefined || valorBruto === '') return null;

  // A SysEmp fecha o offset só com a hora (`"...-03"`), mas o parser de
  // `Date` do JS exige `±HH:mm` — sem completar, TODA data com fuso vira
  // Invalid Date. Foi o que zerou `datahora_criacao_sysemp` e
  // `datahora_processamento_sysemp` em 1,0 milhão de linhas de sysemp_fila.
  const texto = String(valorBruto).trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');

  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return null;
  return paraDatetimeBrasilia(data);
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
