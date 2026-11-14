import { getPool } from '../src/lib/server/db';
async function main() {
  const pool = getPool();
  const result = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
  );
  const tables = result.rows.map((r) => r.table_name);
  const required = [
    'users',
    'sessions',
    'provider_connections',
    'agents',
    'missions',
    'tasks',
    'task_dependencies',
    'agent_messages',
    'mission_events',
    'mission_outputs',
    'usage_records',
    'user_preferences',
    'audit_logs',
    'rate_limits',
    'schema_migrations',
  ];
  const missing = required.filter((t) => !tables.includes(t));
  if (missing.length) throw new Error(`Missing tables: ${missing.join(', ')}`);
  const integrity = await pool.query('SELECT * FROM mission_events ORDER BY id DESC LIMIT 1');
  console.log(
    `Database schema OK: ${required.length} required tables. Event log readable (${integrity.rowCount} recent row sampled).`,
  );
  const indexes = await pool.query("SELECT count(*) FROM pg_indexes WHERE schemaname='public'");
  console.log(
    `Indexes: ${indexes.rows[0].count}. PostgreSQL: ${(await pool.query('SHOW server_version')).rows[0].server_version}`,
  );
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Database check failed');
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
