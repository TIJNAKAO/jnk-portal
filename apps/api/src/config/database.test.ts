import { describe, expect, test, vi } from 'vitest';
import { fixarFusoDaSessao, type ConexaoCoreMysql } from './database.js';

/**
 * Regressão do incidente em que o portal parou de falar com o banco.
 *
 * O `pool` é do `mysql2/promise`, mas o evento 'connection' **não** entrega
 * a conexão com promise: o PromisePool só repassa o evento cru do pool core
 * (mysql2, lib/promise/pool.js → `inheritEvents`). Então `.query()` ali
 * devolve um `Query`, cujo `.then()`/`.catch()` lançam de propósito
 * (lib/commands/query.js).
 *
 * O estrago é onde a exceção cai: o pool emite 'connection' na linha
 * imediatamente anterior ao `cb(null, connection)` que devolve a conexão a
 * quem a pediu (lib/base/pool.js). Lançar ali pula o callback, e a query
 * fica pendurada pra sempre — sem erro, sem crash, sem timeout, porque o
 * pool não tem `acquireTimeout`. Só conexão **nova** passa por esse
 * caminho, então o pool morria uma conexão por vez até esgotar as 10.
 */

/** Imita o `Query` do mysql2: emissor de eventos, não promise. */
function queryDoMysql2() {
  const naoEhPromise = () => {
    throw new Error(
      'You have tried to call .then(), .catch(), or invoked await on the result of query that is not a promise',
    );
  };
  return { then: naoEhPromise, catch: naoEhPromise };
}

/** Duplo da conexão core: só responde pela API de callback. */
function conexaoCore(erroDoServidor: unknown = null) {
  const sqlExecutado: string[] = [];
  const conexao = {
    sqlExecutado,
    query(sql: string, callback?: (erro: unknown) => void) {
      sqlExecutado.push(sql);
      if (callback) {
        callback(erroDoServidor);
      }
      return queryDoMysql2();
    },
  };
  return conexao;
}

describe('fixarFusoDaSessao', () => {
  test('fixa o fuso da sessão sem deixar exceção escapar para o pool', () => {
    const conexao = conexaoCore();

    expect(() => fixarFusoDaSessao(conexao as unknown as ConexaoCoreMysql)).not.toThrow();
    expect(conexao.sqlExecutado).toEqual(["SET time_zone = '-03:00'"]);
  });

  test('loga a falha do SET time_zone sem lançar', () => {
    const conexao = conexaoCore(new Error('acesso negado'));
    const console_ = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => fixarFusoDaSessao(conexao as unknown as ConexaoCoreMysql)).not.toThrow();
    expect(console_).toHaveBeenCalledWith('[db] falha ao fixar o fuso da sessão:', expect.any(Error));

    console_.mockRestore();
  });
});
