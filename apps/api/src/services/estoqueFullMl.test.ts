import { describe, expect, test } from 'vitest';
import { compararSaldosFull, type SaldoMl, type SaldoSysemp } from './estoqueFullMl.js';

const NOMES = new Map([
  [7, 'AXADOS OFICIAL'],
  [9, 'MAQUINAS'],
]);

function ml(p: Partial<SaldoMl> & Pick<SaldoMl, 'sku' | 'disponivel'>): SaldoMl {
  return { idEmpresa: 7, titulo: 'Anúncio', total: p.disponivel, naoDisponivel: 0, ...p };
}

function sys(p: Partial<SaldoSysemp> & Pick<SaldoSysemp, 'codigoAuxiliar' | 'saldo'>): SaldoSysemp {
  return { idEmpresa: 7, descricao: 'Produto', marca: 'ACME', ...p };
}

describe('compararSaldosFull', () => {
  test('iguais viram OK', () => {
    const [l] = compararSaldosFull([ml({ sku: 'A', disponivel: 5 })], [sys({ codigoAuxiliar: 'A', saldo: 5 })], NOMES);
    expect(l?.situacao).toBe('OK');
    expect(l?.diferenca).toBe(0);
  });

  test('diferentes viram DIVERGENTE com diferença = ML - SysEmp', () => {
    const a = compararSaldosFull([ml({ sku: 'A', disponivel: 8 })], [sys({ codigoAuxiliar: 'A', saldo: 5 })], NOMES);
    const b = compararSaldosFull([ml({ sku: 'A', disponivel: 2 })], [sys({ codigoAuxiliar: 'A', saldo: 5 })], NOMES);
    expect(a[0]).toMatchObject({ situacao: 'DIVERGENTE', diferenca: 3 });
    expect(b[0]).toMatchObject({ situacao: 'DIVERGENTE', diferenca: -3 });
  });

  test('casa SKU ignorando espaços e caixa', () => {
    const r = compararSaldosFull([ml({ sku: ' abc-1 ', disponivel: 4 })], [sys({ codigoAuxiliar: 'ABC-1', saldo: 4 })], NOMES);
    expect(r).toHaveLength(1);
    expect(r[0]?.situacao).toBe('OK');
  });

  test('a comparação usa o ML total, não o disponível', () => {
    // J9918 real: 1 disponível + 32 não disponíveis (30 em transferência) = 33 no total.
    const [l] = compararSaldosFull(
      [ml({ sku: 'A', disponivel: 1, total: 33, naoDisponivel: 32 })],
      [sys({ codigoAuxiliar: 'A', saldo: 33 })],
      NOMES,
    );
    expect(l).toMatchObject({ situacao: 'OK', qtdeMl: 1, totalMl: 33, qtdeSysemp: 33, diferenca: 0 });

    const [d] = compararSaldosFull(
      [ml({ sku: 'B', disponivel: 13, total: 14, naoDisponivel: 1 })],
      [sys({ codigoAuxiliar: 'B', saldo: 44 })],
      NOMES,
    );
    expect(d).toMatchObject({ situacao: 'DIVERGENTE', diferenca: -30 });
  });

  test('kit do SysEmp (produto_kit) sem anúncio no Full não vira SO_SYSEMP', () => {
    const kit = compararSaldosFull([], [sys({ codigoAuxiliar: 'KIT1553', saldo: 49, kit: true })], NOMES);
    const normal = compararSaldosFull([], [sys({ codigoAuxiliar: 'KIT2524', saldo: 24, kit: false })], NOMES);
    expect(kit).toHaveLength(0);
    // "KIT" no nome, mas cadastrado como produto normal: vai pronto para o Full e conta.
    expect(normal[0]).toMatchObject({ situacao: 'SO_SYSEMP', qtdeSysemp: 24 });
  });

  test('kit do SysEmp que TEM anúncio no Full continua sendo comparado', () => {
    const [l] = compararSaldosFull(
      [ml({ sku: 'KIT9', disponivel: 5 })],
      [sys({ codigoAuxiliar: 'KIT9', saldo: 3, kit: true })],
      NOMES,
    );
    expect(l).toMatchObject({ situacao: 'DIVERGENTE', diferenca: 2 });
  });

  test('SKU só no ML vira SO_ML', () => {
    const [l] = compararSaldosFull([ml({ sku: 'A', disponivel: 3 })], [], NOMES);
    expect(l).toMatchObject({ situacao: 'SO_ML', qtdeSysemp: 0, qtdeMl: 3, diferenca: 3 });
  });

  test('SKU vazio no ML não casa com codigo_auxiliar vazio nem some', () => {
    const r = compararSaldosFull([ml({ sku: '', disponivel: 2 })], [sys({ codigoAuxiliar: null, saldo: 9 })], NOMES);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ situacao: 'SO_ML', codigo: '' });
  });

  test('só no SysEmp com saldo positivo vira SO_SYSEMP; saldo zero ou negativo não gera linha', () => {
    const com = compararSaldosFull([], [sys({ codigoAuxiliar: 'A', saldo: 6 })], NOMES);
    const zero = compararSaldosFull([], [sys({ codigoAuxiliar: 'A', saldo: 0 })], NOMES);
    const negativo = compararSaldosFull([], [sys({ codigoAuxiliar: 'A', saldo: -180 })], NOMES);
    expect(com[0]).toMatchObject({ situacao: 'SO_SYSEMP', qtdeMl: 0, qtdeSysemp: 6, diferenca: -6 });
    expect(zero).toHaveLength(0);
    expect(negativo).toHaveLength(0);
  });

  test('soma produtos do SysEmp com o mesmo codigo_auxiliar na empresa', () => {
    const r = compararSaldosFull(
      [ml({ sku: 'ABC-1', disponivel: 7 })],
      [sys({ codigoAuxiliar: 'ABC-1', saldo: 3 }), sys({ codigoAuxiliar: 'ABC-1', saldo: 4 })],
      NOMES,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ qtdeSysemp: 7, situacao: 'OK' });
  });

  test('saldo nulo conta zero e saldo negativo diverge', () => {
    const nulo = compararSaldosFull([ml({ sku: 'A', disponivel: 0 })], [sys({ codigoAuxiliar: 'A', saldo: null })], NOMES);
    const neg = compararSaldosFull([ml({ sku: 'A', disponivel: 0 })], [sys({ codigoAuxiliar: 'A', saldo: -2 })], NOMES);
    expect(nulo[0]?.situacao).toBe('OK');
    expect(neg[0]).toMatchObject({ situacao: 'DIVERGENTE', diferenca: 2 });
  });

  test('empresas diferentes não se misturam', () => {
    const r = compararSaldosFull(
      [ml({ sku: 'A', disponivel: 1, idEmpresa: 7 }), ml({ sku: 'A', disponivel: 1, idEmpresa: 9 })],
      [sys({ codigoAuxiliar: 'A', saldo: 1, idEmpresa: 7 })],
      NOMES,
    );
    expect(r).toHaveLength(2);
    expect(r.find((l) => l.idEmpresa === 9)?.situacao).toBe('SO_ML');
    expect(r.find((l) => l.idEmpresa === 7)?.empresa).toBe('AXADOS OFICIAL');
  });

  test('divergentes vêm primeiro, pela maior diferença absoluta', () => {
    const r = compararSaldosFull(
      [ml({ sku: 'A', disponivel: 5 }), ml({ sku: 'B', disponivel: 10 }), ml({ sku: 'C', disponivel: 1 })],
      [sys({ codigoAuxiliar: 'A', saldo: 5 }), sys({ codigoAuxiliar: 'B', saldo: 0 }), sys({ codigoAuxiliar: 'C', saldo: 3 })],
      NOMES,
    );
    expect(r.map((l) => l.codigo)).toEqual(['B', 'C', 'A']);
  });
});
