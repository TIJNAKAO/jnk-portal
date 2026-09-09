import { describe, expect, test } from 'vitest';
import { categoriaValida, DEFINICAO_CAMPOS } from './parametros.js';

/**
 * `categoriaValida` já foi uma lista separada de categorias
 * (`CATEGORIAS_VALIDAS` em `routes/parametros.ts`), duplicada da chave
 * real de `DEFINICAO_CAMPOS`. Quando ESTOQUE foi adicionado a
 * `DEFINICAO_CAMPOS`, a lista da rota não acompanhou — GET/PUT
 * /parametros/ESTOQUE respondiam 400 "Categoria inválida", e a tela de
 * Configurador → Parâmetros ficava mostrando os campos da categoria
 * anterior (o fetch falhava sem tratamento, sem limpar o estado velho).
 *
 * Agora `categoriaValida` deriva diretamente de `DEFINICAO_CAMPOS` — a
 * única fonte —, então uma categoria nova nunca mais pode ficar
 * cadastrada num lugar e esquecida no outro.
 */
describe('categoriaValida', () => {
  test('toda categoria definida em DEFINICAO_CAMPOS é válida', () => {
    for (const categoria of Object.keys(DEFINICAO_CAMPOS)) {
      expect(categoriaValida(categoria)).toBe(true);
    }
  });

  test('ESTOQUE especificamente é válida', () => {
    expect(categoriaValida('ESTOQUE')).toBe(true);
  });

  test('categoria inexistente é inválida', () => {
    expect(categoriaValida('NAO_EXISTE')).toBe(false);
  });

  test('undefined é inválido', () => {
    expect(categoriaValida(undefined)).toBe(false);
  });

  test('string vazia é inválida', () => {
    expect(categoriaValida('')).toBe(false);
  });
});
