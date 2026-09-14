/**
 * Conversores do formato do SQL Server (RDW.dbo.KPL_ULT_COMPRA) para o do
 * portal. Ver docs/superpowers/specs/2026-09-14-custo-ultima-entrada-fase1-design.md
 *
 * Ordem exata das colunas no arquivo gerado pelo bcp. O bcp com -c nao
 * escreve cabecalho, entao a ordem aqui e a unica fonte da verdade: mexer
 * nela sem mexer no SELECT do export desalinha a carga inteira em silencio.
 */
export const COLUNAS_LEGADO = [
  'CD_EMPRESA', 'PERIODO', 'CD_PROD', 'DC_PROD', 'MARCA', 'NCM',
  'DT_MOVTO', 'DT_EMISSAO', 'DOCTO', 'SERIE',
  'CD_CLIFOR', 'DC_CLIFOR', 'MUN_CLIFOR', 'UF_CLIFOR',
  'QTDE', 'VU_MERC', 'ALIQ_ICMS', 'ALIQ_RED_ICMS', 'VB_ICMS', 'VT_ICMS',
  'VT_ICMS_ST', 'VT_ST_GNRE', 'ALIQ_IPI', 'VB_IPI', 'VT_IPI',
  'ALIQ_PIS', 'VB_PIS', 'VT_PIS', 'ALIQ_COFINS', 'VB_COFINS', 'VT_COFINS',
  'VT_NF', 'VT_CUSTO', 'VU_CUSTO', 'VT_FOB_EURO', 'CST',
] as const;

/** `'202604'` → `'2026-04-01'`. O portal guarda periodo como DATE no primeiro dia do mes. */
export function periodoParaData(periodo: string): string {
  const limpo = String(periodo ?? '').trim();
  if (!/^\d{6}$/.test(limpo)) {
    throw new Error(`PERIODO fora do formato aaaamm: ${periodo}`);
  }
  const mes = Number(limpo.slice(4, 6));
  if (mes < 1 || mes > 12) {
    throw new Error(`PERIODO com mes invalido: ${periodo}`);
  }
  return `${limpo.slice(0, 4)}-${limpo.slice(4, 6)}-01`;
}

/** Trim; vazio vira NULL. O legado usa CHAR e devolve campo preenchido de espaco. */
export function texto(valor: string | undefined): string | null {
  const limpo = String(valor ?? '').trim();
  return limpo === '' ? null : limpo;
}

/** Numero do bcp; vazio ou nao-numerico vira NULL em vez de NaN. */
export function decimal(valor: string | undefined): number | null {
  const limpo = String(valor ?? '').trim();
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Data ja exportada em ISO pelo SELECT do export; qualquer outro formato vira NULL. */
export function data(valor: string | undefined): string | null {
  const limpo = String(valor ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(limpo) ? limpo : null;
}
