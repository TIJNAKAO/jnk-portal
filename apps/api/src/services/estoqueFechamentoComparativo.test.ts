import { describe, expect, test } from 'vitest';
import { compararQuantidades } from './estoqueFechamentoComparativo.js';

/**
 * O Fechamento contábil não distingue almoxarifado; o inventário físico
 * conta PRINCIPAL e AVARIAS separadamente. Somar antes de comparar é o
 * que impede o comparativo de acusar divergência que não existe.
 * Ver Specs/spec_modulo_estoque.md, seção 3.9.
 */
const NOMES = new Map([[7, 'NK2 COMERCIO LTDA']]);

describe('compararQuantidades', () => {
  test('quantidades iguais não divergem', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: 'PARAFUSO', marca: 'ACME', estoque: 10, custo: 2 }],
      [{ idEmpresa: 7, codigo: '0012', marca: 'ACME', contagemFinal: 10 }],
      NOMES,
    );

    expect(linhas[0]?.divergencia).toBe(0);
    expect(linhas[0]?.valorDivergencia).toBe(0);
  });

  test('soma os almoxarifados do inventário antes de comparar', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: 'PARAFUSO', marca: null, estoque: 10, custo: 2 }],
      [
        { idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 7 },
        { idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 3 },
      ],
      NOMES,
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.qtdeInventario).toBe(10);
    expect(linhas[0]?.divergencia).toBe(0);
  });

  test('contagem física maior que o livro dá divergência positiva', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: null, marca: null, estoque: 8, custo: 2 }],
      [{ idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 10 }],
      NOMES,
    );

    expect(linhas[0]?.divergencia).toBe(2);
    expect(linhas[0]?.valorDivergencia).toBe(4);
  });

  test('contagem física menor que o livro dá divergência negativa', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: null, marca: null, estoque: 10, custo: 2 }],
      [{ idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 8 }],
      NOMES,
    );

    expect(linhas[0]?.divergencia).toBe(-2);
    expect(linhas[0]?.valorDivergencia).toBe(-4);
  });

  test('item só no inventário aparece, com fechamento zero', () => {
    const linhas = compararQuantidades(
      [],
      [{ idEmpresa: 7, codigo: '0099', marca: 'ACME', contagemFinal: 5 }],
      NOMES,
    );

    expect(linhas[0]?.qtdeFechamento).toBe(0);
    expect(linhas[0]?.qtdeInventario).toBe(5);
    expect(linhas[0]?.divergencia).toBe(5);
  });

  test('item só no fechamento aparece, com inventário zero', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0077', descricao: 'PORCA', marca: null, estoque: 4, custo: 1 }],
      [],
      NOMES,
    );

    expect(linhas[0]?.qtdeInventario).toBe(0);
    expect(linhas[0]?.divergencia).toBe(-4);
  });

  test('sem custo, o valor da divergência fica nulo em vez de zero', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: null, marca: null, estoque: 8, custo: null }],
      [{ idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 10 }],
      NOMES,
    );

    expect(linhas[0]?.divergencia).toBe(2);
    expect(linhas[0]?.valorDivergencia).toBeNull();
  });

  test('mesmo código em empresas diferentes não se mistura', () => {
    const nomes = new Map([
      [7, 'NK2'],
      [8, 'JNK'],
    ]);
    const linhas = compararQuantidades(
      [
        { idEmpresa: 7, codigo: '0012', descricao: null, marca: null, estoque: 10, custo: 1 },
        { idEmpresa: 8, codigo: '0012', descricao: null, marca: null, estoque: 20, custo: 1 },
      ],
      [{ idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 10 }],
      nomes,
    );

    expect(linhas).toHaveLength(2);
    expect(linhas.find((l) => l.idEmpresa === 8)?.divergencia).toBe(-20);
  });

  test('o nome da empresa vem do grupo, não da planilha', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: null, marca: null, estoque: 1, custo: null }],
      [],
      NOMES,
    );

    expect(linhas[0]?.nomeEmpresa).toBe('NK2 COMERCIO LTDA');
  });

  test('várias linhas de fechamento do mesmo código na mesma empresa somam', () => {
    const linhas = compararQuantidades(
      [
        { idEmpresa: 7, codigo: '0012', descricao: 'PARAFUSO', marca: null, estoque: 6, custo: 2 },
        { idEmpresa: 7, codigo: '0012', descricao: 'PARAFUSO', marca: null, estoque: 4, custo: 2 },
      ],
      [{ idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: 10 }],
      NOMES,
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.qtdeFechamento).toBe(10);
  });

  test('contagem final nula conta como zero contado, não como ausência', () => {
    const linhas = compararQuantidades(
      [{ idEmpresa: 7, codigo: '0012', descricao: null, marca: null, estoque: 5, custo: null }],
      [{ idEmpresa: 7, codigo: '0012', marca: null, contagemFinal: null }],
      NOMES,
    );

    expect(linhas[0]?.qtdeInventario).toBe(0);
    expect(linhas[0]?.divergencia).toBe(-5);
  });
});
