/**
 * Tokens de cor dos gráficos.
 *
 * As duas cores de série vêm da paleta categórica de referência (slots 1 e 2)
 * e foram **validadas por script**, não escolhidas a olho, contra a superfície
 * branca dos cards do portal:
 *
 *   validate_palette.js "#2a78d6,#eb6834" --mode light --surface "#ffffff"
 *   faixa de luminosidade PASS · piso de croma PASS · separação para daltonismo
 *   PASS (ΔE 24,7 protan / 32,7 tritan) · visão normal PASS (ΔE 33,6) ·
 *   contraste ≥ 3:1 PASS
 *
 * Ao trocar qualquer cor daqui, rode o validador de novo — "parecem
 * diferentes o bastante" é exatamente o erro que ele existe para pegar.
 *
 * O portal não tem modo escuro, então só os valores de modo claro existem.
 */

/** Identidade de série. Atribuídas em ordem fixa: a cor segue a entidade, nunca a posição no ranking. */
export const SERIE_1 = '#2a78d6';
export const SERIE_2 = '#eb6834';

/** Cromo do gráfico — recessivo de propósito: linha fina, sem tracejado. */
export const GRADE = '#e1e0d9';
export const EIXO = '#c3c2b7';
export const TEXTO_EIXO = '#898781';
export const TEXTO_SECUNDARIO = '#52514e';

/** Cores de estado. Reservadas: nunca reaproveitadas como "série 3". */
export const POSITIVO = '#0ca30c';
export const NEGATIVO = '#d03b3b';

export function moeda(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function moedaExata(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

export function percentual(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Rótulo de eixo compacto — "1,5 mi" em vez de "R$ 1.500.000". */
export function moedaCompacta(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return String(v);
}

/** `202603` → `mar/26`. */
export function rotuloPeriodo(periodo: string): string {
  if (!/^\d{6}$/.test(periodo)) return periodo;
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${meses[Number(periodo.slice(4, 6)) - 1]}/${periodo.slice(2, 4)}`;
}
