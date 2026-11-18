import { describe, expect, test } from 'vitest';
import {
  EXECUCOES_ESPERADAS_POR_DIA,
  avaliarIntegracoes,
  diaAnteriorBrasilia,
  limiteAtrasoHoras,
  montarEmailResumo,
  type DiaIntegracao,
  type UltimaExecucao,
} from './resumoIntegracoes.js';

const AGORA = new Date('2026-11-19T11:00:00Z'); // 08:00 em Brasília
const nomes = (chave: string) => chave;

function ok(entidade: string, total = 24): DiaIntegracao {
  return { entidade, total, sucesso: total, erro: 0, ultimoErro: null };
}
function ultima(entidade: string, horasAtras: number, status = 'sucesso'): UltimaExecucao {
  return { entidade, status, quando: new Date(AGORA.getTime() - horasAtras * 3_600_000) };
}
function situacaoDe(chave: string, dia: DiaIntegracao[], ultimas: UltimaExecucao[]) {
  return avaliarIntegracoes({ dia, ultimas, agora: AGORA, nomes }).find((l) => l.entidade === chave)?.situacao;
}

describe('avaliarIntegracoes', () => {
  test('rodou o esperado e a última execução é recente → OK', () => {
    expect(situacaoDe('estoque', [ok('estoque')], [ultima('estoque', 0.5)])).toBe('OK');
  });

  test('erro no dia → COM_ERRO, mesmo que a última já tenha sido boa', () => {
    const dia: DiaIntegracao = { entidade: 'estoque', total: 24, sucesso: 23, erro: 1, ultimoErro: 'HTTP 403' };
    expect(situacaoDe('estoque', [dia], [ultima('estoque', 0.5)])).toBe('COM_ERRO');
  });

  test('última execução em erro → COM_ERRO', () => {
    expect(situacaoDe('estoque', [ok('estoque')], [ultima('estoque', 0.5, 'erro')])).toBe('COM_ERRO');
  });

  test('job horário sem rodar há mais de 2,5 h → ATRASADA (o job parou de disparar)', () => {
    expect(situacaoDe('estoque', [ok('estoque', 20)], [ultima('estoque', 3)])).toBe('ATRASADA');
    expect(situacaoDe('estoque', [ok('estoque')], [ultima('estoque', 2)])).toBe('OK');
  });

  test('job diário só é atrasado depois de 26 h', () => {
    expect(situacaoDe('empresas', [ok('empresas', 1)], [ultima('empresas', 25)])).toBe('OK');
    expect(situacaoDe('empresas', [ok('empresas', 1)], [ultima('empresas', 27)])).toBe('ATRASADA');
  });

  test('menos de 80% das execuções esperadas → RODOU_POUCO', () => {
    // 80% de 24 = 19,2: 19 já é pouco; 20 ainda é tolerado (até 4 rodadas perdidas).
    expect(situacaoDe('estoque', [ok('estoque', 19)], [ultima('estoque', 0.5)])).toBe('RODOU_POUCO');
    expect(situacaoDe('estoque', [ok('estoque', 20)], [ultima('estoque', 0.5)])).toBe('OK');
  });

  test('job esperado que nunca rodou → SEM_EXECUCAO', () => {
    expect(situacaoDe('ml_estoque_full', [], [])).toBe('SEM_EXECUCAO');
  });

  test('entidade sem frequência esperada (ex.: ml_pedidos) só é relatada, sem cobrança', () => {
    expect(situacaoDe('ml_pedidos', [ok('ml_pedidos', 1)], [ultima('ml_pedidos', 100)])).toBe('OK');
    expect(situacaoDe('ml_pedidos', [], [])).toBeUndefined();
  });

  test('todas as entidades agendadas aparecem, com os problemas primeiro', () => {
    const linhas = avaliarIntegracoes({
      dia: [{ entidade: 'pedidos', total: 24, sucesso: 22, erro: 2, ultimoErro: 'x' }],
      ultimas: [],
      agora: AGORA,
      nomes,
    });
    expect(linhas).toHaveLength(Object.keys(EXECUCOES_ESPERADAS_POR_DIA).length);
    expect(linhas.every((l) => l.situacao !== 'OK')).toBe(true);
    expect(linhas[0]?.situacao).toBe('COM_ERRO');
  });
});

test('limiteAtrasoHoras distingue job horário de diário', () => {
  expect(limiteAtrasoHoras(24)).toBe(2.5);
  expect(limiteAtrasoHoras(1)).toBe(26);
});

describe('diaAnteriorBrasilia', () => {
  test('às 08:00 de Brasília, "ontem" é o dia anterior', () => {
    expect(diaAnteriorBrasilia(AGORA)).toEqual({
      data: '2026-11-18',
      inicio: '2026-11-18 00:00:00',
      fim: '2026-11-19 00:00:00',
    });
  });

  test('00:30 em Brasília ainda é UTC do mesmo dia e não pode pular o dia', () => {
    expect(diaAnteriorBrasilia(new Date('2026-11-19T03:30:00Z')).data).toBe('2026-11-18');
  });

  test('virada de mês e de ano', () => {
    expect(diaAnteriorBrasilia(new Date('2026-12-01T11:00:00Z')).data).toBe('2026-11-30');
    expect(diaAnteriorBrasilia(new Date('2027-01-01T11:00:00Z')).data).toBe('2026-12-31');
  });
});

describe('montarEmailResumo', () => {
  test('sem problemas: assunto "tudo certo"', () => {
    const linhas = avaliarIntegracoes({
      dia: Object.keys(EXECUCOES_ESPERADAS_POR_DIA).map((c) => ok(c, EXECUCOES_ESPERADAS_POR_DIA[c] ?? 1)),
      ultimas: Object.keys(EXECUCOES_ESPERADAS_POR_DIA).map((c) => ultima(c, 0.5)),
      agora: AGORA,
      nomes,
    });
    expect(montarEmailResumo('2026-11-18', linhas).assunto).toBe('[Integração] Resumo de 18/11/2026: tudo certo');
  });

  test('com problemas: conta no assunto e escapa a mensagem de erro', () => {
    const linhas = avaliarIntegracoes({
      dia: [{ entidade: 'estoque', total: 24, sucesso: 23, erro: 1, ultimoErro: '<b>falha</b>' }],
      ultimas: [ultima('estoque', 0.5)],
      agora: AGORA,
      nomes,
    });
    const { assunto, html } = montarEmailResumo('2026-11-18', linhas);
    expect(assunto).toContain('com problema');
    expect(html).not.toContain('<b>falha</b>');
    expect(html).toContain('&lt;b&gt;falha&lt;/b&gt;');
  });
});
