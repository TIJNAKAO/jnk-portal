import { describe, expect, test } from 'vitest';
import { REGRAS, montarSqlResumo, regraValida } from './auditoriaFiscal.js';

/** Verifica as regras e o SQL gerado; não executa no banco. */

describe('REGRAS', () => {
  test('ids são únicos', () => {
    const ids = REGRAS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('toda condição lê só o fato, com alias f, e não leva parâmetro', () => {
    for (const r of REGRAS) {
      expect(r.condicao).toContain('f.');
      expect(r.condicao).not.toContain('?');
      expect(r.estimativa ?? '').not.toContain('?');
    }
  });

  test('a regra do ICMS na base de PIS/COFINS compara com mercadoria + frete − desconto − ICMS', () => {
    const regra = regraValida('pis_cofins_base_com_icms');
    expect(regra?.condicao).toContain('f.vb_pis > (f.vt_merc + f.vt_frete - f.vt_desconto - f.vt_icms)');
    expect(regra?.estimativa).toContain('(f.aliq_pis + f.aliq_cofins) / 100');
  });

  test('alíquotas do lucro real são 1,65% e 7,6%', () => {
    const regra = regraValida('pis_cofins_aliquota');
    expect(regra?.condicao).toContain('f.aliq_pis - 1.65');
    expect(regra?.condicao).toContain('f.aliq_cofins - 7.6');
  });
});

describe('regraValida', () => {
  test('só aceita regra conhecida', () => {
    expect(regraValida('icms_conta')?.id).toBe('icms_conta');
    expect(regraValida('1 = 1')).toBeUndefined();
    expect(regraValida(undefined)).toBeUndefined();
  });
});

describe('montarSqlResumo', () => {
  test('uma soma de itens e uma de vendas por regra, no mesmo filtro', () => {
    const sql = montarSqlResumo('ent_sai = ?');
    REGRAS.forEach((_, i) => {
      expect(sql).toContain(`AS itens_${i}`);
      expect(sql).toContain(`AS vendas_${i}`);
    });
    expect(sql).toContain('FROM etl_fatcom f WHERE ent_sai = ?');
    // O único parâmetro é o do filtro: as regras não acrescentam nenhum.
    expect((sql.match(/\?/g) ?? []).length).toBe(1);
  });

  test('estimativa só existe nas regras que sabem estimar', () => {
    const sql = montarSqlResumo('1 = 1');
    REGRAS.forEach((r, i) => {
      if (r.estimativa) expect(sql).toContain(`AS estimativa_${i}`);
      else expect(sql).not.toContain(`AS estimativa_${i}`);
    });
  });
});
