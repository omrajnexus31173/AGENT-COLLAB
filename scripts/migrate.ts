import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getPool, transaction } from '../src/lib/server/db';

async function main() {
  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(74291301)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const files = (await readdir(resolve('migrations'))).filter((f) => /^\d+.*\.sql$/.test(f)).sort();
    for (const file of files) {
      const sql = await readFile(resolve('migrations', file), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [file]);
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum)
          throw new Error(`Migration ${file} changed after application. Create a new migration.`);
        console.log(`Already applied: ${file}`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [file, checksum]);
      console.log(`Applied: ${file}`);
    }
  });
  console.log('All migrations are up to date.');
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Migration failed');
    process.exitCode = 1;
  })
  .finally(() => getPool().end());
