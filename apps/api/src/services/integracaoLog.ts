import { EventEmitter } from 'node:events';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../config/database.js';

/**
 * Log de execução das sincronizações do módulo Integração — porta de
 * `tb_sync_log`/`tb_sync_log_detalhe`, mas sem o `ProgressLogger` paralelo
 * do projeto original (que existia só pra contornar streaming não
 * confiável em PHP-FPM). Aqui uma tabela só, consultada tanto pelo
 * histórico quanto por um emissor em memória usado pelo endpoint SSE de
 * acompanhamento ao vivo. Ver Specs/spec_modulo_integracao.md, seção 2.7.
 */
export const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(50);

export async function iniciar(entidade: string): Promise<number> {
  const [resultado] = await pool.query<ResultSetHeader>(
    'INSERT INTO integracao_log (entidade, status) VALUES (?, ?)',
    [entidade, 'iniciado'],
  );
  return resultado.insertId;
}

interface DetalheParams {
  pagina?: number;
  qtdeRegistros?: number;
  status: 'ok' | 'erro';
  mensagem?: string;
  duracaoMs?: number;
  requestBody?: string;
}

export async function detalhe(idLog: number, params: DetalheParams): Promise<void> {
  const [resultado] = await pool.query<ResultSetHeader>(
    `INSERT INTO integracao_log_detalhe (id_log, pagina, qtde_registros, status, mensagem, duracao_ms, request_body)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      idLog,
      params.pagina ?? null,
      params.qtdeRegistros ?? null,
      params.status,
      params.mensagem ?? null,
      params.duracaoMs ?? null,
      params.requestBody ?? null,
    ],
  );

  const [linhas] = await pool.query<RowDataPacket[]>('SELECT * FROM integracao_log_detalhe WHERE id = ?', [
    resultado.insertId,
  ]);
  logEmitter.emit(`detalhe:${idLog}`, linhas[0]);
}

interface FinalizarParams {
  status: 'sucesso' | 'erro' | 'cancelado';
  qtdeRegistros?: number;
  mensagem?: string;
  duracaoMs?: number;
}

export async function finalizar(idLog: number, params: FinalizarParams): Promise<void> {
  await pool.query(
    'UPDATE integracao_log SET status = ?, qtde_registros = ?, mensagem = ?, duracao_ms = ? WHERE id = ?',
    [params.status, params.qtdeRegistros ?? null, params.mensagem ?? null, params.duracaoMs ?? null, idLog],
  );
  logEmitter.emit(`fim:${idLog}`, params);
}

export async function foiCancelado(idLog: number): Promise<boolean> {
  const [linhas] = await pool.query<RowDataPacket[]>('SELECT status FROM integracao_log WHERE id = ?', [idLog]);
  return linhas[0]?.status === 'cancelado';
}

export interface ResultadoSincronizacao {
  qtde: number;
  cancelado?: boolean;
}

/** Executa uma sincronização como job de background — não bloqueia quem chamou. */
export function executarEmBackground(
  entidade: string,
  tarefa: (idLog: number) => Promise<ResultadoSincronizacao>,
): Promise<number> {
  return iniciar(entidade).then((idLog) => {
    const inicio = Date.now();
    tarefa(idLog)
      .then(({ qtde, cancelado }) =>
        finalizar(idLog, {
          status: cancelado ? 'cancelado' : 'sucesso',
          qtdeRegistros: qtde,
          duracaoMs: Date.now() - inicio,
        }),
      )
      .catch((error: unknown) => {
        console.error(`[integracao] falha na sincronização de ${entidade}:`, error);
        return finalizar(idLog, {
          status: 'erro',
          mensagem: error instanceof Error ? error.message : String(error),
          duracaoMs: Date.now() - inicio,
        });
      });
    return idLog;
  });
}
