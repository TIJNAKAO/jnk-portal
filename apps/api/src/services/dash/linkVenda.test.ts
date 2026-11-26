import { describe, expect, test } from 'vitest';
import { identificarCanal, montarLinkVenda, primeiroPedido } from './linkVenda.js';

describe('identificarCanal', () => {
  test('reconhece os canais pelo nome livre da SysEmp', () => {
    expect(identificarCanal('MERCADO LIVRE J NAKAO MAQUINAS')).toBe('mercadolivre');
    expect(identificarCanal('FULL ML OFICIAL')).toBe('mercadolivre');
    expect(identificarCanal('Shopee Casa J Nakao')).toBe('shopee');
    expect(identificarCanal('AMAZON FULLFILMENT')).toBe('amazon');
  });

  test('canal sem painel conhecido não é identificado', () => {
    expect(identificarCanal('BALCAO')).toBeNull();
    expect(identificarCanal('B4X')).toBeNull();
    expect(identificarCanal('')).toBeNull();
  });

  test('"ML" no meio de outra palavra não conta', () => {
    expect(identificarCanal('HTMLSHOP')).toBeNull();
  });
});

describe('montarLinkVenda', () => {
  test('Mercado Livre abre o detalhe da venda', () => {
    expect(montarLinkVenda('MERCADO LIVRE', ['2000012345678901'])).toBe(
      'https://www.mercadolivre.com.br/vendas/2000012345678901/detalhe',
    );
  });

  test('usa o primeiro campo que tem o formato do canal', () => {
    expect(montarLinkVenda('MERCADO LIVRE', ['', 'PED-1', '2000012345678901'])).toBe(
      'https://www.mercadolivre.com.br/vendas/2000012345678901/detalhe',
    );
  });

  test('Amazon e Shopee', () => {
    expect(montarLinkVenda('AMAZON', ['701-1234567-7654321'])).toBe(
      'https://sellercentral.amazon.com.br/orders-v3/order/701-1234567-7654321',
    );
    expect(montarLinkVenda('SHOPEE', ['261126ABCDEF12'])).toBe(
      'https://seller.shopee.com.br/portal/sale/order?keyword=261126ABCDEF12',
    );
  });

  test('número fora do formato do canal não vira link', () => {
    expect(montarLinkVenda('MERCADO LIVRE', ['701-1234567-7654321'])).toBeNull();
    expect(montarLinkVenda('AMAZON', ['2000012345678901'])).toBeNull();
  });

  test('canal desconhecido ou sem número não tem link', () => {
    expect(montarLinkVenda('BALCAO', ['2000012345678901'])).toBeNull();
    expect(montarLinkVenda('MERCADO LIVRE', [null, undefined, '  '])).toBeNull();
  });
});

describe('primeiroPedido', () => {
  test('ignora vazio e zero', () => {
    expect(primeiroPedido([null, '', '0', ' 123 '])).toBe('123');
    expect(primeiroPedido([null, ''])).toBeNull();
  });
});
