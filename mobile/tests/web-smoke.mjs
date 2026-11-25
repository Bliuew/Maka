// Drives the Expo app's real UI (exported for web) through the main flows,
// against the real Mäka API with sample data, on an iPhone-sized viewport.
// Usage: npm run test:web   (needs Postgres via DATABASE_URL, ffmpeg and Playwright)
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const mobile = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const root = path.resolve(mobile, '..');
const require = createRequire(path.join(root, 'package.json'));
let pw; try { pw = require('playwright'); } catch { pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
const { chromium, devices } = pw.chromium ? pw : pw.default;
const pg = require('pg');

const shots = path.join(mobile, 'tests', 'screens');
fs.mkdirSync(shots, { recursive: true });
const dist = path.join(mobile, 'dist');
if (!process.env.SKIP_EXPORT) execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', dist], { cwd: mobile, stdio: 'inherit', env: { ...process.env, EXPO_PUBLIC_API_URL: '' } });

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maka-mweb-'));
const apiPort = 8900 + Math.floor(Math.random() * 50), webPort = apiPort + 50;
const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/maka';
const schema = 'maka_mweb_' + Math.random().toString(36).slice(2, 10);
const server = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], { cwd: root,
  env: { ...process.env, NODE_ENV: 'development', PORT: String(apiPort), MAKA_DATA_DIR: dataDir, DATABASE_URL: databaseUrl, DATABASE_SCHEMA: schema, INVITE_CODE: '', PUBLIC_ORIGIN: `http://localhost:${webPort}` } });
let log = ''; server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
for (let i = 0; i < 120 && !log.includes('Seeded sample data'); i++) await new Promise((r) => setTimeout(r, 500));
if (!log.includes('Seeded sample data')) { console.error(log); process.exit(1); }

