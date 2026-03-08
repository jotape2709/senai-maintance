import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.resolve(__dirname, '../data/senai.db');
const SCHEMA_FILE = path.resolve(__dirname, '../sql/schema.sql');

function runSql(sql) {
  return execFileSync('sqlite3', ['-json', DB_FILE, sql], { encoding: 'utf8' });
}

export function initDb() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
  execFileSync('sqlite3', [DB_FILE, schema]);

  // Migration: add priority column to existing databases that predate this column
  try {
    execFileSync('sqlite3', [DB_FILE, "ALTER TABLE maintenance_orders ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium';"], { stdio: 'pipe' });
  } catch { /* column already exists – safe to ignore */ }

  const countRaw = runSql('SELECT COUNT(*) as count FROM machines;');
  const count = JSON.parse(countRaw || '[]')[0]?.count ?? 0;
  if (count === 0) {
    execFileSync('sqlite3', [
      DB_FILE,
      `INSERT INTO machines (name, sector, status) VALUES
      ('Prensa Hidráulica A1', 'Estamparia', 'operational'),
      ('Torno CNC B4', 'Usinagem', 'maintenance'),
      ('Esteira de Montagem C2', 'Montagem', 'operational'),
      ('Robô de Solda D8', 'Soldagem', 'offline');`
    ]);
  }
}

export function query(sql) {
  const out = runSql(sql);
  return JSON.parse(out || '[]');
}

export function escapeValue(value) {
  return String(value).replaceAll("'", "''");
}

export const orderWithMachineQuery = `
SELECT machines.name, maintenance_orders.description
FROM maintenance_orders
JOIN machines
ON maintenance_orders.machine_id = machines.id;
`;
