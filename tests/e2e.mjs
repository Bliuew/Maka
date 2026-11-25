// End-to-end acceptance demo on a phone-sized viewport (iPhone 13 dimensions).
// Boots a fresh server with sample data, then drives the real UI.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

import { createRequire } from 'node:module';
import pg from 'pg';

// Playwright: PLAYWRIGHT_MODULE, a local install, or a global one.
async function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright'];
  try { tries.push(createRequire(import.meta.url).resolve('playwright')); } catch { /* not local */ }
  for (const dir of ['/opt/node-tools/node_modules', '/opt/npm-tools/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules']) tries.push(path.join(dir, 'playwright/index.mjs'));
  for (const t of tries.filter(Boolean)) { try { const m = await import(t.startsWith('/') ? 'file://' + t : t); const pw = m.chromium ? m : m.default; if (pw?.chromium) return pw; } catch { /* next */ } }
  throw new Error('Playwright not found. Install it (npm i -D playwright && npx playwright install chromium) or set PLAYWRIGHT_MODULE.');
}
const { chromium, devices } = await loadPlaywright();

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maka-e2e-'));
const shots = path.join(root, 'tests', 'screens');
fs.mkdirSync(shots, { recursive: true });
const port = 8700 + Math.floor(Math.random() * 200);
const base = `http://localhost:${port}`;

// test clip: 4s vertical video with audio
const clip = path.join(dataDir, 'my-first-clip.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=540x960:rate=25', '-f', 'lavfi', '-i', 'sine=frequency=440',
  '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);

const databaseUrl = process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/maka';
const schema = 'maka_e2e_' + Math.random().toString(36).slice(2, 10);
const server = spawn(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], { cwd: root,
  env: { ...process.env, NODE_ENV: 'development', PORT: String(port), MAKA_DATA_DIR: dataDir, PUBLIC_ORIGIN: base, DATABASE_URL: databaseUrl, DATABASE_SCHEMA: schema, INVITE_CODE: '' } });
let log = '';
server.stdout.on('data', (d) => { log += d; }); server.stderr.on('data', (d) => { log += d; });
for (let i = 0; i < 120 && !log.includes('Seeded sample data'); i++) await new Promise((r) => setTimeout(r, 500));
if (!log.includes('Seeded sample data')) { console.error(log); process.exit(1); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], browserName: undefined, defaultBrowserType: undefined });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
let n = 0;
const shot = (name) => page.screenshot({ path: path.join(shots, `${String(++n).padStart(2, '0')}-${name}.png`) });
const step = async (name, fn) => { process.stdout.write(`• ${name} … `); await fn(); console.log('ok'); };
const expectToast = (re) => page.locator('.toast', { hasText: re }).waitFor({ timeout: 10000 });

