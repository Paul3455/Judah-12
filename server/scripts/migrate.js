import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, tx } from '../src/db.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');

async function waitForDatabase(attempts = 20) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('select 1');
      return;
    } catch (err) {
      if (attempt === attempts) throw err;
      console.log(`[migrate] database not ready (${err.message}), retrying ${attempt}/${attempts}`);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

async function main() {
  await waitForDatabase();
  await pool.query(
    `create table if not exists schema_migrations (
       id text primary key,
       applied_at timestamptz not null default now()
     )`,
  );

  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const applied = await pool.query('select 1 from schema_migrations where id = $1', [file]);
    if (applied.rowCount) {
      console.log(`[migrate] ${file} already applied`);
      continue;
    }
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await tx(async (client) => {
      await client.query(sql);
      await client.query('insert into schema_migrations (id) values ($1)', [file]);
    });
    console.log(`[migrate] applied ${file}`);
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error('[migrate] failed:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
