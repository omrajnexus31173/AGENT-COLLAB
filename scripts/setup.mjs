import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const path = '.env.local';
if (existsSync(path)) {
  console.log('.env.local already exists; no settings or secrets were changed.');
} else {
  const password = randomBytes(24).toString('hex');
  const key = randomBytes(32).toString('base64');
  const content = `DATABASE_URL=postgresql://nexus:${password}@127.0.0.1:54329/nexus\nPOSTGRES_PASSWORD=${password}\nCREDENTIAL_ENCRYPTION_KEY=${key}\nAPP_ORIGIN=http://localhost:3000\nALLOW_LOCAL_PROVIDERS=false\nTRUST_PROXY=false\nNEXUS_RUN_LIVE_TESTS=false\n`;
  writeFileSync(path, content, { mode: 0o600, flag: 'wx' });
  console.log(
    'Created .env.local with random local database and encryption secrets. Values were not printed.',
  );
}
console.log(
  'Next: start `npm run db:start` in one terminal, then run `npm run db:migrate` and `npm run dev`.',
);
