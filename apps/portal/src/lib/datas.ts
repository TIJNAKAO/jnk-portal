/**
 * Formata uma data-sem-hora (ISO) vinda da API, sem passar pelo fuso do
 * navegador.
 *
 * Uma data como "o último dia do fechamento" não tem hora significativa —
 * o backend sempre a serializa como meia-noite UTC (ver
 * `ultimoDiaDoMes` em `estoqueCustoFechamento.ts`). `toLocaleDateString`
 * formata no fuso do NAVEGADOR: em Brasília (UTC-3), meia-noite UTC de um
 * dia é 21h do dia anterior, e a tela mostraria o dia errado.
 *
 * Usar os getters UTC evita essa conversão — é o mesmo padrão que
 * `LogsImportacaoPage` já usava para o período; agora fica compartilhado.
 */
export function formatarDataUtc(iso: string | null): string {
  if (!iso) return '—';

  const data = new Date(iso);
  const dia = String(data.getUTCDate()).padStart(2, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${data.getUTCFullYear()}`;
}
