import { describe, expect, test } from 'vitest';
import { coletadoEmBrasilia } from './tiIngestao.js';

/**
 * `coleta.coletado_em` era a única data do payload do agente em **UTC**: o
 * agente monta com `DateTime.UtcNow` (Program.cs), enquanto `data_instalacao`,
 * `ultimo_boot` e `ultima_vez_visto` saem no relógio local da máquina.
 *
 * Enquanto o banco também guardava UTC, os dois combinavam. Quando o banco
 * passou a guardar Brasília (spec de infra, seção 10.1), a migration
 * `024_fuso_brasilia.sql` deixou essa coluna de fora **na premissa errada**
 * de que ela "vem do payload do agente (hora local da maquina)" — e a coleta
 * passou a aparecer 3 horas adiantada na tela.
 *
 * A normalização é na ingestão, e não no agente, de propósito: assim toda
 * máquina já instalada no parque fica correta sem reinstalar nada.
 */
describe('coletadoEmBrasilia', () => {
  test('sem offset, assume UTC — é o que todo agente instalado envia hoje', () => {
    expect(coletadoEmBrasilia('2026-09-04 14:41:14')).toBe('2026-09-04 11:41:14');
  });

  test('aceita o mesmo instante em ISO com T', () => {
    expect(coletadoEmBrasilia('2026-09-04T14:41:14')).toBe('2026-09-04 11:41:14');
  });

  test('Z explícito é UTC', () => {
    expect(coletadoEmBrasilia('2026-09-04T14:41:14Z')).toBe('2026-09-04 11:41:14');
  });

  test('offset explícito manda — agente novo pode mandar o fuso da máquina', () => {
    expect(coletadoEmBrasilia('2026-09-04T11:41:14-03:00')).toBe('2026-09-04 11:41:14');
  });

  test('offset fechado só com a hora não vira Invalid Date', () => {
    // Mesma armadilha que zerou datahora_criacao_sysemp: `Date` do JS exige
    // ±HH:mm, e `-03` sozinho vira Invalid Date silenciosamente.
    expect(coletadoEmBrasilia('2026-09-04T11:41:14-03')).toBe('2026-09-04 11:41:14');
  });

  test('máquina em outro fuso chega no relógio de Brasília', () => {
    // Meio-dia em Lisboa (UTC+1) é 08:00 em Brasília.
    expect(coletadoEmBrasilia('2026-09-04T12:00:00+01:00')).toBe('2026-09-04 08:00:00');
  });

  test('vira meia-noite do dia anterior sem estragar a data', () => {
    expect(coletadoEmBrasilia('2026-09-04 01:30:00')).toBe('2026-09-03 22:30:00');
  });

  test('recusa data inválida em vez de gravar lixo', () => {
    expect(() => coletadoEmBrasilia('nao é data')).toThrow();
  });
});
