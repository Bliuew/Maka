// Integration: the app's API client, resumable uploader and realtime parser
// against the real Mäka server (Postgres via DATABASE_URL).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createApi, ApiError, type Api } from '../src/core/api.ts';
import { uploadResumable, waitForMedia, type UploadState } from '../src/core/uploader.ts';
import { SseParser } from '../src/core/sse.ts';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maka-mobile-'));
process.env.MAKA_DATA_DIR = dataDir;
process.env.DATABASE_URL ||= 'postgres://postgres@localhost:5432/maka';
const schema = 'maka_mobile_' + Math.random().toString(36).slice(2, 10);
// @ts-ignore – plain JS server module
const { createApp } = await import('../../server/app.js');

let app: any, base = '';
before(async () => {
  app = await createApp({ schema });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `http://localhost:${app.server.address().port}`;
});
after(async () => {
  await app.db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function client(fetchImpl?: typeof fetch) {
  let token: string | null = null;
  const device = 'test-device-' + Math.random();
  const api = createApi({ baseUrl: base, getToken: () => token, setToken: (t) => { token = t; }, deviceId: () => device, fetchImpl });
  return { api, setToken: (t: string | null) => { token = t; }, token: () => token };
}
let n = 0;
async function adult(c = client()) {
  app.ctx.limiter.buckets.clear();
  const h = 'mob' + ++n + Math.random().toString(36).slice(2, 6);
  const r = await c.api.post('/api/auth/register', { email: `${h}@ex.com`, password: 'long-enough-pw', handle: h, displayName: h, acceptTerms: true });
  c.setToken(r.token);
  assert.equal(r.user.ageStatus, 'unverified');
  await assert.rejects(c.api.get('/api/feed'), (e: ApiError) => e.code === 'age_verification_required');
  const s = await c.api.post('/api/age/start', { method: 'id_selfie' });
  const done = await c.api.post('/api/age/test/complete', { checkId: s.checkId, outcome: 'verified', testIdentity: h });
  assert.equal(done.user.ageStatus, 'verified');
  return { ...c, me: done.user };
}

const clip = path.join(dataDir, 'clip.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=15', '-t', '3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]);
const bytes = new Uint8Array(fs.readFileSync(clip));
const read = async (off: number, len: number) => bytes.slice(off, off + len);
const CHUNK = Math.ceil(bytes.length / 5);

test('Uploads survive a flaky network (dropped PUTs are retried from the server offset)', async () => {
  let puts = 0;
  const flaky: typeof fetch = async (input, init) => {
    if (init?.method === 'PUT' && ++puts % 2 === 0) throw new TypeError('Network request failed');
    return fetch(input, init);
  };
  const u = await adult(client(flaky));
  const progress: number[] = [];
  const id = await uploadResumable({ api: u.api, size: bytes.length, kind: 'video', read, maxChunkBytes: CHUNK, onProgress: (f) => progress.push(f), sleep: async () => {} });
  assert.ok(puts >= 8, 'several chunks, with failures in between');
  assert.equal(progress.at(-1), 1);
  const m = await waitForMedia(u.api, id);
  assert.equal(m.status, 'ready');
  const post = await u.api.post('/api/posts', { mediaId: id, caption: 'from the app' });
  assert.equal(post.post.status, 'published');
  assert.ok(post.post.videoUrl.startsWith('/media/'));
  assert.equal((await fetch(u.api.abs(post.post.videoUrl)!, { headers: { range: 'bytes=0-9' } })).status, 206);
});

test('An interrupted upload resumes after an app restart from saved state', async () => {
  let allowPuts = 2;
  const dying: typeof fetch = async (input, init) => {
    if (init?.method === 'PUT' && allowPuts-- <= 0) throw new TypeError('Network request failed');
    return fetch(input, init);
  };
  const u = await adult(client(dying));
  let saved: UploadState | null = null;
  await assert.rejects(uploadResumable({ api: u.api, size: bytes.length, kind: 'video', read, maxChunkBytes: CHUNK, maxFailures: 1, onState: (s) => { saved = s; }, sleep: async () => {} }));
  assert.ok(saved && (saved as UploadState).received === 2 * CHUNK, 'two chunks accepted before the crash');
  // "Restart": a new client with the same session token resumes the saved upload.
  const fresh = client(); fresh.setToken(u.token());
  const firstPutOffsets: number[] = [];
  const watching: typeof fetch = async (input, init) => { if (init?.method === 'PUT') firstPutOffsets.push(Number(new URL(String(input)).searchParams.get('offset'))); return fetch(input, init); };
  const resumed = client(watching); resumed.setToken(u.token());
  const id = await uploadResumable({ api: resumed.api, size: bytes.length, kind: 'video', read, resume: saved, maxChunkBytes: CHUNK });
  assert.equal(id, (saved as unknown as UploadState).uploadId, 'same upload continued');
  assert.equal(firstPutOffsets[0], 2 * CHUNK, 'did not re-send accepted bytes');
  assert.equal((await waitForMedia(resumed.api, id)).status, 'ready');
});

test('Realtime: a message arrives over the event stream and can be fetched after reconnect', async () => {
  const a = await adult(), b = await adult();
  const { ticket } = await b.api.post('/api/stream/ticket');
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/stream?ticket=${ticket}`, { signal: ctrl.signal });
  const parser = new SseParser();
  const reader = res.body!.getReader();
  const got = (async () => {
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return null;
      for (const ev of parser.feed(dec.decode(value))) if (ev.event === 'message') return JSON.parse(ev.data);
    }
  })();
  const cv = await a.api.post('/api/conversations', { memberIds: [b.me.id], message: 'hello from the app' });
  const msg = await got;
  ctrl.abort();
  assert.equal(msg.conversationId, cv.id);
  assert.equal(msg.body, 'hello from the app');
  // Reconnect catch-up: only messages after the last one seen.
  await a.api.post(`/api/conversations/${cv.id}/messages`, { body: 'second' });
  const missed = await b.api.get(`/api/conversations/${cv.id}/messages?since=${msg.createdAt}`);
  assert.deepEqual(missed.map((m: any) => m.body), ['second']);
  // Tickets are single-use.
  assert.equal((await fetch(`${base}/api/stream?ticket=${ticket}`)).status, 401);
});

test('Feed items carry everything the vertical player needs, with no dislike field', async () => {
  const u = await adult();
  const feed = await u.api.get('/api/feed?mode=foryou');
  assert.ok(feed.items.length >= 1);
  const p = feed.items[0];
  for (const k of ['id', 'videoUrl', 'posterUrl', 'author', 'likes', 'comments', 'liked', 'saved', 'shareUrl']) assert.ok(k in p, k);
  assert.ok('followers' in p.author);
  assert.ok(!/dislike/i.test(JSON.stringify(feed)));
  assert.equal((await u.api.get('/api/feed?mode=following')).items.length, 0);
});

test('Signing out clears the token when the server rejects it', async () => {
  let signedOut = false, token: string | null = 'not-a-real-token';
  const api: Api = createApi({ baseUrl: base, getToken: () => token, setToken: (t) => { token = t; }, deviceId: () => 'd', onSignedOut: () => { signedOut = true; } });
  await assert.rejects(api.get('/api/me'));
  assert.equal(token, null); assert.equal(signedOut, true);
});
