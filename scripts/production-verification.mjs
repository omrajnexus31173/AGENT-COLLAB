import { chromium } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const base = 'https://nexus-agent-collab.vercel.app';
const evidence = { base, startedAt: new Date().toISOString(), checks: [] };
const record = (name, ok, details = {}, stop = true) => {
  evidence.checks.push({ name, ok, ...details });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (!ok && stop) throw new Error(name);
};
const json = async (path, options = {}) => {
  const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(30000) });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  return { response, body };
};
const post = (path, data, origin = base, cookie, csrf) =>
  json(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-csrf-token': csrf } : {}),
    },
    body: JSON.stringify(data),
  });

const email = `nexus-verification-${Date.now()}-${randomBytes(4).toString('hex')}@example.com`;
const password = randomBytes(24).toString('base64url');
let cookie = '';
let csrf = '';
let userId = '';
let browser;
try {
  const health = await json('/api/health');
  record('database health', health.response.status === 200 && health.body.status === 'ok', { status: health.response.status });

  const favicon = await fetch(base + '/favicon.ico', { signal: AbortSignal.timeout(20000) });
  const faviconBytes = Buffer.from(await favicon.arrayBuffer());
  record('favicon', favicon.status === 200 && /image\/(x-icon|vnd.microsoft.icon)/.test(favicon.headers.get('content-type') || '') && faviconBytes.readUInt16LE(2) === 1, { status: favicon.status, bytes: faviconBytes.length });

  const invalid = await post('/api/auth/signup', { name: 'A', email: 'bad', password: 'short' });
  record('invalid signup rejected', invalid.response.status === 422 && invalid.body.code === 'VALIDATION_ERROR', { status: invalid.response.status, code: invalid.body.code });

  const crossOrigin = await post('/api/auth/signup', { name: 'Verification', email, password }, 'https://attacker.example');
  record('cross-origin signup rejected', crossOrigin.response.status === 403 && crossOrigin.body.code === 'ORIGIN_REJECTED', { status: crossOrigin.response.status, code: crossOrigin.body.code });

  const signup = await post('/api/auth/signup', { name: 'Production Verification', email, password });
  const setCookie = signup.response.headers.getSetCookie()[0] || '';
  cookie = setCookie.split(';')[0];
  csrf = signup.body.csrfToken || '';
  userId = signup.body.user?.id || '';
  record('real production signup', signup.response.status === 201 && Boolean(cookie) && Boolean(csrf) && Boolean(userId), {
    status: signup.response.status,
    requestId: signup.response.headers.get('x-vercel-id'),
    cookieFlags: { httpOnly: /HttpOnly/i.test(setCookie), secure: /Secure/i.test(setCookie), sameSiteLax: /SameSite=lax/i.test(setCookie), path: /Path=\//i.test(setCookie) },
  });

  const duplicate = await post('/api/auth/signup', { name: 'Production Verification', email, password });
  record('duplicate email rejected', duplicate.response.status === 409 && duplicate.body.code === 'CONFLICT', { status: duplicate.response.status, code: duplicate.body.code });

  const session = await json('/api/auth/session', { headers: { cookie } });
  record('signup session created', session.response.status === 200 && session.body.user?.id === userId, { status: session.response.status });

  const dashboard = await json('/api/dashboard', { headers: { cookie } });
  record('protected dashboard API', dashboard.response.status === 200 && dashboard.body.stats?.agents === 6, { status: dashboard.response.status, agents: dashboard.body.stats?.agents });

  const agents = await json('/api/agents', { headers: { cookie } });
  record('protected agents API', agents.response.status === 200 && agents.body.agents?.length === 6, { status: agents.response.status });

  const noCsrf = await json('/api/preferences', { method: 'PUT', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ default_mode: 'round_table', token_budget: 30000, reduced_motion: false, email_notifications: false }) });
  record('missing CSRF rejected', noCsrf.response.status === 403 && noCsrf.body.code === 'CSRF_REJECTED', { status: noCsrf.response.status, code: noCsrf.body.code });

  const prefs = await json('/api/preferences', { method: 'PUT', headers: { cookie, origin: base, 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ default_mode: 'round_table', token_budget: 30000, reduced_motion: false, email_notifications: false }) });
  record('CSRF-protected mutation', prefs.response.status === 200, { status: prefs.response.status });

  const unauth = await json('/api/dashboard');
  record('unauthenticated protected API rejected', unauth.response.status === 401, { status: unauth.response.status });

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failedResponses = [];
  page.on('response', async (r) => { if (r.status() >= 400) { let detail = ''; try { const t = await r.text(); detail = t.startsWith('{') ? t.slice(0, 300) : (t.match(/<title>([^<]*)<\/title>/)?.[1] || t.match(/digest&quot;:&quot;([^&]+)/)?.[1] || ''); } catch {} failedResponses.push({ url: new URL(r.url()).pathname + new URL(r.url()).search, status: r.status(), detail }); } });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const canvasCount = await page.locator('.nexus-canvas canvas').count();
  const concept = await page.locator('.concept-label').textContent();
  record('3D scene renders', canvasCount === 1 && concept?.includes('INTERACTIVE CONCEPT'), { canvasCount, concept: concept?.trim() });
  await page.getByRole('button', { name: 'Aegis', exact: true }).click();
  await page.waitForTimeout(300);
  record('3D node interaction', (await page.locator('.core-label strong').textContent())?.includes('Aegis'));
  record('landing has no browser errors', pageErrors.length === 0 && consoleErrors.length === 0, { pageErrors, consoleErrors, failedResponses }, false);

  await context.addCookies([{ name: 'nexus.session', value: cookie.split('=')[1], domain: 'nexus-agent-collab.vercel.app', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]);
  await page.goto(base + '/dashboard', { waitUntil: 'networkidle' });
  record('browser dashboard auto-login', page.url().endsWith('/dashboard') && await page.getByRole('heading', { name: 'Welcome to the nexus.' }).isVisible());
  await page.reload({ waitUntil: 'networkidle' });
  record('browser refresh persistence', await page.getByRole('heading', { name: 'Welcome to the nexus.' }).isVisible());
  const connectionsResponse = await page.goto(base + '/connections', { waitUntil: 'networkidle' });
  const connectionHeading = await page.getByRole('heading', { name: 'Connection center', exact: true }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
  record('protected browser route', connectionHeading, { url: page.url(), status: connectionsResponse?.status(), headings: await page.locator('h1,h2').allTextContents(), failedResponses }, false);
  await page.goto(base + '/profile', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.waitForURL(base + '/');
  record('browser logout', page.url() === base + '/');

  const oldSession = await json('/api/auth/session', { headers: { cookie } });
  record('logout revokes server session', oldSession.body.user === null, { status: oldSession.response.status });

  await page.goto(base + '/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  const loginResponsePromise = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST', { timeout: 20000 }).catch(() => null);
  await page.getByRole('button', { name: 'Enter your workspace', exact: true }).click();
  const loginResponse = await loginResponsePromise;
  await page.waitForURL(base + '/dashboard', { timeout: 20000 }).catch(() => {});
  const loginHeading = await page.getByRole('heading', { name: 'Welcome to the nexus.' }).waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  record('browser login', loginHeading && page.url() === base + '/dashboard', { url: page.url(), apiStatus: loginResponse?.status(), headings: await page.locator('h1,h2').allTextContents(), pageErrors, consoleErrors, failedResponses }, false);
  const loginSession = await context.cookies();
  record('login session cookie', loginSession.some((c) => c.name === 'nexus.session' && c.httpOnly && c.secure && c.sameSite === 'Lax'));
  record('authenticated browser has no page errors', pageErrors.length === 0, { pageErrors });
  evidence.ok = evidence.checks.every((c) => c.ok);
} catch (error) {
  evidence.ok = false;
  evidence.error = error instanceof Error ? error.message : String(error);
  console.error(evidence.error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  evidence.finishedAt = new Date().toISOString();
  evidence.testAccount = { email, userId };
  writeFileSync('production-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
}
