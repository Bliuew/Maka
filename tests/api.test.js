// API + policy tests. Run: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

// Runs against PostgreSQL (DATABASE_URL) in a throwaway schema, and against
// S3-compatible storage when S3_BUCKET is set (local disk otherwise).
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maka-api-'));
process.env.MAKA_DATA_DIR = dataDir;
process.env.DATABASE_URL ||= 'postgres://postgres@localhost:5432/maka';
const schema = 'maka_test_' + Math.random().toString(36).slice(2, 10);
const { createApp } = await import('../server/app.js');
const { personRefHash } = await import('../server/age.js');
const { toPg } = await import('../server/db.js');

let app, base;
before(async () => {
  app = await createApp({ schema });
  await new Promise((r) => app.server.listen(0, r));
  base = `http://localhost:${app.server.address().port}`;
});
after(async () => {
  await app.db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let ip = 0;
async function call(method, p, token, body, headers = {}) {
  const h = { 'x-forwarded-test': String(ip), ...headers };
  if (token) h.authorization = 'Bearer ' + token;
  let payload = body;
  if (body !== undefined && !(body instanceof Uint8Array)) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + p, { method, headers: h, body: payload });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}
let seq = 0;
async function adult(handle = 'user' + ++seq, identity) {
  const r = await call('POST', '/api/auth/register', null, { email: `${handle}@ex.com`, password: 'long-enough-pw', handle, displayName: handle, acceptTerms: true }, { 'x-device-id': 'dev-' + handle });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const t = r.data.token;
  const s = await call('POST', '/api/age/start', t, { method: 'government_id' });
  const c = await call('POST', '/api/age/test/complete', t, { checkId: s.data.checkId, outcome: 'verified', testIdentity: identity || handle });
  return { token: t, id: r.data.user.id, handle, outcome: c.data.outcome };
}
// registration is rate limited per IP; each test file run uses localhost, so reset buckets
const resetLimits = () => app.ctx.limiter.buckets.clear();

const clip = path.join(dataDir, 'c.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=15', '-t', '2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]);
async function post(user, caption = 'hello world') {
  const buf = fs.readFileSync(clip);
  const u = await call('POST', '/api/uploads', user.token, { kind: 'video', size: buf.length });
  const half = Math.floor(buf.length / 2);
  await call('PUT', `/api/uploads/${u.data.uploadId}?offset=0`, user.token, new Uint8Array(buf.subarray(0, half)));
  await call('PUT', `/api/uploads/${u.data.uploadId}?offset=${half}`, user.token, new Uint8Array(buf.subarray(half)));
  await call('POST', `/api/uploads/${u.data.uploadId}/complete`, user.token);
  for (let i = 0; i < 100; i++) { const s = await call('GET', `/api/uploads/${u.data.uploadId}`, user.token); if (s.data.status !== 'processing') break; await new Promise((r) => setTimeout(r, 150)); }
  const p = await call('POST', '/api/posts', user.token, { mediaId: u.data.uploadId, caption });
  assert.equal(p.status, 200, JSON.stringify(p.data));
  return p.data.post;
}

test('19+ gate: unverified accounts cannot use community features', async () => {
  resetLimits();
  const r = await call('POST', '/api/auth/register', null, { email: 'nv@ex.com', password: 'long-enough-pw', handle: 'notverified', displayName: 'NV', acceptTerms: true });
  for (const p of ['/api/feed', '/api/cinema', '/api/campaigns', '/api/conversations', '/api/market/businesses']) {
    const x = await call('GET', p, r.data.token);
    assert.equal(x.status, 403, p); assert.equal(x.data.error, 'age_verification_required');
  }
});

test('Under-19 result closes the account and removes personal data', async () => {
  resetLimits();
  const r = await call('POST', '/api/auth/register', null, { email: 'young@ex.com', password: 'long-enough-pw', handle: 'younguser', displayName: 'Y', acceptTerms: true });
  const s = await call('POST', '/api/age/start', r.data.token, { method: 'bank' });
  await call('POST', '/api/age/test/complete', r.data.token, { checkId: s.data.checkId, outcome: 'under_age' });
  assert.equal((await call('GET', '/api/me', r.data.token)).status, 401);
  const row = await app.q.get('SELECT * FROM users WHERE id=?', r.data.user.id);
  assert.equal(row.status, 'ineligible'); assert.ok(!row.email.includes('young'));
  assert.equal((await call('POST', '/api/auth/login', null, { email: 'young@ex.com', password: 'long-enough-pw' })).status, 401);
});

test('Production refuses the age-verification simulator and sample data', () => {
  const r = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], { env: { ...process.env, NODE_ENV: 'production', MAKA_SECRET: 'x' }, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /AGE_PROVIDER=test .* cannot run in production/);
});

test('Upload resume, transcoding, feed, and no dislike field', async () => {
  resetLimits();
  const a = await adult();
  const p = await post(a, 'first video');
  assert.equal(p.status, 'published');
  assert.ok(p.videoUrl && p.posterUrl);
  assert.ok(!JSON.stringify(p).toLowerCase().includes('dislike'));
  // wrong offset is rejected with the server's offset so clients can resume
  const u = await call('POST', '/api/uploads', a.token, { kind: 'video', size: 10 });
  const bad = await call('PUT', `/api/uploads/${u.data.uploadId}?offset=5`, a.token, new Uint8Array(5));
  assert.equal(bad.status, 409); assert.equal(bad.data.received, 0);
  // media is served with Range support, and only with a valid signature
  const ok = await fetch(base + p.videoUrl, { headers: { range: 'bytes=0-99' } });
  assert.equal(ok.status, 206);
  assert.equal((await fetch(base + p.videoUrl.replace(/s=[^&]+/, 's=forged'))).status, 403);
  // a non-video file is rejected
  const junk = new TextEncoder().encode('not a video at all');
  const j = await call('POST', '/api/uploads', a.token, { kind: 'video', size: junk.length });
  await call('PUT', `/api/uploads/${j.data.uploadId}?offset=0`, a.token, junk);
  await call('POST', `/api/uploads/${j.data.uploadId}/complete`, a.token);
  let s; for (let i = 0; i < 40; i++) { s = await call('GET', `/api/uploads/${j.data.uploadId}`, a.token); if (s.data.status !== 'processing') break; await new Promise((r) => setTimeout(r, 100)); }
  assert.equal(s.data.status, 'rejected');
});

test('For You ranking ignores follower counts', async () => {
  resetLimits();
  const famous = await adult(), unknown = await adult(), viewer = await adult();
  const pf = await post(famous, 'famous post'), pu = await post(unknown, 'unknown post');
  for (let i = 0; i < 6; i++) { resetLimits(); const f = await adult(); await call('POST', `/api/users/${famous.id}/follow`, f.token); }
  // identical engagement + age => scores must be equal regardless of followers
  const t = Date.now() - 2 * 3600e3;
  await app.q.run('UPDATE posts SET published_at=? WHERE id IN (?,?)', t, pf.id, pu.id);
  const rank = await app.ctx.rankForYou(viewer.id, 50);
  const ia = rank.findIndex((p) => p.id === pf.id), ib = rank.findIndex((p) => p.id === pu.id);
  assert.ok(ia >= 0 && ib >= 0);
  assert.equal(Math.abs(ia - ib), 1, 'equal-quality posts sit next to each other regardless of follower count');
  const src = fs.readFileSync(new URL('../server/routes/social.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('ctx.rankForYou'), src.indexOf("r.get('/api/feed'"));
  assert.ok(!/follows/.test(fn), 'ranking function never reads the follows table');
});

test('Following feed, follow, comment, comment filter, held abuse', async () => {
  resetLimits();
  const a = await adult(), b = await adult();
  const p = await post(a, 'look at this');
  await call('POST', `/api/users/${a.handle}/follow`, b.token);
  const f = await call('GET', '/api/feed?mode=following', b.token);
  assert.ok(f.data.items.some((x) => x.id === p.id));
  const ok = await call('POST', `/api/posts/${p.id}/comments`, b.token, { body: 'The lighting could be warmer, but I like it' });
  assert.equal(ok.data.status, 'visible', 'constructive criticism is allowed');
  const held = await call('POST', `/api/posts/${p.id}/comments`, b.token, { body: 'kys loser' });
  assert.equal(held.data.status, 'held');
  await call('PATCH', '/api/me', a.token, { commentFilter: ['pineapple'] });
  assert.equal((await call('POST', `/api/posts/${p.id}/comments`, b.token, { body: 'pineapple pizza' })).data.status, 'held');
  const visible = await call('GET', `/api/posts/${p.id}/comments`, a.token);
  assert.equal(visible.data.comments.length, 1, 'post author only sees the visible comment');
  const notif = await call('GET', '/api/notifications', a.token);
  assert.ok(notif.data.items.some((n) => n.type === 'follow') && notif.data.items.some((n) => n.type === 'comment'));
});

test('Blocking hides content and stops comments, follows and messages', async () => {
  resetLimits();
  const a = await adult(), b = await adult();
  const p = await post(a);
  await call('POST', `/api/users/${b.id}/block`, a.token);
  assert.equal((await call('POST', `/api/posts/${p.id}/comments`, b.token, { body: 'hi there' })).status, 404);
  assert.equal((await call('POST', `/api/users/${a.id}/follow`, b.token)).status, 403);
  assert.equal((await call('POST', '/api/conversations', b.token, { memberIds: [a.id], message: 'hey' })).status, 403);
  assert.equal((await call('GET', `/api/users/${a.handle}`, b.token)).status, 404);
  const feed = await call('GET', '/api/feed', b.token);
  assert.ok(!feed.data.items.some((x) => x.author.id === a.id));
});

test('Messaging: DM policy, group chat, held threats', async () => {
  resetLimits();
  const a = await adult(), b = await adult(), c = await adult();
  await call('PATCH', '/api/me', b.token, { dmPolicy: 'following' });
  assert.equal((await call('POST', '/api/conversations', a.token, { memberIds: [b.id] })).data.error, 'dm_following_only');
  await call('POST', `/api/users/${a.id}/follow`, b.token);
  const cv = await call('POST', '/api/conversations', a.token, { memberIds: [b.id], message: 'hello!' });
  assert.equal(cv.status, 200);
  const m = await call('POST', `/api/conversations/${cv.data.id}/messages`, a.token, { body: 'i know where you live' });
  assert.equal(m.data.status, 'held');
  const seen = await call('GET', `/api/conversations/${cv.data.id}/messages`, b.token);
  assert.deepEqual(seen.data.map((x) => x.body), ['hello!']);
  const g = await call('POST', '/api/conversations', a.token, { memberIds: [b.id, c.id], title: 'Crew', message: 'welcome' });
  assert.equal((await call('GET', '/api/conversations', c.token)).data.find((x) => x.id === g.data.id).isGroup, true);
});

test('Report → admin ban → identity blocked from re-registering → appeal by another reviewer', async () => {
  resetLimits();
  const victim = await adult(), abuser = await adult('abuser1', 'person-X');
  const admin1 = await adult(), admin2 = await adult();
  await app.q.run("UPDATE users SET role='admin' WHERE id IN (?,?)", admin1.id, admin2.id);
  const p = await post(abuser, 'targeted post');
  const r = await call('POST', '/api/reports', victim.token, { targetType: 'post', targetId: p.id, reason: 'bullying', alsoBlock: true });
  assert.equal(r.data.blocked, true);
  assert.equal((await call('GET', '/api/admin/reports', victim.token)).status, 403, 'non-admins cannot moderate');
  const q = await call('GET', '/api/admin/reports', admin1.token);
  const item = q.data.find((x) => x.id === r.data.reportId);
  assert.equal(item.recommendedLevel, 'warning');
  assert.equal((await call('POST', `/api/admin/reports/${item.id}/resolve`, admin1.token, { action: 'ban' })).data.error, 'note_required');
  await call('POST', `/api/admin/reports/${item.id}/resolve`, admin1.token, { action: 'ban', note: 'Targeted harassment' });
  assert.equal((await app.q.get('SELECT status FROM posts WHERE id=?', p.id)).status, 'removed');
  assert.equal((await call('GET', '/api/me', abuser.token)).status, 401, 'sessions revoked');
  assert.ok(await app.q.get('SELECT 1 FROM banned_identities WHERE person_ref_hash=?', personRefHash('test-person:person-X')));
  // Same verified person tries a new account from a new email/device: held for review, not admitted.
  resetLimits();
  const again = await adult('abuser2', 'person-X');
  assert.equal(again.outcome, 'review');
  assert.equal((await call('GET', '/api/feed', again.token)).status, 403);
  // Appeal: original reviewer cannot decide it; another can overturn.
  const login = await call('POST', '/api/auth/login', null, { email: 'abuser1@ex.com', password: 'long-enough-pw' });
  assert.equal(login.data.error, 'account_banned');
  const sid = (await app.q.get('SELECT id FROM sanctions WHERE user_id=?', abuser.id)).id;
  await app.q.run("INSERT INTO appeals (id,user_id,sanction_id,body,created_at) VALUES ('ap1',?,?,'It was satire',?)", abuser.id, sid, Date.now());
  assert.equal((await call('POST', '/api/admin/appeals/ap1/decide', admin1.token, { decision: 'overturned' })).data.error, 'reviewer_conflict');
  await call('POST', '/api/admin/appeals/ap1/decide', admin2.token, { decision: 'overturned' });
  assert.equal((await app.q.get('SELECT status FROM users WHERE id=?', abuser.id)).status, 'active');
  const audit = (await call('GET', '/api/admin/audit', admin2.token)).data.map((x) => x.action);
  assert.ok(audit.includes('report_ban') && audit.includes('appeal_overturned'));
});

test('Collabs: no follower criteria, open to a 0-follower creator, contract → pending earnings', async () => {
  resetLimits();
  const owner = await adult(), creator = await adult(), admin = await adult();
  await app.q.run("UPDATE users SET role='admin' WHERE id=?", admin.id);
  const biz = await call('POST', '/api/businesses', owner.token, { name: 'Honey Co', category: 'Food', registrationRef: 'BN123' });
  assert.equal((await call('POST', `/api/businesses/${biz.data.id}/campaigns`, owner.token, { title: 'x', brief: 'y', deliverables: 'z', compensationCents: 100 })).data.error, 'business_not_verified');
  await call('POST', `/api/admin/businesses/${biz.data.id}/verify`, admin.token, { decision: 'verified' });
  const tiered = await call('POST', `/api/businesses/${biz.data.id}/campaigns`, owner.token, { title: 'x', brief: 'y', deliverables: 'z', compensationCents: 100, minFollowers: 10000 });
  assert.equal(tiered.data.error, 'follower_criteria_not_allowed');
  const inBrief = await call('POST', `/api/businesses/${biz.data.id}/campaigns`, owner.token, { title: 'x', brief: 'Minimum 10k followers required', deliverables: 'z', compensationCents: 100 });
  assert.equal(inBrief.data.error, 'follower_criteria_not_allowed');
  const c = await call('POST', `/api/businesses/${biz.data.id}/campaigns`, owner.token, { title: 'Honey reels', brief: 'Show your morning', deliverables: '1 video', compensationCents: 20000 });
  assert.equal((await call('GET', `/api/users/${creator.id}`, creator.token)).data.user.followers, 0);
  const ap = await call('POST', `/api/campaigns/${c.data.id}/apply`, creator.token, { pitch: 'A cosy honey breakfast story in 40 seconds.' });
  assert.equal(ap.data.status, 'submitted');
  const d = await call('POST', `/api/applications/${ap.data.applicationId}/decision`, owner.token, { status: 'accepted' });
  for (const [who, act] of [[creator, 'sign'], [creator, 'deliver'], [owner, 'approve']]) await call('POST', `/api/contracts/${d.data.contractId}/${act}`, who.token);
  const studio = await call('GET', '/api/studio', creator.token);
  assert.equal(studio.data.earnings.pendingCents, 20000);
  assert.equal(studio.data.earnings.payoutsEnabled, false);
});

test('Cinema never plays placeholders; licensed titles need a rights window for the territory', async () => {
  resetLimits();
  const u = await adult(), admin = await adult();
  await app.q.run("UPDATE users SET role='admin' WHERE id=?", admin.id);
  const ph = await call('POST', '/api/admin/titles', admin.token, { name: 'Placeholder', kind: 'movie', genres: ['Drama'], isPlaceholder: true });
  assert.equal((await call('POST', `/api/cinema/${ph.data.id}/play`, u.token)).data.error, 'placeholder');
  const t = await call('POST', '/api/admin/titles', admin.token, { name: 'Licensed', kind: 'movie', genres: ['Drama'], streamUrl: 'https://cdn.example/x.m3u8' });
  assert.equal((await call('POST', `/api/cinema/${t.data.id}/play`, u.token)).data.error, 'not_licensed_here');
  await call('POST', `/api/admin/titles/${t.data.id}/rights`, admin.token, { licensor: 'Studio', contractRef: 'K-1', territories: ['US'], startsAt: '2020-01-01', endsAt: '2099-01-01' });
  assert.equal((await call('POST', `/api/cinema/${t.data.id}/play`, u.token)).data.error, 'not_licensed_here', 'US rights do not cover CA viewers');
  await call('POST', `/api/admin/titles/${t.data.id}/rights`, admin.token, { licensor: 'Studio', contractRef: 'K-2', territories: ['CA'], startsAt: '2020-01-01', endsAt: '2099-01-01' });
  assert.equal((await call('POST', `/api/cinema/${t.data.id}/play`, u.token)).status, 200);
});

test('Market: server-side prices, stock checks, checkout refuses without payment provider', async () => {
  resetLimits();
  const owner = await adult(), buyer = await adult(), admin = await adult();
  await app.q.run("UPDATE users SET role='admin' WHERE id=?", admin.id);
  const biz = await call('POST', '/api/businesses', owner.token, { name: 'Shop', category: 'Home', registrationRef: 'R' });
  await call('POST', `/api/admin/businesses/${biz.data.id}/verify`, admin.token, { decision: 'verified' });
  const pr = await call('POST', `/api/businesses/${biz.data.id}/products`, owner.token, { name: 'Candle', priceCents: 1500, stock: 2 });
  assert.equal((await call('POST', '/api/orders', buyer.token, { businessId: biz.data.id, items: [{ productId: pr.data.id, qty: 3 }] })).data.error, 'out_of_stock');
  const o = await call('POST', '/api/orders', buyer.token, { businessId: biz.data.id, items: [{ productId: pr.data.id, qty: 2, priceCents: 1 }] });
  assert.equal(o.data.totalCents, 3000, 'client-supplied price ignored');
  const co = await call('POST', `/api/orders/${o.data.orderId}/checkout`, buyer.token);
  assert.equal(co.status, 503); assert.equal(co.data.error, 'payments_not_configured');
  assert.equal((await call('POST', `/api/orders/${o.data.orderId}/cancel`, buyer.token)).data.status, 'cancelled');
});

test('Account deletion and data export', async () => {
  resetLimits();
  const a = await adult();
  const ex = await call('GET', '/api/me/export', a.token);
  assert.equal(ex.data.profile.handle, a.handle);
  assert.ok(!JSON.stringify(ex.data).includes('pass_hash'));
  assert.equal((await call('DELETE', '/api/me', a.token, { password: 'wrong' })).status, 401);
  assert.equal((await call('DELETE', '/api/me', a.token, { password: 'long-enough-pw' })).status, 200);
  assert.equal((await call('GET', '/api/me', a.token)).status, 401);
});

test('Private test server: sign-up requires the invite code when INVITE_CODE is set', async () => {
  resetLimits();
  app.ctx.config.inviteCode = 'honey-2026';
  try {
    const body = { email: 'inv@ex.com', password: 'long-enough-pw', handle: 'invitee', displayName: 'I', acceptTerms: true };
    assert.equal((await call('POST', '/api/auth/register', null, body)).data.error, 'invite_required');
    assert.equal((await call('POST', '/api/auth/register', null, { ...body, inviteCode: 'honey-2026' })).status, 200);
    assert.equal((await call('GET', '/api/health')).data.inviteRequired, true);
  } finally { app.ctx.config.inviteCode = null; }
});

test('Postgres: placeholders are rewritten outside string literals', () => {
  assert.equal(toPg("SELECT * FROM t WHERE a=? AND b='what?' AND c=?"), "SELECT * FROM t WHERE a=$1 AND b='what?' AND c=$2");
});

test('Health reports Postgres and the media storage in use', async () => {
  const h = await call('GET', '/api/health');
  assert.equal(h.status, 200);
  assert.equal(h.data.database, 'postgres');
  assert.match(h.data.storage, process.env.S3_BUCKET ? /object storage/ : /local disk/);
});

test('Handles are unique regardless of letter case', async () => {
  resetLimits();
  const a = await adult('casey.case');
  const dup = await call('POST', '/api/auth/register', null, { email: 'other-casey@ex.com', password: 'long-enough-pw', handle: 'Casey.Case', displayName: 'C', acceptTerms: true });
  assert.equal(dup.data.error, 'handle_taken');
  assert.equal((await call('GET', '/api/users/CASEY.CASE', a.token)).data.user.id, a.id);
});

test('Media lives in object storage: parts are cleaned up and outputs stored', async () => {
  resetLimits();
  const a = await adult();
  const p = await post(a, 'storage check');
  const m = await app.q.get('SELECT m.* FROM media m JOIN posts p ON p.media_id=m.id WHERE p.id=?', p.id);
  const keys = await app.storage.list(`media/${m.id}`);
  assert.ok(keys.includes(`media/${m.id}/video.mp4`) && keys.includes(`media/${m.id}/poster.jpg`), JSON.stringify(keys));
  assert.equal((await app.storage.list(`media/${m.id}/parts`)).length, 0, 'upload parts deleted after processing');
  const full = await fetch(base + p.posterUrl);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('content-type'), 'image/jpeg');
});

test('A resumable upload can continue on a second server instance', async () => {
  resetLimits();
  const a = await adult();
  const other = await createApp({ schema });
  await new Promise((r) => other.server.listen(0, r));
  const base2 = `http://localhost:${other.server.address().port}`;
  try {
    const buf = fs.readFileSync(clip);
    const u = await call('POST', '/api/uploads', a.token, { kind: 'video', size: buf.length });
    const half = Math.floor(buf.length / 2);
    assert.equal((await call('PUT', `/api/uploads/${u.data.uploadId}?offset=0`, a.token, new Uint8Array(buf.subarray(0, half)))).data.received, half);
    // Instance 1 "goes away"; the client resumes against instance 2 from the server offset.
    const h = { authorization: 'Bearer ' + a.token };
    const st = await (await fetch(`${base2}/api/uploads/${u.data.uploadId}`, { headers: h })).json();
    assert.equal(st.received, half);
    const put = await fetch(`${base2}/api/uploads/${u.data.uploadId}?offset=${half}`, { method: 'PUT', headers: h, body: new Uint8Array(buf.subarray(half)) });
    assert.equal((await put.json()).received, buf.length);
    // A replayed (stale) chunk is refused with the current offset.
    const stale = await fetch(`${base2}/api/uploads/${u.data.uploadId}?offset=0`, { method: 'PUT', headers: h, body: new Uint8Array(buf.subarray(0, half)) });
    assert.equal(stale.status, 409); assert.equal((await stale.json()).received, buf.length);
    await fetch(`${base2}/api/uploads/${u.data.uploadId}/complete`, { method: 'POST', headers: h });
    let s; for (let i = 0; i < 100; i++) { s = await call('GET', `/api/uploads/${u.data.uploadId}`, a.token); if (s.data.status !== 'processing') break; await new Promise((r) => setTimeout(r, 150)); }
    assert.equal(s.data.status, 'ready');
  } finally { await other.close(); }
});

test('Production refuses to start without Postgres and object storage', () => {
  const env = { ...process.env, NODE_ENV: 'production', MAKA_SECRET: 'x', AGE_PROVIDER: 'real', AGE_PROVIDER_API_KEY: 'k', SEED_SAMPLES: '0' };
  delete env.DATABASE_URL; delete env.S3_BUCKET;
  const r = spawnSync(process.execPath, ['--no-warnings=ExperimentalWarning', 'server/index.js'], { env, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /DATABASE_URL/);
  assert.match(r.stderr, /S3_BUCKET/);
});

test('Store readiness: privacy policy, terms, guidelines and account-deletion pages are served', async () => {
  const pages = {
    '/privacy.html': [/strictly for adults 19\+/i, /never receive or store images of your ID/i, /Draft for legal review/],
    '/terms.html': [/no tolerance for objectionable content/i, /at least 19/],
    '/guidelines.html': [/Stitches, remixes or duets made to ridicule a person/, /different reviewer/],
    '/account-deletion.html': [/Delete account/, /never stored/],
  };
  for (const [p, patterns] of Object.entries(pages)) {
    const r = await fetch(base + p);
    assert.equal(r.status, 200, p);
    const html = await r.text();
    for (const re of patterns) assert.match(html, re, p);
    assert.ok(html.includes('Mäka'), p);
    // Policy text may say there are *no* public dislike counts; it must never describe one.
    assert.ok(!/dislike/i.test(html.replace(/no public dislike counts/gi, '')), p);
  }
});

test('Only brand assets ship in web/assets (no sample photos or third-party imagery)', () => {
  const allowed = new Set(['approved-logo.webp', 'app-icon-design.webp', 'icon-1024.png', 'icon-512.png', 'icon-192.png',
    'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-64.png']);
  const files = fs.readdirSync(new URL('../web/assets', import.meta.url));
  assert.deepEqual(files.filter((f) => !allowed.has(f)), []);
  assert.ok(!/asset:/.test(fs.readFileSync(new URL('../server/seed.js', import.meta.url), 'utf8')), 'seed data references no image assets');
});

test('Discover: emerging creators are never chosen by follower count; hashtags are counted from real posts', async () => {
  resetLimits();
  const viewer = await adult(), quiet = await adult(), popular = await adult();
  await post(quiet, 'first light #honeyhour'); await post(popular, 'morning #honeyhour #studio');
  for (let i = 0; i < 3; i++) { resetLimits(); const f = await adult(); await call('POST', `/api/users/${popular.id}/follow`, f.token); }
  const d = (await call('GET', '/api/discover', viewer.token)).data;
  const ids = d.creators.map((u) => u.id);
  assert.ok(ids.includes(quiet.id) && ids.includes(popular.id));
  assert.ok(ids.indexOf(popular.id) < ids.indexOf(quiet.id), 'newest first (popular joined later), not by followers');
  assert.equal(d.hashtags.find((h) => h.tag === '#honeyhour').posts, 2);
  const src = fs.readFileSync(new URL('../server/routes/social.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf("r.get('/api/discover'"), src.indexOf('// ---------------- creator studio'));
  assert.ok(!/follows/.test(fn), 'discover never reads the follows table');
});

test('Market product feed lists products from verified stores only', async () => {
  resetLimits();
  const owner = await adult(), buyer = await adult(), admin = await adult();
  await app.q.run("UPDATE users SET role='admin' WHERE id=?", admin.id);
  const ok = await call('POST', '/api/businesses', owner.token, { name: 'Feed Shop', category: 'Lifestyle', registrationRef: 'R1' });
  const pending = await call('POST', '/api/businesses', owner.token, { name: 'Pending Shop', category: 'Lifestyle', registrationRef: 'R2' });
  await call('POST', `/api/admin/businesses/${ok.data.id}/verify`, admin.token, { decision: 'verified' });
  await call('POST', `/api/businesses/${ok.data.id}/products`, owner.token, { name: 'Linen Throw', priceCents: 4000, stock: 3 });
  const feed = (await call('GET', '/api/market/products?category=Lifestyle', buyer.token)).data;
  assert.ok(feed.items.some((p) => p.name === 'Linen Throw' && p.business === 'Feed Shop'));
  assert.ok(!feed.items.some((p) => p.business === 'Pending Shop'));
  void pending;
});

const pic = path.join(dataDir, 'p.png');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x400', '-frames:v', '1', pic]);
async function uploadImage(user) {
  const buf = fs.readFileSync(pic);
  const u = await call('POST', '/api/uploads', user.token, { kind: 'image', size: buf.length });
  await call('PUT', `/api/uploads/${u.data.uploadId}?offset=0`, user.token, new Uint8Array(buf));
  await call('POST', `/api/uploads/${u.data.uploadId}/complete`, user.token);
  for (let i = 0; i < 100; i++) { const s = await call('GET', `/api/uploads/${u.data.uploadId}`, user.token); if (s.data.status !== 'processing') break; await new Promise((r) => setTimeout(r, 120)); }
  return u.data.uploadId;
}

test('Text posts: published with a style, screened like captions, no media', async () => {
  resetLimits();
  const a = await adult();
  const t = await call('POST', '/api/posts', a.token, { kind: 'text', caption: 'Honey thought for the day #hive', textStyle: 'midnight' });
  assert.equal(t.status, 200, JSON.stringify(t.data));
  assert.equal(t.data.post.kind, 'text'); assert.equal(t.data.post.textStyle, 'midnight'); assert.equal(t.data.post.status, 'published');
  assert.equal(t.data.post.videoUrl, null); assert.equal(t.data.post.imageUrl, null);
  assert.equal((await call('POST', '/api/posts', a.token, { kind: 'text', caption: '   ' })).data.error, 'text_required');
  const abusive = await call('POST', '/api/posts', a.token, { kind: 'text', caption: 'you are so worthless' });
  assert.equal(abusive.data.post.status, 'held', 'abusive text posts are held for review');
  const feed = await call('GET', '/api/feed', (await adult()).token);
  assert.ok(feed.data.items.some((p) => p.id === t.data.post.id));
});

test('Carousel posts: 2 to 10 ready photos, in order, never reused', async () => {
  resetLimits();
  const a = await adult();
  const ids = [await uploadImage(a), await uploadImage(a), await uploadImage(a)];
  assert.equal((await call('POST', '/api/posts', a.token, { kind: 'carousel', mediaIds: ids.slice(0, 1) })).data.error, 'carousel_size');
  const c = await call('POST', '/api/posts', a.token, { kind: 'carousel', mediaIds: ids, caption: 'Three looks' });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.equal(c.data.post.kind, 'carousel'); assert.equal(c.data.post.images.length, 3);
  assert.equal(c.data.post.imageUrl, c.data.post.images[0].url);
  assert.equal((await fetch(base + c.data.post.images[2].url)).status, 200);
  assert.equal((await call('POST', '/api/posts', a.token, { kind: 'carousel', mediaIds: ids.slice(1) })).data.error, 'media_already_used');
  const other = await adult();
  const notMine = await call('POST', '/api/posts', other.token, { kind: 'carousel', mediaIds: [await uploadImage(other), ids[0]] });
  assert.equal(notMine.data.error, 'media_required');
  const pending = await call('POST', '/api/uploads', a.token, { kind: 'image', size: 10 });
  assert.equal((await call('POST', '/api/posts', a.token, { kind: 'carousel', mediaIds: [await uploadImage(a), pending.data.uploadId] })).data.error, 'media_not_ready');
});
