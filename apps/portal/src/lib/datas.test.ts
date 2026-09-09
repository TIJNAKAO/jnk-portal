import { describe, expect, test } from 'vitest';
import { formatarDataUtc } from './datas';

/**
 * `formatarDataUtc` existe porque `toLocaleDateString` usa o fuso do
 * NAVEGADOR do usuário, e uma data-sem-hora vinda da API (ex: o último dia
 * do mês do fechamento) é sempre serializada como meia-noite UTC. Num
 * navegador em Brasília (UTC-3), meia-noite UTC de um dia vira 21h do dia
 * ANTERIOR — a tela mostra "30/08" quando o fechamento é "31/08".
 *
 * A correção é ler os componentes em UTC (getUTCDate/getUTCMonth/
 * getUTCFullYear), o mesmo padrão que `LogsImportacaoPage` já usava.
 */
describe('formatarDataUtc', () => {
  test('meia-noite UTC do último dia de agosto não vira 30, mesmo em fuso negativo', () => {
    // É exatamente o ISO que o backend emite para o período 2026-08:
    // Date.UTC(2026, 8, 0) -> 2026-08-31T00:00:00.000Z.
    expect(formatarDataUtc('2026-08-31T00:00:00.000Z')).toBe('31/08/2026');
  });

  test('formata com zero à esquerda em dia e mês', () => {
    expect(formatarDataUtc('2026-01-05T00:00:00.000Z')).toBe('05/01/2026');
  });

  test('nulo vira travessão', () => {
    expect(formatarDataUtc(null)).toBe('—');
  });
});
