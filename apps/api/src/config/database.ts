import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { env } from './env.js';

/**
 * O banco guarda DATETIME no relógio de **Brasília**, não em UTC. Ver
 * Specs/spec_infra_portal_base_monorepo.md, seção 10.1.
 *
 * Há dois caminhos de escrita, e os dois precisam concordar, senão a mesma
 * coluna recebe fusos diferentes dependendo de qual gravou:
 *
 * 1. `Date` passado como parâmetro → serializado pelo **driver**, que usa
 *    a opção `timezone` abaixo.
 * 2. `CURRENT_TIMESTAMP` escrito em SQL (e os `DEFAULT CURRENT_TIMESTAMP`
 *    do DDL) → resolvido pelo **servidor**, que usa o fuso da SESSÃO. O
 *    cluster da DigitalOcean roda em UTC (`@@system_time_zone`), daí o
 *    `SET time_zone` em toda conexão nova.
 */
const FUSO_BRASILIA = '-03:00';

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  timezone: FUSO_BRASILIA,
  dateStrings: false,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: env.db.caCertContent
    ? { ca: env.db.caCertContent, rejectUnauthorized: true }
    : env.db.caCertPath
      ? { ca: readFileSync(env.db.caCertPath, 'utf8'), rejectUnauthorized: true }
      : undefined,
});

// Toda conexão nova do pool nasce em UTC (fuso do servidor) — alinhar com
// o driver antes que ela sirva qualquer query. Falha aqui é logada, não
// engolida: seguir com a sessão em UTC gravaria 3 horas adiantado em
// silêncio, que é exatamente o defeito que a seção 10.1 corrigiu.
pool.on('connection', (connection) => {
  connection.query(`SET time_zone = '${FUSO_BRASILIA}'`).catch((erro: unknown) => {
    console.error('[db] falha ao fixar o fuso da sessão:', erro);
  });
});

export type PoolConnection = mysql.PoolConnection;

/**
 * Executa `fn` dentro de uma transação, com commit/rollback automático.
 * Usar sempre que uma operação escrever em mais de uma tabela relacionada
 * (ex: criar usuário + vínculos de filial + preferências, seção 6.3).
 */
export async function withTransaction<T>(fn: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
