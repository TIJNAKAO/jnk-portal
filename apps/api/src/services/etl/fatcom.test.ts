import { describe, expect, test } from 'vitest';
import {
  MARGEM_MARCA_DAGUA_MINUTOS,
  SQL_MARCA_DAGUA,
  SQLS_NOTAS_CANDIDATAS,
  TABELA_CANDIDATAS,
  escolherModo,
  montarInsert,
  montarLimpeza,
} from './fatcom.js';

/**
 * Carga incremental do `etl_fatcom` — ver Specs/spec_modulo_faturamento.md,
 * seção 3.7. A versão anterior relia o histórico inteiro de hora em hora e a
 * limpeza de canceladas cruzava todas as notas com todo o fato por expressão
 * calculada; era isso que levava a CPU do banco a 100%.
 */
describe('escolherModo', () => {
  test('sem opções e com marca d’água, roda incremental', () => {
    expect(escolherModo({}, '2026-10-05 10:45:00')).toBe('incremental');
  });

  test('sem nenhuma execução anterior com sucesso, processa tudo', () => {
    expect(escolherModo({}, null)).toBe('completo');
  });

  test('recarga completa ignora a marca d’água', () => {
    expect(escolherModo({ recargaCompleta: true }, '2026-10-05 10:45:00')).toBe('completo');
  });

  test('reprocessar tudo ignora a marca d’água', () => {
    expect(escolherModo({ reprocessarTudo: true }, '2026-10-05 10:45:00')).toBe('completo');
  });
});

describe('montarInsert', () => {
  test('incremental restringe às notas candidatas', () => {
    expect(montarInsert('incremental')).toContain(`JOIN ${TABELA_CANDIDATAS} c ON c.id_nota_saida = nf.id_nota_saida`);
  });

  test('completo não depende da tabela de candidatas', () => {
    expect(montarInsert('completo')).not.toContain(TABELA_CANDIDATAS);
  });

  test('custo continua congelado: fora do ON DUPLICATE KEY UPDATE nos dois modos', () => {
    for (const modo of ['incremental', 'completo'] as const) {
      const atualizacao = montarInsert(modo).split('ON DUPLICATE KEY UPDATE')[1] ?? '';
      expect(atualizacao).not.toMatch(/\bvu_custo\b/);
      expect(atualizacao).not.toMatch(/\bvt_custo\b/);
      expect(atualizacao).toContain('dc_clifor = VALUES(dc_clifor)');
    }
  });
});

describe('montarLimpeza', () => {
  test('incremental só olha as notas candidatas', () => {
    expect(montarLimpeza('incremental')).toContain(`JOIN ${TABELA_CANDIDATAS} c ON c.id_nota_saida = nf.id_nota_saida`);
  });

  test('completo varre todas as notas', () => {
    expect(montarLimpeza('completo')).not.toContain(TABELA_CANDIDATAS);
  });

  test('só apaga linhas da origem SYSEMP', () => {
    expect(montarLimpeza('incremental')).toContain(`f.origem_dados = 'SYSEMP'`);
  });
});

describe('marca d’água', () => {
  test('parte da última execução com sucesso do próprio ETL, recuada pela margem', () => {
    expect(SQL_MARCA_DAGUA).toContain(`entidade = 'etl_fatcom'`);
    expect(SQL_MARCA_DAGUA).toContain(`status = 'sucesso'`);
    expect(SQL_MARCA_DAGUA).toContain(`INTERVAL ${MARGEM_MARCA_DAGUA_MINUTOS} MINUTE`);
  });

  test('margem cobre nota gravada antes da execução e confirmada depois', () => {
    expect(MARGEM_MARCA_DAGUA_MINUTOS).toBeGreaterThanOrEqual(60);
  });
});

describe('notas candidatas', () => {
  test('três fontes: a nota, o cliente e o produto alterados desde a marca', () => {
    const sqls = SQLS_NOTAS_CANDIDATAS.join('\n');

    expect(SQLS_NOTAS_CANDIDATAS).toHaveLength(3);
    expect(sqls).toContain('nf.atualizado_em >= ?');
    expect(sqls).toContain('par.atualizado_em >= ?');
    expect(sqls).toContain('pr.atualizado_em >= ?');
  });

  test('cada fonte grava na tabela de candidatas sem duplicar', () => {
    for (const sql of SQLS_NOTAS_CANDIDATAS) {
      expect(sql).toContain(`INSERT IGNORE INTO ${TABELA_CANDIDATAS}`);
    }
  });
});
