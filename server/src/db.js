import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err.message);
});

export const query = (text, params) => pool.query(text, params);

export async function one(text, params) {
  const result = await pool.query(text, params);
  return result.rows[0] ?? null;
}

export async function many(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

/** Run `fn` inside a transaction; any throw rolls back. */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    try {
      await client.query('rollback');
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }
}
