import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { openDb, helpers, id, now } from './db.js';
import { createStorage } from './storage.js';
import { Router, send, fail, readJson, securityHeaders, RateLimiter, sendFile, clientIp, HttpError } from './http.js';
import { signMediaUrl, verifyMediaSig, mediaKey } from './media.js';
import { loadLexicon } from './safety.js';
import { registerAuth } from './routes/auth.js';
import { registerSocial } from './routes/social.js';
import { registerMessaging } from './routes/messaging.js';
import { registerCinema } from './routes/cinema.js';
import { registerCommerce } from './routes/commerce.js';
import { registerAdmin } from './routes/admin.js';

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Map an array through an async function, in order. */
export const mapAsync = (list, fn) => Promise.all(list.map(fn));

export async function createApp({ databaseUrl, schema, storage } = {}) {
  const db = await openDb({ url: databaseUrl, schema });
  const q = helpers(db);
  storage = storage || await createStorage();
  const router = new Router();
  const limiter = new RateLimiter();
  loadLexicon(process.env.MAKA_LEXICON_FILE);

  // ---- realtime (Server-Sent Events) ------------------------------------
  // In-process fan-out. Several instances need a shared bus (Redis/Postgres
  // LISTEN/NOTIFY) — see README "Scale and operations".
  const streams = new Map(); // userId -> Set(res)
  const tickets = new Map(); // one-time stream tickets (EventSource cannot send headers)
  const events = {
    emit(userId, type, data) {
      for (const res of streams.get(userId) || []) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    },
  };

  // ---- shared helpers used by route modules -------------------------------
  const ctx = {
    db, q, storage, limiter, events, config, mapAsync,
    async audit(actorId, action, targetType, targetId, details = {}) {
      await q.run('INSERT INTO audit_log (actor_id, action, target_type, target_id, details, created_at) VALUES (?,?,?,?,?,?)',
        actorId, action, targetType, targetId, JSON.stringify(details), now());
    },
    async notify(userId, type, actorId, refType, refId, text) {
      if (userId === actorId) return;
      if (actorId && await ctx.isBlockedEitherWay(userId, actorId)) return;
      if (actorId && await q.get('SELECT 1 FROM mutes WHERE muter_id=? AND muted_id=?', userId, actorId)) return;
      const nid = id('n_');
      await q.run('INSERT INTO notifications (id,user_id,type,actor_id,ref_type,ref_id,text,created_at) VALUES (?,?,?,?,?,?,?,?)',
        nid, userId, type, actorId, refType, refId, text, now());
      events.emit(userId, 'notification', { id: nid, type, text });
      // Push (APNs/FCM) is delivered here once config.pushProvider is configured.
    },
    async isBlockedEitherWay(a, b) {
      return !!await q.get('SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)', a, b, b, a);
    },
    async assetUrl(ref) {
      if (!ref) return null;
      if (ref.startsWith('asset:')) return '/assets/' + ref.slice(6);
      const m = await q.get("SELECT id, file FROM media WHERE id=? AND status='ready'", ref);
      return m ? signMediaUrl(m.id, m.file) : null;
    },
    async publicUser(u, viewerId) {
      if (!u) return null;
      const v = viewerId || '';
      const r = await q.get(`SELECT
        (SELECT COUNT(*) FROM follows WHERE followee_id=?) followers,
        (SELECT COUNT(*) FROM follows WHERE follower_id=?) following,
        (SELECT COUNT(*) FROM posts WHERE author_id=? AND status='published') posts,
        EXISTS (SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?) is_following,
        EXISTS (SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?) follows_you,
        EXISTS (SELECT 1 FROM blocks WHERE blocker_id=? AND blocked_id=?) is_blocked,
        EXISTS (SELECT 1 FROM mutes WHERE muter_id=? AND muted_id=?) is_muted`,
      u.id, u.id, u.id, v, u.id, u.id, v, v, u.id, v, u.id);
      return {
        id: u.id, handle: u.handle, displayName: u.display_name, bio: u.bio,
        avatarUrl: await ctx.assetUrl(u.avatar), isSample: !!u.is_sample,
        followers: r.followers, following: r.following, posts: r.posts, // follower count is public, never used for eligibility/ranking
        isFollowing: !!viewerId && r.is_following,
        followsYou: !!viewerId && r.follows_you,
        isBlocked: !!viewerId && r.is_blocked,
        isMuted: !!viewerId && r.is_muted,
      };
    },
    async serializePost(p, viewerId) {
      const author = await q.get('SELECT * FROM users WHERE id=?', p.author_id);
      const m = p.media_id ? await q.get('SELECT * FROM media WHERE id=?', p.media_id) : null;
      const ready = m && m.status === 'ready';
      const v = viewerId || '';
      const counts = await q.get(`SELECT
        (SELECT COUNT(*) FROM likes WHERE post_id=?) likes,
        (SELECT COUNT(*) FROM comments WHERE post_id=? AND status='visible') comments,
        (SELECT COUNT(*) FROM saves WHERE post_id=?) saves,
        EXISTS (SELECT 1 FROM likes WHERE user_id=? AND post_id=?) liked,
        EXISTS (SELECT 1 FROM saves WHERE user_id=? AND post_id=?) saved`, p.id, p.id, p.id, v, p.id, v, p.id);
      return {
        id: p.id, kind: p.kind, caption: p.caption, altText: p.alt_text, status: p.status,
        author: await ctx.publicUser(author, viewerId),
        videoUrl: ready && p.kind === 'video' ? signMediaUrl(m.id, m.file) : null,
        imageUrl: ready && p.kind === 'image' ? signMediaUrl(m.id, m.file) : null,
        posterUrl: ready ? signMediaUrl(m.id, m.poster) : null,
        captionsUrl: p.captions_vtt ? `/api/posts/${p.id}/captions.vtt` : null,
        mediaStatus: m?.status || null, mediaError: m?.error || null,
        duration: m?.duration || null,
        likes: counts.likes, comments: counts.comments, views: p.view_count,
        // There is intentionally no dislike count anywhere in the API.
        liked: !!viewerId && counts.liked,
        saved: !!viewerId && counts.saved,
        allowComments: !!p.allow_comments, remixPolicy: p.remix_policy, isPaidPartnership: !!p.is_paid_partnership,
        createdAt: p.published_at || p.created_at, shareUrl: `${config.publicOrigin}/#/p/${p.id}`,
      };
    },
    serializePosts(list, viewerId) { return mapAsync(list, (p) => ctx.serializePost(p, viewerId)); },
    requireWrite(user) {
      if (user.status === 'restricted') fail(403, 'account_restricted', 'Your account is temporarily restricted from posting, commenting and messaging. You can appeal from Profile → Safety.');
    },
    stream: { tickets, streams },
    sha,
  };

  // ---- authentication middleware -----------------------------------------
  async function authenticate(req) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return null;
    const s = await q.get('SELECT * FROM sessions WHERE token_hash=?', sha(token));
    if (!s || s.expires_at < now()) return null;
    const u = await q.get('SELECT * FROM users WHERE id=?', s.user_id);
    if (!u) return null;
    if (u.status === 'suspended' && u.suspended_until && u.suspended_until < now()) {
      await q.run("UPDATE users SET status='active', suspended_until=NULL WHERE id=?", u.id);
      u.status = 'active';
    }
    return u;
  }
  ctx.authenticate = authenticate;

  function gate(level, user) {
    if (level === 'public') return;
    if (!user) fail(401, 'auth_required', 'Please sign in.');
    if (['banned', 'ineligible', 'deleted'].includes(user.status)) fail(403, 'account_closed', 'This account is not active.');
    if (user.status === 'suspended') fail(403, 'account_suspended', 'This account is suspended.', { until: user.suspended_until });
    if (level === 'session') return;
    // Strict 19+: no access to any community feature until age is verified.
    if (user.age_status !== 'verified') fail(403, 'age_verification_required', 'Verify that you are 19 or older to use Mäka.');
    if (level === 'admin' && user.role !== 'admin') fail(403, 'admin_only');
  }

  registerAuth(router, ctx);
  registerSocial(router, ctx);
  registerMessaging(router, ctx);
  registerCinema(router, ctx);
  registerCommerce(router, ctx);
  registerAdmin(router, ctx);

  router.get('/api/health', { auth: 'public' }, async () => {
    await q.get('SELECT 1');
    return {
      ok: true, env: config.env, inviteRequired: !!config.inviteCode,
      database: 'postgres',
      storage: storage.name === 's3' ? 'object storage (S3-compatible)' : 'local disk (development only)',
      integrations: {
        ageVerification: config.ageProvider === 'test' ? 'TEST SIMULATOR (not real verification)' : config.ageProvider,
        payments: config.paymentsProvider || 'not configured',
        push: config.pushProvider || 'not configured',
        mediaScanning: config.mediaScanner || 'not configured',
        filmLicensing: 'no licensed titles',
      },
    };
  });

  const webRoot = path.join(config.root, 'web');

  async function handle(req, res) {
    securityHeaders(res);
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    try {
      // Signed media, streamed from object storage (Range requests pass through).
      const mm = /^\/media\/([\w-]+)\/([\w.]+)$/.exec(p);
      if (mm) {
        if (!verifyMediaSig(mm[1], mm[2], url.searchParams.get('e'), url.searchParams.get('s'))) return send(res, 403, { error: 'invalid_media_signature' });
        return await storage.serve(req, res, mediaKey(mm[1], mm[2]), { cache: 'private, max-age=3600' });
      }
      if (!p.startsWith('/api/')) {
        const rel = p === '/' ? 'index.html' : p.slice(1);
        const file = path.normalize(path.join(webRoot, rel));
        if (!file.startsWith(webRoot)) return send(res, 400, { error: 'bad_path' });
        return sendFile(req, res, file, { cache: rel.startsWith('assets/') ? 'public, max-age=86400' : 'no-cache' });
      }
      limiter.check('ip:' + clientIp(req), 600, 600);
      const match = router.match(req.method, p);
      if (!match) return send(res, 404, { error: 'not_found' });
      if (match.methodNotAllowed) return send(res, 405, { error: 'method_not_allowed' });
      const [opts, handler] = match.route.handlers;
      const user = await authenticate(req);
      gate(opts.auth || 'member', user);
      if (user && req.method !== 'GET' && req.method !== 'HEAD') limiter.check('user:' + user.id, 120, 120);
      const result = await handler({ req, res, params: match.params, query: url.searchParams, user, body: () => readJson(req) });
      if (result !== undefined && !res.headersSent) send(res, 200, result);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, message: e.message, ...(e.extra || {}) });
      console.error(e);
      send(res, 500, { error: 'server_error', message: 'Something went wrong.' });
    }
  }

  const server = http.createServer(handle);
  return {
    server, db, q, ctx, storage,
    async close() {
      for (const set of streams.values()) for (const r of set) r.end();
      await new Promise((r) => server.close(() => r()));
      await db.end();
    },
  };
}