try {
  await step('Welcome screen shows approved logo and 19+ notice', async () => {
    await page.goto(base);
    await page.locator('.logo-card img[src="/assets/approved-logo.webp"]').waitFor();
    assert.match(await page.textContent('.auth'), /Strictly 19\+/);
    await shot('welcome');
  });

  await step('Register a test adult', async () => {
    await page.click('text=Create account');
    await page.fill('#su-email', 'ada@example.com');
    await page.fill('#su-pass', 'correct-horse-battery');
    await page.fill('#su-handle', 'ada.creates');
    await page.fill('#su-name', 'Ada');
    await page.check('input[name=acceptTerms]');
    await page.click('button:has-text("Continue to age check")');
    await page.waitForURL(/#\/verify/);
  });

  await step('Unverified account cannot reach the feed (19+ gate)', async () => {
    await page.goto(base + '/#/home');
    await page.waitForURL(/#\/verify/);
    await page.locator('.auth:has-text("TEST MODE")').waitFor();
    await shot('age-methods');
  });

  await step('Choose ONE method and pass the clearly-labelled test simulator', async () => {
    await page.click('label.method:has-text("Digital ID credential")');
    await page.click('button:has-text("Start verification")');
    await page.waitForURL(/#\/age-test\//);
    await shot('age-simulator');
    await page.click('button:has-text("Simulate: verified adult")');
    await page.waitForURL(/#\/home/);
    await page.locator('.story video').first().waitFor();
  });

  await step('Feed autoplays vertical video', async () => {
    await page.waitForFunction(() => { const v = document.querySelector('.story video'); return v && v.currentTime > 0.3 && !v.paused; }, null, { timeout: 15000 });
    await shot('feed-for-you');
  });

  await step('Swipe to next video (scroll snap) and it plays', async () => {
    await page.locator('#feed').evaluate((f) => f.scrollBy(0, f.clientHeight));
    await page.waitForFunction(() => { const v = document.querySelectorAll('.story video')[1]; return v && v.currentTime > 0.3 && !v.paused; }, null, { timeout: 15000 });
  });

  await step('Follow a creator from the feed', async () => {
    const btn = page.locator('.story').nth(1).locator('[data-act=follow]');
    await btn.click();
    await expectToast(/Following @/);
    assert.equal(await btn.getAttribute('aria-pressed'), 'true');
  });

  await step('Switch to Following feed, then back to For You', async () => {
    await page.locator('.story').first().locator('[data-mode=following]').click();
    await page.waitForFunction(() => document.querySelector('.feedtop .sel')?.textContent === 'Following');
    assert.ok(await page.locator('.story[data-post]').count() >= 1, 'following feed has posts from the followed creator');
    await shot('feed-following');
    await page.locator('.story').first().locator('[data-mode=foryou]').click();
    await page.waitForFunction(() => document.querySelector('.feedtop .sel')?.textContent === 'For You');
  });

  await step('Like a video', async () => {
    const story = page.locator('.story').first();
    await story.locator('[data-act=like]').click();
    await page.waitForFunction(() => document.querySelector('.story [data-act=like]').getAttribute('aria-pressed') === 'true');
  });

  await step('Leave a respectful comment', async () => {
    await page.locator('.story').first().locator('[data-act=comments]').click();
    await page.fill('#commentText', 'Love the warm colours in this!');
    await page.click('button:has-text("Post comment")');
    await page.locator('#commentList :text("Love the warm colours in this!")').waitFor();
    await shot('comments');
  });

  await step('Abusive comment is held, not published', async () => {
    await page.fill('#commentText', 'you are so stupid and worthless');
    await page.click('button:has-text("Post comment")');
    await expectToast(/held for review/);
    await page.locator('#commentList .tag:has-text("Held for review")').waitFor();
    await page.click('.sheetClose');
  });

  await step('Upload and publish my own short video (resumable upload + transcode)', async () => {
    await page.click('.tab[data-go=create]');
    await page.setInputFiles('#cfile', clip);
    await page.fill('#ccap', 'My first Mäka video 🐝 #EveryCreator');
    await page.fill('#calt', 'A colourful test pattern with a tone');
    await page.check('input[name=original]');
    await shot('create');
    await page.click('button:has-text("Publish")');
    await page.waitForURL(/#\/p\//, { timeout: 60000 });
  });

  await step('Watch my own video', async () => {
    await page.waitForFunction(() => { const v = document.querySelector('.story video'); return v && v.currentTime > 0.3; }, null, { timeout: 15000 });
    assert.match(await page.textContent('.story .caption'), /My first Mäka video/);
    await shot('own-video');
  });

  await step('Report AND block a user', async () => {
    await page.goto(base + '/#/u/olivia.studio');
    await page.click('[data-act=userMore]');
    await page.click('button:has-text("Report account")');
    await page.check('input[value=bullying]');
    await page.check('input[name=alsoBlock]');
    await page.click('button:has-text("Submit report")');
    await expectToast(/Reported and blocked/);
    await page.goto(base + '/#/settings');
    await page.locator('.listitem:has-text("@olivia.studio") button:has-text("Unblock")').waitFor();
    await page.goto(base + '/#/home');
    await page.locator('.story').first().waitFor();
    const authors = await page.$$eval('.story .who span:last-child', (els) => els.map((e) => e.textContent));
    assert.ok(!authors.includes('@olivia.studio'), 'blocked creator no longer appears in feed');
  });

  await step('Browse a sample film — no playback pretended', async () => {
    await page.click('.tab[data-go=cinema]');
    await page.locator('.banner:has-text("fictional placeholders")').waitFor();
    await shot('cinema');
    await page.locator('.poster').first().click();
    const play = page.locator('[data-act=playTitle]');
    assert.equal(await play.isDisabled(), true);
    assert.match(await page.textContent('.sheet'), /No film has been licensed/);
    await page.click('[data-act=watchlist]');
    await expectToast(/Added to My List/);
    await shot('film-detail');
    await page.click('.sheetClose');
  });

  await step('Apply to an open collaboration (account has 0 followers)', async () => {
    await page.click('.tab[data-go=collabs]');
    await page.locator('.offer').first().click();
    assert.match(await page.textContent('.sheet'), /No follower minimum/);
    await page.fill('#pitch', 'A 45-second golden-hour routine told as a short story, filmed vertically with captions.');
    await page.click('button:has-text("Submit application")');
    await expectToast(/Application sent/);
    await page.locator('.tag:has-text("Applied")').first().waitFor();
    await shot('collabs');
  });

  await step('Navigate a marketplace storefront and place an order (payments not connected)', async () => {
    await page.click('.tab[data-go=market]');
    await page.locator('#mres .tile').first().waitFor();
    await page.fill('#mq', 'serum');
    await page.waitForFunction(() => document.querySelectorAll('#mres .tile').length === 1);
    await page.locator('#mres .tile').first().click();
    await page.waitForURL(/#\/market\/b_/);
    await page.locator('[data-act=addCart]').first().click();
    await shot('storefront');
    await page.click('#cartBtn');
    await page.click('button:has-text("Place order")');
    await page.locator('.banner:has-text("no payment has been taken")').waitFor();
  });

  await step('Inbox shows the brand conversation; send a message', async () => {
    await page.click('button:has-text("OK")');
    await page.click('.topbar [data-go=inbox]');
    await page.locator('.listitem:has-text("application")').first().click();
    await page.fill('input[name=body]', 'Happy to share a storyboard!');
    await page.click('.thread button:has-text("Send")');
    await page.locator('.bubble.me:has-text("storyboard")').waitFor();
    await shot('thread');
  });

  await step('Profile shows public follower count and my post', async () => {
    await page.click('.topbar [data-go=profile]');
    await page.locator('.thumb').first().waitFor();
    assert.match(await page.textContent('.metrics'), /Followers/);
    await shot('profile');
  });

  await step('Creator Studio shows real stats and $0 earnings (no fake income)', async () => {
    await page.goto(base + '/#/studio');
    await page.locator('.feature .num').waitFor();
    assert.equal((await page.textContent('.feature .num')).trim(), '$0.00');
    await shot('studio');
  });

  await step('No public dislike count anywhere in the UI', async () => {
    const html = await page.content();
    assert.ok(!/dislike/i.test(html));
  });

  await step('Moderator reviews the report queue and actions a report (audited)', async () => {
    await page.goto(base + '/#/settings');
    await page.click('button:has-text("Sign out")');
    await page.waitForURL(/#\/welcome/);
    await page.click('text=Sign in');
    await page.fill('#si-email', 'trust.safety@sample.maka.test');
    await page.fill('#si-pass', 'dev-admin-password');
    await page.click('form button:has-text("Sign in")');
    await page.waitForURL(/#\/home/);
    await page.goto(base + '/#/admin');
    await page.locator('.adminitem:has-text("bullying")').first().waitFor();
    await shot('admin-queue');
    const item = page.locator('.adminitem:has-text("bullying · user")').first();
    await item.locator('input[name=note]').fill('Reviewed: no violation found');
    await item.locator('button[data-action=dismiss]').click();
    await expectToast(/Done: dismiss/);
    await page.locator('.kv:has-text("report_dismiss")').first().waitFor();
  });

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log(`\nAll E2E steps passed. Screenshots in ${path.relative(root, shots)}/`);
} catch (e) {
  await shot('FAILURE').catch(() => {});
  console.error('\nFAILED:', e.message, '\nPage errors:', errors, '\nServer log tail:\n', log.slice(-2000));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  await new Promise((r) => setTimeout(r, 300));
  const c = new pg.Client({ connectionString: databaseUrl });
  await c.connect().then(() => c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)).catch((e) => console.error('schema cleanup:', e.message)).finally(() => c.end());
  fs.rmSync(dataDir, { recursive: true, force: true });
}
