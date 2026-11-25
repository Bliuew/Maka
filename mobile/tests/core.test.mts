// Unit tests for platform-agnostic app logic. Run: npm test (Node strips the TS types).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SseParser, backoff } from '../src/core/sse.ts';
import { count, money, ago, initial } from '../src/core/format.ts';
import { areaFor, homeFor, canSeeAdmin } from '../src/core/gate.ts';

test('SSE parser handles split chunks, comments, multi-line data and retry', () => {
  const p = new SseParser();
  assert.deepEqual(p.feed('retry: 3000\n\n: ping\n\nevent: mess'), []);
  assert.equal(p.retryMs, 3000);
  const ev = p.feed('age\ndata: {"a":1}\n\nevent: notification\ndata: line1\r\ndata: line2\r\n\r\n');
  assert.deepEqual(ev, [{ event: 'message', data: '{"a":1}', id: undefined }, { event: 'notification', data: 'line1\nline2', id: undefined }]);
});

test('Backoff doubles and is capped', () => {
  assert.equal(backoff(0), 1000); assert.equal(backoff(3), 8000); assert.equal(backoff(20), 30000);
});

test('Formatting matches the web client', () => {
  assert.equal(count(999), '999'); assert.equal(count(12345), '12.3K'); assert.equal(count(2000000), '2M');
  assert.match(money(3400), /34\.00/);
  assert.equal(ago(Date.now() - 30_000), 'now'); assert.equal(ago(Date.now() - 2 * 3600e3), '2h');
  assert.equal(initial(' amara'), 'A'); assert.equal(initial(''), '?');
});

test('19+ gate: no community screens until age is verified', () => {
  assert.equal(areaFor(null, null), 'auth');
  for (const st of ['unverified', 'pending', 'failed', 'review'] as const) assert.equal(areaFor('t', { id: 'u', role: 'user', ageStatus: st }), 'age');
  assert.equal(areaFor('t', { id: 'u', role: 'user', ageStatus: 'verified' }), 'app');
  assert.equal(homeFor('age'), '/verify');
  assert.equal(canSeeAdmin({ id: 'u', role: 'admin', ageStatus: 'pending' }), false);
  assert.equal(canSeeAdmin({ id: 'u', role: 'admin', ageStatus: 'verified' }), true);
});

test('No dislike affordance exists anywhere in the app source', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const src = walk(new URL('../src', import.meta.url).pathname).filter((f) => /\.(ts|tsx)$/.test(f));
  assert.ok(src.length > 10);
  for (const f of src) assert.ok(!/dislike/i.test(fs.readFileSync(f, 'utf8')), f);
});

test('Branding: approved logo is byte-identical, app icon is generated from the founder icon design', async () => {
  const fs = await import('node:fs');
  const crypto = await import('node:crypto');
  const sha = (p: string) => crypto.createHash('sha256').update(fs.readFileSync(new URL(p, import.meta.url))).digest('hex');
  assert.equal(sha('../assets/brand/approved-logo.webp'), sha('../../web/assets/approved-logo.webp'));
  assert.equal(sha('../assets/icon.png'), sha('../../web/assets/icon-1024.png'));
  // Every icon is generated from the founder's design file, which is kept as supplied.
  assert.ok(fs.statSync(new URL('../../web/assets/app-icon-design.webp', import.meta.url)).size > 1000);
  const src = fs.readFileSync(new URL('../src/lib/theme.ts', import.meta.url), 'utf8');
  assert.ok(src.includes("TAGLINE = 'Feel The Power Of Love Within You'") && src.includes("BRAND = 'Mäka'"));
});
