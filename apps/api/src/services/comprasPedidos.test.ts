import { describe, expect, test } from 'vitest';
import type { EmpresaPermitida } from './escopoEmpresas.js';
import { montarCondicoes } from './comprasPedidos.js';

/**
 * Mesma fronteira de segurança das demais consultas sobre dado do ERP:
 * `sysemp_pedido_compra` é de uma origem só (SysEmp), sem coluna de
 * origem — ter a empresa 4 do KPL não pode liberar a 4 da SysEmp.
 */
const ESCOPO: EmpresaPermitida[] = [
  { origem: 'SYSEMP', cdFilial: 1 },
  { origem: 'SYSEMP', cdFilial: 4 },
  { origem: 'KPL', cdFilial: 7 },
];

describe('montarCondicoes', () => {
  test('nunca lista deletado, mesmo sem nenhum filtro', () => {
    expect(montarCondicoes({}, ESCOPO).where).toContain('pc.deleted = FALSE');
  });

  test('restringe às empresas SysEmp do usuário, ignorando as do KPL', () => {
    const { where, params } = montarCondicoes({}, ESCOPO);

    expect(where).toContain('pc.id_empresa IN (?,?)');
    expect(params).toEqual([1, 4]);
  });

  test('escopo vazio gera condição sempre falsa, não ausência de filtro', () => {
    const { where } = montarCondicoes({}, []);

    expect(where).toBe('pc.deleted = FALSE AND 1 = 0');
  });

  test('escopo só de KPL também falha fechado nesta tela', () => {
    expect(montarCondicoes({}, [{ origem: 'KPL', cdFilial: 1 }]).where).toContain('1 = 0');
  });

  test('empresa pedida na tela soma ao escopo, sem substituí-lo', () => {
    const { where, params } = montarCondicoes({ empresas: [9] }, ESCOPO);

    expect(where).toContain('pc.id_empresa IN (?,?)');
    expect(params).toEqual([1, 4, 9]);
  });

  test('filtro de fornecedor entra na condição', () => {
    const { where, params } = montarCondicoes({ fornecedores: [715103] }, ESCOPO);

    expect(where).toContain('pc.id_parceiro_fornecedor IN (?)');
    expect(params).toContain(715103);
  });

  test('filtro de status do pedido entra na condição', () => {
    const { where, params } = montarCondicoes({ statusPedido: ['Pedido Liberado'] }, ESCOPO);

    expect(where).toContain('pc.status_pedido IN (?)');
    expect(params).toContain('Pedido Liberado');
  });

  test('filtro de status da entrega entra na condição', () => {
    const { where, params } = montarCondicoes({ statusEntrega: ['RECEBIDO PARCIAL'] }, ESCOPO);

    expect(where).toContain('pc.status_entrega IN (?)');
    expect(params).toContain('RECEBIDO PARCIAL');
  });

  test('intervalo de data do pedido entra na condição', () => {
    const { where, params } = montarCondicoes({ dataInicio: '2026-09-01', dataFim: '2026-09-30' }, ESCOPO);

    expect(where).toContain('pc.data_pedido >= ?');
    expect(where).toContain('pc.data_pedido <= ?');
    expect(params).toEqual(expect.arrayContaining(['2026-09-01', '2026-09-30']));
  });

  test('só dataInicio filtra sem exigir dataFim', () => {
    const { where } = montarCondicoes({ dataInicio: '2026-09-01' }, ESCOPO);

    expect(where).toContain('pc.data_pedido >= ?');
    expect(where).not.toContain('pc.data_pedido <= ?');
  });
});
