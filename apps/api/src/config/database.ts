import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { env } from './env.js';

// timezone: 'Z' força o driver a tratar DATETIME como UTC na leitura e na
// escrita — necessário porque, em hospedagem cloud (DigitalOcean Managed
// Database), API e banco podem estar em regiões/fusos diferentes.
// Ver Specs/spec_infra_portal_base_monorepo.md, seção 9.1.
export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  timezone: 'Z',
  dateStrings: false,
  waitForConnections: true,
  connectionLimit: 10,
  ssl: env.db.caCertContent
    ? { ca: env.db.caCertContent, rejectUnauthorized: true }
    : env.db.caCertPath
      ? { ca: readFileSync(env.db.caCertPath, 'utf8'), rejectUnauthorized: true }
      : undefined,
});

export type PoolConnection = mysql.PoolConnection;

/**
 * Executa `fn` dentro de uma transação, com commit/rollback automático.
 * Usar sempre que uma operação escrever em mais de uma tabela relacionada
 * (ex: criar usuário + vínculos de filial + preferências, seção 5.3).
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
