/**
 * Opsional: jalankan setelah import database.sql untuk reset password semua user.
 * Usage: DB_PASSWORD=xxx node scripts/seed.js
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pos_multicabang',
});

async function main() {
  const pwd = process.env.SEED_PASSWORD || 'Admin123!';
  const hash = await bcrypt.hash(pwd, 10);
  const [r] = await pool.query('UPDATE users SET password_hash = ?', [hash]);
  console.log('Updated passwords for', r.affectedRows, 'users. New password:', pwd);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
