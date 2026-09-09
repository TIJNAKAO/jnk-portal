/**
 * Converte um valor de DB para número de verdade, para escrever em célula
 * de planilha exportada.
 *
 * mysql2 devolve colunas `DECIMAL`/`NUMERIC` como **string** por padrão —
 * o pool não configura `decimalNumbers: true` (ver `config/database.ts`),
 * de propósito, para não arriscar perda de precisão na conversão pra
 * IEEE754 em nenhum outro lugar do app. `RowDataPacket` costuma tipar
 * esses campos como `number`, mas em runtime chega string ("96.8588").
 *
 * Isso não afeta a TELA: toda formatação lá já faz `Number(v)` antes de
 * `toLocaleString`, que coage a string corretamente. Mas o exceljs
 * escreve exatamente o valor JS que recebe — uma string vira célula de
 * TEXTO, e o Excel mostra "número armazenado como texto": o ponto decimal
 * aparece literal, sem nenhuma formatação de locale (nem `numFmt`, nem
 * separador de milhar).
 *
 * Toda linha exportada para `.xlsx` precisa passar seus campos numéricos
 * por aqui antes de `sheet.addRows()` — não confiar no tipo declarado.
 */
export function numeroXlsx(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
