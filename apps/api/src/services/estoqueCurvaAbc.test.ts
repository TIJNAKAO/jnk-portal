import { beforeEach, describe, expect, test, vi } from 'vitest';

const consultas: { sql: string; params: unknown[] }[] = [];

vi.mock('../config/database.js', () => ({
  pool: {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      consultas.push({ sql, params });
      // 1ª chamada: contagem + resumo; 2ª: as linhas da página.
      return [consultas.length === 1 ? [{ total: 10, com_custo_formacao: 2, sem_custo: 3, unidades_sem_custo: 40 }] : []];
    }),
  },
}));

const { buscarCurvaAbcPaginada, buscarCurvaAbcCompleta } = await import('./estoqueCurvaAbc.js');

const ESCOPO = [
  { origem: 'SYSEMP', cdFilial: 2 },
  { origem: 'SYSEMP', cdFilial: 5 },
];

beforeEach(() => {
  consultas.length = 0;
});

describe('Curva ABC: regras no SQL', () => {
  test('kit (produto_kit = 1) fica fora da curva, sempre', async () => {
    await buscarCurvaAbcCompleta({}, ESCOPO);
    expect(consultas[0]?.sql).toContain('p.produto_kit = 0');
  });

  test('custo de formação entra quando o custo médio é zero ou nulo', async () => {
    await buscarCurvaAbcCompleta({}, ESCOPO);
    const sql = consultas[0]?.sql ?? '';
    // O custo médio vem primeiro; a formação só aparece no ramo seguinte.
    expect(sql.indexOf('custo_medio')).toBeGreaterThan(-1);
    expect(sql.indexOf('custo_medio')).toBeLessThan(sql.indexOf('custo_formacao'));
    expect(sql).toContain("'FORMACAO'");
    expect(sql).toContain("'SEM_CUSTO'");
  });

  test('o escopo do usuário continua valendo (empresas fora dele não entram)', async () => {
    await buscarCurvaAbcCompleta({ empresas: [2, 99] }, ESCOPO);
    expect(consultas[0]?.sql).toContain('ef.id_empresa IN (?,?)');
    expect(consultas[0]?.params.slice(0, 2)).toEqual([2, 5]);
  });
});

describe('buscarCurvaAbcPaginada', () => {
  test('devolve o resumo de custo junto com o total', async () => {
    const r = await buscarCurvaAbcPaginada({}, ESCOPO, 1, 50);
    expect(r.total).toBe(10);
    expect(r.resumo).toEqual({ comCustoFormacao: 2, semCusto: 3, unidadesSemCusto: 40 });
  });

  test('faz uma consulta para total+resumo e outra para a página (a CTE não roda 3 vezes)', async () => {
    await buscarCurvaAbcPaginada({}, ESCOPO, 2, 50);
    expect(consultas).toHaveLength(2);
    expect(consultas[1]?.params.slice(-2)).toEqual([50, 50]); // LIMIT, OFFSET da página 2
  });
});