// Same-origin host for the exported app: static files + proxy to the API.
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.ttf': 'font/ttf' };
const web = http.createServer((req, res) => {
  const local = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  const inDist = local.startsWith(dist) && fs.existsSync(local) && fs.statSync(local).isFile();
  if (/^\/(api|media)\//.test(req.url) || (!inDist && /^\/assets\//.test(req.url)) || /^\/(privacy|guidelines)\.html/.test(req.url)) {
    const up = http.request({ host: 'localhost', port: apiPort, path: req.url, method: req.method, headers: req.headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.on('error', () => { res.writeHead(502); res.end(); });
    return req.pipe(up);
  }
  let f = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => web.listen(webPort, r));
const base = `http://localhost:${webPort}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
let n = 0;
const shot = (name) => page.screenshot({ path: path.join(shots, `${String(++n).padStart(2, '0')}-${name}.png`) });
const step = async (name, fn) => { process.stdout.write(`• ${name} … `); await fn(); console.log('ok'); };
const tid = (id) => page.getByTestId(id).filter({ visible: true }).first();
const tab = (label) => page.locator(`[aria-label="${label}"]`).last();
const toast = (re) => page.getByTestId('toast').filter({ hasText: re }).first().waitFor({ timeout: 15000 });

try {
  await step('Welcome shows the approved logo, tagline label and 19+ notice', async () => {
    await page.goto(base);
    await tid('approved-logo').waitFor();
    const label = await tid('approved-logo').evaluate((el) => el.getAttribute('aria-label') || el.querySelector('img')?.getAttribute('alt') || '');
    assert.match(label, /Mäka\. Feel The Power Of Love Within You/);
    assert.match(await tid('approved-logo').evaluate((el) => el.querySelector('img')?.src || ''), /approved-logo/);
    await page.getByText('Strictly 19+.').waitFor();
    await shot('welcome');
  });

  await step('Sign up a test adult', async () => {
    await page.getByRole('button', { name: 'Create account' }).click();
    await tid('su-email').fill('kemi@example.com');
    await tid('su-pass').fill('correct-horse-battery');
    await tid('su-handle').fill('kemi.creates');
    await tid('su-name').fill('Kemi');
    await tid('su-terms').click();
    await tid('su-submit').click();
    await page.getByText('Confirm you’re 19 or older').waitFor();
  });

  await step('Age gate: community is unreachable until verified; ONE method, labelled TEST MODE', async () => {
    await page.goto(base + '/cinema');
    await page.getByText('Confirm you’re 19 or older').waitFor();
    await page.getByText(/^TEST MODE\./).waitFor();
    await page.getByRole('radio', { name: /Digital ID credential/ }).click();
    await shot('age-methods');
    await tid('age-start').click();
    await page.getByText('AGE-VERIFICATION SIMULATOR (TEST ONLY).', { exact: false }).waitFor();
    await tid('sim-verified').click();
    await tid('feed').waitFor({ timeout: 20000 });
  });

  await step('Full-screen vertical feed autoplays video', async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('video')].some((v) => v.currentTime > 0.3 && !v.paused), null, { timeout: 20000 });
    await shot('feed-for-you');
  });

  await step('Tap pauses the video', async () => {
    await tid('story-surface').click();
    await page.waitForFunction(() => [...document.querySelectorAll('video')].every((v) => v.paused), null, { timeout: 5000 });
  });

  await step('Double-tap likes', async () => {
    const like = tid('like');
    await tid('story-surface').dblclick();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=like]')].some((b) => /Like, 1 likes/.test(b.getAttribute('aria-label') || '')), null, { timeout: 8000 });
    void like;
  });

  await step('Follow a creator; Following feed shows their posts', async () => {
    await tid('follow').click();
    await toast(/Following @/);
    await tid('mode-following').click();
    await page.getByTestId('feed').waitFor();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid^=story-p_]').length >= 1);
    await shot('feed-following');
    await tid('mode-foryou').click();
  });

  await step('Comment respectfully; abusive comment is held', async () => {
    await tid('comments').click();
    await tid('comment-input').fill('Love the warm colours in this!');
    await tid('comment-send').click();
    await page.getByText('Love the warm colours in this!').waitFor();
    await tid('comment-input').fill('you are so stupid and worthless');
    await tid('comment-send').click();
    await page.getByText('Held for review · only you can see this').waitFor();
    await shot('comments');
    await page.getByTestId('sheet-close').click();
  });

  await step('Cinema: placeholder titles cannot play', async () => {
    await tab('Cinema').click();
    await page.getByText(/placeholder titles/).waitFor();
    await shot('cinema');
    await tid('poster').click();
    await page.getByText(/No film has been licensed yet/).waitFor();
    assert.equal(await tid('play-title').getAttribute('aria-disabled'), 'true');
    await tid('watchlist').click();
    await toast(/Added to My List/);
    await page.getByTestId('sheet-close').click();
  });

  await step('Collabs: apply with 0 followers (no follower minimum)', async () => {
    await tab('Collaborations').click();
    await tid('offer').click();
    await page.getByText(/No follower minimum/).first().waitFor();
    await tid('pitch').fill('A 45-second golden-hour routine told as a short story, filmed vertically with captions.');
    await tid('apply').click();
    await toast(/Application sent/);
    await shot('collabs');
  });

  await step('Market: storefront, bag, order saved but no payment taken', async () => {
    await tab('Market').click();
    await page.getByTestId('search-input').fill('serum');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid=store]').length === 1);
    await tid('store').click();
    await tid('add-cart').click();
    await shot('storefront');
    await tid('view-bag').click();
    await tid('place-order').click();
    await page.getByText(/no payment has been taken/).waitFor();
    await page.getByRole('button', { name: 'OK' }).click();
  });

  await step('Inbox: realtime message from the brand arrives without reloading', async () => {
    await page.goBack();
    await tab('Home feed').click();
    await tid('open-inbox').click();
    await tid('conversation').click();
    await tid('message-input').fill('Happy to share a storyboard!');
    await tid('message-send').click();
    await page.getByTestId('bubble').filter({ hasText: 'Happy to share a storyboard!' }).first().waitFor();
    // The other participant (the sample brand owner) replies through the API; the open thread must update live.
    const c = new pg.Client({ connectionString: databaseUrl }); await c.connect();
    await c.query(`SET search_path=${schema}`);
    const kemi = (await c.query("SELECT id FROM users WHERE handle='kemi.creates'")).rows[0].id;
    const conv = (await c.query('SELECT c.id FROM conversations c JOIN conversation_members m ON m.conversation_id=c.id WHERE m.user_id=$1 ORDER BY c.last_message_at DESC LIMIT 1', [kemi])).rows[0].id;
    const other = (await c.query('SELECT user_id FROM conversation_members WHERE conversation_id=$1 AND user_id<>$2', [conv, kemi])).rows[0].user_id;
    const token = 'smoke-' + Math.random().toString(36).slice(2);
    const crypto = await import('node:crypto');
    await c.query('INSERT INTO sessions (token_hash,user_id,created_at,expires_at) VALUES ($1,$2,$3,$4)', [crypto.createHash('sha256').update(token).digest('hex'), other, Date.now(), Date.now() + 3600e3]);
    await c.end();
    const sent = await fetch(`http://localhost:${apiPort}/api/conversations/${conv}/messages`, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ body: 'Thanks Kemi — send it over!' }) });
    assert.equal(sent.status, 200);
    await page.getByTestId('bubble').filter({ hasText: 'Thanks Kemi — send it over!' }).first().waitFor({ timeout: 15000 });
    assert.equal(await page.getByTestId('bubble').filter({ hasText: 'Thanks Kemi — send it over!' }).count(), 1, 'delivered exactly once');
    await shot('thread');
  });

  await step('Profile shows public follower count; Studio shows $0 (no fake income)', async () => {
    await page.goto(base + '/profile');
    await page.getByText('Followers').first().waitFor();
    await shot('profile');
    await page.goto(base + '/studio');
    await tid('earnings-total').waitFor();
    assert.equal((await tid('earnings-total').textContent()).trim(), '$0.00');
    await shot('studio');
  });

  await step('Report and block a user from their profile', async () => {
    await page.goto(base + '/u/olivia.studio');
    await tid('user-more').click();
    await tid('report-account').click();
    await page.getByRole('radio', { name: 'Bullying or harassment' }).click();
    await tid('report-also-block').click();
    await tid('report-submit').click();
    await toast(/Reported and blocked/);
    await page.goto(base + '/settings');
    await page.getByRole('button', { name: 'Unblock @olivia.studio' }).waitFor();
    await shot('settings');
  });

  await step('No dislike control anywhere', async () => { assert.ok(!/dislike/i.test(await page.content())); });

  await step('Offline banner appears and clears on reconnect', async () => {
    await ctx.setOffline(true);
    // Chrome's NetInfo listens to navigator.connection 'change'; Playwright's setOffline doesn't emit it.
    const ping = (ev) => page.evaluate((e) => { window.dispatchEvent(new Event(e)); navigator.connection?.dispatchEvent(new Event('change')); }, ev);
    await ping('offline');
    await page.getByText('You’re offline. We’ll reconnect automatically.').waitFor({ timeout: 10000 });
    await shot('offline');
    await ctx.setOffline(false);
    await ping('online');
    await page.getByText('You’re offline. We’ll reconnect automatically.').waitFor({ state: 'detached', timeout: 10000 });
  });

  await step('Admin: moderator sees Trust & Safety and resolves a report (audited)', async () => {
    await tid('sign-out').click();
    await page.getByRole('button', { name: 'Sign in' }).waitFor();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await tid('si-email').fill('trust.safety@sample.maka.test');
    await tid('si-pass').fill('dev-admin-password');
    await tid('si-submit').click();
    await tid('feed').waitFor({ timeout: 20000 });
    await tid('open-profile').click();
    await page.getByRole('button', { name: 'Trust and Safety' }).filter({ visible: true }).first().click();
    await page.getByText('Report queue (highest risk first)').waitFor();
    await page.getByText(/bullying · user/).first().waitFor();
    await shot('admin');
    await page.getByRole('button', { name: 'dismiss report about bullying' }).first().click();
    await toast(/Done: dismiss/);
    await page.getByText(/report_dismiss/).first().waitFor();
  });

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log(`\nAll mobile web smoke steps passed. Screenshots in ${path.relative(root, shots)}/`);
} catch (e) {
  await shot('FAILURE').catch(() => {});
  console.error('\nFAILED:', e.message, '\nPage errors:', errors, '\nServer log tail:\n', log.slice(-1500));
  process.exitCode = 1;
} finally {
  await browser.close();
  web.close(); server.kill();
  await new Promise((r) => setTimeout(r, 300));
  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect().then(() => c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)).catch(() => {}).finally(() => c.end());
  fs.rmSync(dataDir, { recursive: true, force: true });
}
