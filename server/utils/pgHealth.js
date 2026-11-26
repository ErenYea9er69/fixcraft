import pg from 'pg';

const { Pool } = pg;

let pool = null;

/** Returns true when external PostgreSQL connection settings are provided. */
export function isPostgresConfigured(env = process.env) {
  return Boolean(env.DATABASE_URL || env.PGHOST);
}

/** Lazily initializes and returns the shared PostgreSQL connection pool. */
export function getPostgresPool(env = process.env) {
  if (!isPostgresConfigured(env)) {
    return null;
  }
  if (!pool) {
    const options = env.DATABASE_URL
      ? { connectionString: env.DATABASE_URL, connectionTimeoutMillis: 2000 }
      : {
          host: env.PGHOST,
          port: Number(env.PGPORT) || 5432,
          user: env.PGUSER,
          password: env.PGPASSWORD,
          database: env.PGDATABASE,
          connectionTimeoutMillis: 2000,
        };
    pool = new Pool(options);
  }
  return pool;
}

/** Checks PostgreSQL connectivity when configured; returns status string. */
export async function checkPostgresHealth(env = process.env, customPool = null) {
  const activePool = customPool || getPostgresPool(env);
  if (!activePool) {
    return 'not_configured';
  }
  await activePool.query('SELECT 1');
  return 'connected';
}

/** Closes the shared PostgreSQL pool during graceful shutdown. */
export async function closePostgresPool() {
  if (pool) {
    const active = pool;
    pool = null;
    await active.end();
  }
}
