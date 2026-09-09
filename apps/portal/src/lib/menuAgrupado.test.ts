import type { PermissaoTela } from '@jnk-portal/shared';
import { describe, expect, test } from 'vitest';
import { agruparTelas } from './menuAgrupado';

/**
 * O agrupamento preserva a ordem em que a API devolve as telas (`ORDER BY
 * m.id, t.id`): um grupo aparece na posição da sua PRIMEIRA tela, não no
 * fim. Sem isso, criar um grupo reordenaria o menu inteiro.
 */

function tela(telaId: number, nomeTela: string, grupoMenu: string | null = null): PermissaoTela {
  return {
    telaId,
    nomeTela,
    rotaTela: `/rota/${telaId}`,
    grupoMenu,
    podeVisualizar: true,
    podeCriar: false,
    podeEditar: false,
    podeDeletar: false,
  };
}

describe('agruparTelas', () => {
  test('tela sem grupo vira item solto', () => {
    expect(agruparTelas([tela(1, 'Curva ABC')])).toEqual([
      { tipo: 'tela', tela: tela(1, 'Curva ABC') },
    ]);
  });

  test('telas do mesmo grupo viram um item de grupo só', () => {
    const itens = agruparTelas([
      tela(1, 'Importar', 'Fechamento Mensal'),
      tela(2, 'Calcular', 'Fechamento Mensal'),
    ]);

    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ tipo: 'grupo', grupo: 'Fechamento Mensal' });
  });

  test('o grupo mantém as telas na ordem recebida', () => {
    const itens = agruparTelas([
      tela(1, 'Importar', 'Fechamento Mensal'),
      tela(2, 'Calcular', 'Fechamento Mensal'),
      tela(3, 'Comparar', 'Fechamento Mensal'),
    ]);

    expect(itens[0]?.tipo === 'grupo' && itens[0].telas.map((t) => t.nomeTela)).toEqual([
      'Importar',
      'Calcular',
      'Comparar',
    ]);
  });

  test('o grupo aparece na posição da sua primeira tela, não no fim', () => {
    const itens = agruparTelas([
      tela(1, 'Curva ABC'),
      tela(2, 'Importar', 'Fechamento Mensal'),
      tela(3, 'Calcular', 'Fechamento Mensal'),
      tela(4, 'Saldo de Estoque'),
    ]);

    expect(itens.map((i) => (i.tipo === 'grupo' ? i.grupo : i.tela.nomeTela))).toEqual([
      'Curva ABC',
      'Fechamento Mensal',
      'Saldo de Estoque',
    ]);
  });

  test('telas do mesmo grupo separadas por outra tela ainda formam um grupo só', () => {
    const itens = agruparTelas([
      tela(1, 'Importar', 'Fechamento Mensal'),
      tela(2, 'Curva ABC'),
      tela(3, 'Calcular', 'Fechamento Mensal'),
    ]);

    expect(itens).toHaveLength(2);
    expect(itens[0]?.tipo === 'grupo' && itens[0].telas).toHaveLength(2);
  });

  test('grupo com uma tela só continua sendo grupo', () => {
    const itens = agruparTelas([tela(1, 'Logs', 'Fechamento Mensal')]);

    expect(itens[0]).toMatchObject({ tipo: 'grupo', grupo: 'Fechamento Mensal' });
  });

  test('dois grupos diferentes não se misturam', () => {
    const itens = agruparTelas([
      tela(1, 'Importar', 'Fechamento Mensal'),
      tela(2, 'Coleta', 'Inventário de TI'),
    ]);

    expect(itens.map((i) => (i.tipo === 'grupo' ? i.grupo : i.tela.nomeTela))).toEqual([
      'Fechamento Mensal',
      'Inventário de TI',
    ]);
  });

  test('grupo em branco conta como sem grupo', () => {
    expect(agruparTelas([tela(1, 'Curva ABC', '')])).toEqual([
      { tipo: 'tela', tela: tela(1, 'Curva ABC', '') },
    ]);
  });

  test('lista vazia devolve lista vazia', () => {
    expect(agruparTelas([])).toEqual([]);
  });
});
