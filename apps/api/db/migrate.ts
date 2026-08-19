import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';

const dbDir = dirname(fileURLToPath(import.meta.url));

async function main() {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    multipleStatements: true,
    timezone: 'Z',
    ssl: env.db.caCertPath
      ? { ca: readFileSync(env.db.caCertPath, 'utf8'), rejectUnauthorized: true }
      : undefined,
  });

  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nome_arquivo VARCHAR(255) PRIMARY KEY,
      aplicado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [rows] = await connection.query<mysql.RowDataPacket[]>('SELECT nome_arquivo FROM schema_migrations');
  const aplicadas = new Set(rows.map((r) => r.nome_arquivo as string));

  const arquivos = readdirSync(dbDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const arquivo of arquivos) {
    if (aplicadas.has(arquivo)) {
      console.log(`[migrate] já aplicado, pulando: ${arquivo}`);
      continue;
    }
    const sql = readFileSync(join(dbDir, arquivo), 'utf8');
    console.log(`[migrate] aplicando: ${arquivo}`);
    await connection.query(sql);
    await connection.query('INSERT INTO schema_migrations (nome_arquivo) VALUES (?)', [arquivo]);
  }

  console.log('[migrate] concluído.');
  await connection.end();
}

main().catch((error) => {
  console.error('[migrate] falhou:', error);
  process.exit(1);
});
