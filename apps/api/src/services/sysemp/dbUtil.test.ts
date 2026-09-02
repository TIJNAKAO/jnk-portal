import { describe, expect, test } from 'vitest';
import { dataHoraSysemp, paraDatetimeBrasilia } from './dbUtil.js';

/**
 * O banco guarda DATETIME em horário de Brasília (ver
 * Specs/spec_infra_portal_base_monorepo.md, seção 10.1). Instante → texto
 * é a única conversão que o código faz na mão; o resto vai por `Date` e é
 * o driver que serializa.
 */
describe('paraDatetimeBrasilia', () => {
  test('converte instante UTC pro relógio de Brasília', () => {
    expect(paraDatetimeBrasilia(new Date('2026-09-01T18:29:21.000Z'))).toBe('2026-09-01 15:29:21');
  });

  test('atravessa a virada do dia', () => {
    expect(paraDatetimeBrasilia(new Date('2026-09-02T01:30:00.000Z'))).toBe('2026-09-01 22:30:00');
  });

  test('descarta a fração de segundo — DATETIME do MySQL não a aceita aqui', () => {
    expect(paraDatetimeBrasilia(new Date('2026-09-01T18:29:21.581Z'))).toBe('2026-09-01 15:29:21');
  });
});

describe('dataHoraSysemp', () => {
  test('converte o formato que a SysEmp manda, com fração e offset', () => {
    // "-03" no fim: o instante já é 15:29 em Brasília, e é isso que grava.
    expect(dataHoraSysemp('2026-09-01 15:29:21.581023-03')).toBe('2026-09-01 15:29:21');
  });

  test('completa o offset de hora só, que o parser de Date rejeitaria', () => {
    // Sem completar pra "-03:00", `new Date` devolve Invalid Date e a
    // coluna vira NULL — foi o que aconteceu com 1,0 milhão de linhas de
    // sysemp_fila até esta correção.
    expect(new Date('2026-09-01T15:29:21.581023-03').getTime()).toBeNaN();
    expect(dataHoraSysemp('2026-09-01 15:29:21.581023-03')).toBe('2026-09-01 15:29:21');
  });

  test('não estraga offset que já vem completo', () => {
    expect(dataHoraSysemp('2026-09-01 15:29:21-03:00')).toBe('2026-09-01 15:29:21');
  });

  test('converte valor que venha em UTC', () => {
    expect(dataHoraSysemp('2026-08-06T20:17:18.391Z')).toBe('2026-08-06 17:17:18');
  });

  test('sem offset, o valor é lido como horário local do processo', () => {
    // Os jobs rodam em contêiner com TZ de Brasília; sem sufixo, `new Date`
    // interpreta como local, então o texto volta igual ao que entrou.
    expect(dataHoraSysemp('2026-08-06 17:17:18')).toBe('2026-08-06 17:17:18');
  });

  test('vazio, nulo e indefinido viram NULL', () => {
    expect(dataHoraSysemp('')).toBeNull();
    expect(dataHoraSysemp(null)).toBeNull();
    expect(dataHoraSysemp(undefined)).toBeNull();
  });

  test('texto que não é data vira NULL em vez de derrubar o INSERT', () => {
    expect(dataHoraSysemp('sem data')).toBeNull();
  });
});
