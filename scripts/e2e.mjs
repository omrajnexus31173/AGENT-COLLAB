import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chromium from '@sparticuz/chromium';
async function main() {
  // Some minimal CI hosts lack NSS/NSPR. Use optional, ignored test-only libs
  // only with the bundled Lambda binary; never alter a system browser launch.
  const libraries = resolve('.data/browser-libs');
  if (!process.env.CHROMIUM_EXECUTABLE_PATH && existsSync(libraries)) {
    process.env.LD_LIBRARY_PATH = [libraries, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  }
  process.env.CHROMIUM_EXECUTABLE_PATH =
    process.env.CHROMIUM_EXECUTABLE_PATH || (await chromium.executablePath());
  const result = spawnSync(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
    { stdio: 'inherit', env: process.env },
  );
  process.exitCode = result.status ?? 1;
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
