import { describe, expect, test } from 'vitest';
import { decidirAtualizacao } from './atualizacao';

/**
 * Decisão de recarregar a página quando sai uma versão nova.
 *
 * O caso perigoso não é deixar de recarregar — é recarregar em loop. Se a
 * página voltar ainda na versão antiga (CDN servindo `index.html` em cache,
 * por exemplo), recarregar de novo repetiria para sempre, deixando o portal
 * inutilizável. Por isso a decisão leva em conta o que já foi tentado.
 */

describe('decidirAtualizacao', () => {
  test('não faz nada quando a versão do servidor é a mesma que está rodando', () => {
    expect(decidirAtualizacao({ versaoLocal: 'abc123', versaoServidor: 'abc123', versaoJaTentada: null })).toBe('nada');
  });

  test('recarrega quando o servidor anuncia uma versão diferente', () => {
    expect(decidirAtualizacao({ versaoLocal: 'abc123', versaoServidor: 'def456', versaoJaTentada: null })).toBe(
      'recarregar',
    );
  });

  test('não recarrega duas vezes pela mesma versão — evita o loop infinito', () => {
    // Já recarregamos por causa da def456 e voltamos ainda na abc123:
    // recarregar de novo repetiria para sempre.
    expect(decidirAtualizacao({ versaoLocal: 'abc123', versaoServidor: 'def456', versaoJaTentada: 'def456' })).toBe(
      'pedir-recarga-manual',
    );
  });

  test('volta a recarregar quando surge uma versão ainda mais nova', () => {
    expect(decidirAtualizacao({ versaoLocal: 'abc123', versaoServidor: 'ghi789', versaoJaTentada: 'def456' })).toBe(
      'recarregar',
    );
  });

  test('não faz nada quando não conseguiu saber a versão do servidor', () => {
    // Rede fora, CDN com erro: a última coisa que o usuário precisa é de uma
    // recarga por causa de uma falha de leitura.
    expect(decidirAtualizacao({ versaoLocal: 'abc123', versaoServidor: null, versaoJaTentada: null })).toBe('nada');
  });

  test('não faz nada quando o servidor responde vazio', () => {
    expect(decidirAtualizacao({ versaoLocal: 'abc123', versaoServidor: '', versaoJaTentada: null })).toBe('nada');
  });

  test('não faz nada em desenvolvimento, onde a versão local não é de um build', () => {
    expect(decidirAtualizacao({ versaoLocal: '', versaoServidor: 'def456', versaoJaTentada: null })).toBe('nada');
  });
});
