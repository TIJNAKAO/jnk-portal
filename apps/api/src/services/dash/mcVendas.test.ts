import { describe, expect, test } from 'vitest';
import { faixaValida, montarAgregado, montarConsulta, montarLinha } from './mcVendas.js';

/**
 * Montagem das consultas da MC Vendas. Verifica o SQL gerado, não o executa
 * (mesma abordagem de `etl/fatcom.test.ts`).
 */

const ESCOPO = [{ origem: 'SYSEMP', cdFilial: 1 }];

function interrogacoes(sql: string): number {
  return (sql.match(/\?/g) ?? []).length;
}

describe('montarConsulta', () => {
  test('o custo é limitado ao fim do período, e esse parâmetro vem antes dos do WHERE', () => {
    const c = montarConsulta({ dataInicio: '2026-11-01', dataFim: '2026-11-26' }, ESCOPO, true);
    expect(c.from).toContain('periodo <= ?');
    expect(c.params[0]).toBe('2026-11-26');
  });

  test('sem data final, o custo não tem limite de período', () => {
    const c = montarConsulta({}, ESCOPO, true);
    expect(c.from).not.toContain('periodo <= ?');
  });

  test('cada interrogação do SQL tem seu parâmetro', () => {
    const c = montarConsulta(
      { dataInicio: '2026-11-01', dataFim: '2026-11-26', canais: ['A', 'B'], marcas: ['M'], busca: 'broca', faixa: 'lt10' },
      ESCOPO,
      true,
    );
    expect(interrogacoes(`${c.from} ${c.where}`)).toBe(c.params.length);
  });

  test('só saídas entram: devolução não é venda', () => {
    const c = montarConsulta({}, ESCOPO, true);
    expect(c.where).toContain('ent_sai = ?');
    expect(c.params).toContain('S');
  });

  test('escopo vazio não devolve nada', () => {
    expect(montarConsulta({}, [], true).where).toContain('1 = 0');
  });

  test('a faixa só entra quando a consulta pede', () => {
    const comFaixa = montarConsulta({ faixa: 'semcusto' }, ESCOPO, true);
    const semFaixa = montarConsulta({ faixa: 'semcusto' }, ESCOPO, false);
    expect(comFaixa.where).toContain('cst.vu_custo_liq IS NULL');
    expect(semFaixa.where).not.toContain('cst.vu_custo_liq IS NULL');
  });

  test('o custo usado é o líquido do Fechamento, nunca o custo médio do fato', () => {
    const c = montarConsulta({}, ESCOPO, true);
    expect(c.from).toContain('estoque_custo_fechamento');
    expect(c.from).toContain('cst.cst_grupo = f.grupo_empresa AND cst.cst_codigo = f.cd_produto');
  });
});

describe('faixaValida', () => {
  test('aceita só as faixas conhecidas', () => {
    expect(faixaValida('f1520')).toBe('f1520');
    expect(faixaValida('qualquer')).toBeUndefined();
    expect(faixaValida(undefined)).toBeUndefined();
  });
});

describe('montarLinha', () => {
  const base = {
    recno: 1,
    dc_filial: 'EMPRESA',
    dt_movto: '2026-11-26',
    nf: '184512',
    serie: '1',
    uf: 'MG',
    cd_produto: 'FE-1042',
    dc_produto: 'Furadeira',
    marca: 'MARCA',
    canal: 'MERCADO LIVRE',
    qtde: 2,
    vu_merc: 500,
    vt_merc: 1000,
    vt_icms: 120,
    vt_pis: 14.52,
    vt_cofins: 66.88,
    vt_icms_difal: 50,
    vt_fecp: 10,
    vt_tx_fatur: 120,
    vt_add_frete: 30,
    vb_icms: 1000,
    aliq_icms: 12,
    aliq_pis: 1.65,
    aliq_cofins: 7.6,
    vb_pis: 880,
  };

  test('custo líquido chega como texto do banco e vira número', () => {
    const l = montarLinha({ ...base, vu_custo_liq: '250.0000' } as never);
    expect(l.custoLiquidoUnitario).toBe(250);
    expect(l.custoLiquido).toBe(500);
    expect(l.mc).toBeCloseTo(88.6, 6);
    expect(l.percMc).toBeCloseTo(8.86, 6);
    expect(l.faixa).toBe('lt10');
  });

  test('impostos saem separados, com o percentual sobre o valor da venda', () => {
    const l = montarLinha({ ...base, vu_custo_liq: '250.0000' } as never);
    expect(l.icms).toBe(120);
    expect(l.percIcms).toBe(12);
    expect(l.pisCofins).toBeCloseTo(81.4, 6);
    expect(l.percPisCofins).toBeCloseTo(8.14, 6);
    expect(l.difal).toBe(60);
    expect(l.percDifal).toBe(6);
  });

  test('alíquota da nota e peso sobre a venda são números diferentes', () => {
    const l = montarLinha({ ...base, vu_custo_liq: '250.0000' } as never);
    expect(l.aliqIcms).toBe(12);
    expect(l.aliqPisCofins).toBeCloseTo(9.25, 6);
    // 81,40 de PIS/COFINS sobre 1.000 de venda pesa 8,14%, embora a alíquota seja 9,25%.
    expect(l.percPisCofins).toBeCloseTo(8.14, 6);
    expect(l.aliqDifal).toBe(6);
  });

  test('sem custo, custo e MC ficam nulos e a faixa é "sem custo"', () => {
    const l = montarLinha({ ...base, vu_custo_liq: null } as never);
    expect(l.custoLiquido).toBeNull();
    expect(l.mc).toBeNull();
    expect(l.percMc).toBeNull();
    expect(l.faixa).toBe('semcusto');
  });
});

describe('montarAgregado', () => {
  test('a MC é calculada só sobre as vendas com custo', () => {
    const a = montarAgregado({
      itens: 3,
      itens_cc: 2,
      qtde: 5,
      vendas: 1500,
      vendas_cc: 1000,
      custo_cc: 500,
      icms_cc: 120,
      pis_cofins_cc: 81.4,
      difal_cc: 60,
      tarifa_cc: 120,
      frete_cc: 30,
    } as never);
    expect(a.mc).toBeCloseTo(88.6, 6);
    expect(a.percMc).toBeCloseTo(8.86, 6);
    expect(a.cobertura).toBeCloseTo(66.6667, 3);
  });

  test('grupo sem nenhum custo tem MC desconhecida, não zero', () => {
    const a = montarAgregado({ itens: 2, itens_cc: 0, vendas: 800, vendas_cc: 0 } as never);
    expect(a.mc).toBeNull();
    expect(a.percMc).toBeNull();
    expect(a.cobertura).toBe(0);
  });
});
