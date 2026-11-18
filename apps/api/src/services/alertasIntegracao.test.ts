import { describe, expect, test } from 'vitest';
import { decidirAviso, montarEmailAviso, parseDestinatarios } from './alertasIntegracao.js';

describe('parseDestinatarios', () => {
  test('aceita vírgula, ponto e vírgula, espaço e quebra de linha; remove duplicados e caixa', () => {
    expect(parseDestinatarios('TI@jnakao.com.br, ana@x.com;  ti@jnakao.com.br\nbeto@y.com.br')).toEqual([
      'ti@jnakao.com.br',
      'ana@x.com',
      'beto@y.com.br',
    ]);
  });

  test('descarta o que não parece e-mail e aceita vazio/nulo', () => {
    expect(parseDestinatarios('sem-arroba, @x.com, a@b')).toEqual([]);
    expect(parseDestinatarios('')).toEqual([]);
    expect(parseDestinatarios(null)).toEqual([]);
  });
});

describe('decidirAviso', () => {
  test('primeiro erro depois de sucesso (ou sem histórico) avisa FALHA', () => {
    expect(decidirAviso('erro', 'sucesso')).toBe('FALHA');
    expect(decidirAviso('erro', null)).toBe('FALHA');
  });

  test('erro repetido não reenvia', () => {
    expect(decidirAviso('erro', 'erro')).toBeNull();
  });

  test('sucesso depois de erro avisa RECUPERADA; sucesso normal não avisa', () => {
    expect(decidirAviso('sucesso', 'erro')).toBe('RECUPERADA');
    expect(decidirAviso('sucesso', 'sucesso')).toBeNull();
    expect(decidirAviso('sucesso', null)).toBeNull();
  });

  test('rodada cancelada nunca avisa', () => {
    expect(decidirAviso('cancelado', 'erro')).toBeNull();
    expect(decidirAviso('cancelado', 'sucesso')).toBeNull();
  });
});

describe('montarEmailAviso', () => {
  const base = { nomeEntidade: 'Estoque FULL Mercado Livre', chave: 'ml_estoque_full', quando: new Date('2026-11-18T19:33:00Z') };

  test('falha traz nome, mensagem e o horário de Brasília', () => {
    const { assunto, html } = montarEmailAviso('FALHA', { ...base, mensagem: 'Mercado Livre respondeu HTTP 403' });
    expect(assunto).toBe('[Integração] Falha: Estoque FULL Mercado Livre');
    expect(html).toContain('HTTP 403');
    expect(html).toContain('18/11/2026');
    expect(html).toContain('16:33');
  });

  test('escapa HTML da mensagem de erro', () => {
    const { html } = montarEmailAviso('FALHA', { ...base, mensagem: '<script>x</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('recuperação tem assunto próprio', () => {
    const { assunto } = montarEmailAviso('RECUPERADA', { ...base, mensagem: null });
    expect(assunto).toBe('[Integração] Voltou a funcionar: Estoque FULL Mercado Livre');
  });
});
