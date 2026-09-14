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

/**
 * Numero do bcp. Campo vazio vira NULL (ha 5.557 deles, legitimos, em
 * VU_MERC e VT_FOB_EURO); campo preenchido mas nao-numerico LANCA, em vez
 * de virar NULL em silencio — um NULL por dado malformado ficaria
 * indistinguivel de um NULL por campo vazio de verdade.
 */
export function decimal(valor: string | undefined): number | null {
  const limpo = String(valor ?? '').trim();
  if (limpo === '') return null;
  const n = Number(limpo);
  if (!Number.isFinite(n)) {
    throw new Error(`Valor numerico invalido vindo do bcp: ${valor}`);
  }
  return n;
}

/**
 * Data ja exportada em ISO pelo SELECT do export (`CONVERT(varchar(10), ...,
 * 23)`). Campo vazio vira NULL; formato fora do ISO LANCA — nao vira NULL
 * em silencio.
 *
 * Isso importa porque o `bcp` que gera o CSV depende desse CONVERT pra
 * garantir ISO (ver JSDoc de `importarCustoUltimaEntrada.ts`). Reexportar
 * sem ele faz o bcp escrever `2016-04-09 00:00:00.000`; se essa funcao
 * devolvesse NULL pra esse formato, as 742.830 datas virariam NULL sem
 * nenhuma mensagem — a tela mostraria a coluna "Entrada" vazia e a
 * contagem de linhas continuaria batendo, escondendo o problema.
 */
export function data(valor: string | undefined): string | null {
  const limpo = String(valor ?? '').trim();
  if (limpo === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpo)) {
    throw new Error(`Data fora do formato ISO vinda do bcp: ${valor}`);
  }
  return limpo;
}
