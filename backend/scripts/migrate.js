/**
 * Menjalankan file SQL di database/migrations secara berurutan.
 * Hanya file yang belum ada di tabel schema_migrations yang dieksekusi.
 *
 * Usage (dari folder backend):
 *   npm run migrate
 *
 * Env DB: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (sama seperti server).
 * Opsional: MIGRATIONS_DIR = path absolut ke folder .sql
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MIGRATIONS_DIR = path.join(__dirname, '../../database/migrations');

async function main() {
  const migrationsDir = process.env.MIGRATIONS_DIR || DEFAULT_MIGRATIONS_DIR;

  if (!fs.existsSync(migrationsDir)) {
    console.error('Folder migrasi tidak ada:', migrationsDir);
    process.exit(1);
  }

  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pos_multicabang',
    multipleStatements: true,
  });

  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [appliedRows] = await conn.query(`SELECT filename FROM schema_migrations ORDER BY filename`);
    const done = new Set(appliedRows.map((r) => r.filename));

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      console.log('Tidak ada file .sql di', migrationsDir);
      return;
    }

    for (const file of files) {
      if (done.has(file)) {
        console.log('[skip]', file);
        continue;
      }

      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8').trim();
      if (!sql) {
        console.warn('[skip kosong]', file);
        continue;
      }

      console.log('[run]', file);
      await conn.query(sql);
      await conn.query(`INSERT INTO schema_migrations (filename) VALUES (?)`, [file]);
      console.log('[ok]', file);
    }
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
