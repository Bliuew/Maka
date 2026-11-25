import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { fail, clientIp } from '../http.js';
import { id, now } from '../db.js';
import { AGE_METHODS, getProvider, personRefHash } from '../age.js';
import { screenText } from '../safety.js';

const scrypt = promisify(crypto.scrypt);
const SC = { N: 16384, r: 8, p: 1 };

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, 32, SC);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function checkPassword(pw, stored) {
  const [, s, k] = stored.split('$');
  const key = await scrypt(pw, Buffer.from(s, 'base64'), 32, SC);
  return crypto.timingSafeEqual(key, Buffer.from(k, 'base64'));
}
const normEmail = (e) => {
  let [local, domain] = String(e).trim().toLowerCase().split('@');
  local = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') { local = local.replace(/\./g, ''); domain = 'gmail.com'; }
  return `${local}@${domain}`;
};
const HANDLE_RE = /^[a-z0-9._]{3,24}$/i;
const RESERVED = ['admin', 'maka', 'support', 'help', 'official', 'moderator', 'security'];

export function registerAuth(r, ctx) {
  const { q, sha } = ctx;

  async function createSession(userId, req) {
    const token = crypto.randomBytes(32).toString('base64url');
    const device = req.headers['x-device-id'] ? sha('dev:' + req.headers['x-device-id']) : null;
    await q.run('INSERT INTO sessions (token_hash,user_id,device_hash,created_at,expires_at) VALUES (?,?,?,?,?)',
      sha(token), userId, device, now(), now() + ctx.config.sessionDays * 864e5);
    return token;
  }
  const me = async (u) => ({
    ...(await ctx.publicUser(u, u.id)), email: u.email, role: u.role, status: u.status, ageStatus: u.age_status,
    dmPolicy: u.dm_policy, defaultRemix: u.default_remix, commentFilter: JSON.parse(u.comment_filter),
    suspendedUntil: u.suspended_until,
  });
  ctx.me = me;

  r.post('/api/auth/register', { auth: 'public' }, async ({ req, body }) => {
    ctx.limiter.check('register:' + clientIp(req), 5, 5 / 60);
    const b = await body();
    const email = String(b.email || '').trim();
    const password = String(b.password || '');
    const handle = String(b.handle || '').trim().replace(/^@/, '');
    const displayName = String(b.displayName || '').trim().slice(0, 40);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'invalid_email', 'Enter a valid email address.');
    if (password.length < 10) fail(400, 'weak_password', 'Use at least 10 characters for your password.');
    if (!HANDLE_RE.test(handle) || RESERVED.some((w) => handle.toLowerCase() === w)) fail(400, 'invalid_handle', 'Handles use 3–24 letters, numbers, dots or underscores.');
    if (!displayName) fail(400, 'invalid_name', 'Add a display name.');
    if (ctx.config.inviteCode && String(b.inviteCode || '').trim() !== ctx.config.inviteCode) fail(403, 'invite_required', 'This is a private test server. Enter a valid invite code.');
    if (b.acceptTerms !== true) fail(400, 'terms_required', 'Please accept the Community Guidelines and Terms.');
    if (screenText(handle + ' ' + displayName).action === 'hold') fail(400, 'name_not_allowed', 'Please choose a different name.');
    if (await q.get('SELECT 1 FROM users WHERE email_norm=?', normEmail(email))) fail(409, 'email_taken', 'An account with this email already exists.');
    if (await q.get('SELECT 1 FROM users WHERE lower(handle)=lower(?)', handle)) fail(409, 'handle_taken', 'That handle is taken.');
    const uid = id('u_');
    await q.run(`INSERT INTO users (id,email,email_norm,pass_hash,handle,display_name,created_at) VALUES (?,?,?,?,?,?,?)`,
      uid, email, normEmail(email), await hashPassword(password), handle, displayName, now());
    // Ban-evasion signal: device previously used by a banned account -> human review (never auto-ban on a shared signal).
    if (req.headers['x-device-id']) {
      const dh = sha('dev:' + req.headers['x-device-id']);
      const hit = await q.get("SELECT u.id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.device_hash=? AND u.status='banned' LIMIT 1", dh);
      if (hit) {
        await q.run('INSERT INTO reports (id,reporter_id,target_type,target_id,target_user_id,reason,details,priority,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
          id('r_'), 'system', 'user', uid, uid, 'other', `Possible ban evasion: device shared with banned account ${hit.id}`, 3, now());
      }
    }
    const token = await createSession(uid, req);
    return { token, user: await me(await q.get('SELECT * FROM users WHERE id=?', uid)) };
  });

  r.post('/api/auth/login', { auth: 'public' }, async ({ req, body }) => {
    const b = await body();
    ctx.limiter.check('login:' + clientIp(req), 10, 10 / 5);
    const u = await q.get('SELECT * FROM users WHERE email_norm=?', normEmail(b.email || ''));
    if (!u || !(await checkPassword(String(b.password || ''), u.pass_hash))) fail(401, 'invalid_credentials', 'Email or password is incorrect.');
    if (u.status === 'banned') fail(403, 'account_banned', 'This account has been permanently removed for violating the Community Guidelines. You may submit an appeal.', { appealEmail: 'appeals@maka.example' });
    if (['ineligible', 'deleted'].includes(u.status)) fail(403, 'account_closed', 'This account is not active.');
    if (u.status === 'suspended' && u.suspended_until > now()) fail(403, 'account_suspended', 'This account is suspended.', { until: u.suspended_until });
    return { token: await createSession(u.id, req), user: await me(u) };
  });

  r.post('/api/auth/logout', { auth: 'session' }, async ({ req }) => {
    await q.run('DELETE FROM sessions WHERE token_hash=?', sha(req.headers.authorization.slice(7)));
    return { ok: true };
  });

  r.get('/api/me', { auth: 'session' }, ({ user }) => me(user));

  r.patch('/api/me', { auth: 'member' }, async ({ user, body }) => {
    const b = await body();
    const sets = [], vals = [];
    if (b.displayName !== undefined) {
      const v = String(b.displayName).trim().slice(0, 40);
      if (!v || screenText(v).action === 'hold') fail(400, 'invalid_name', 'Please choose a different display name.');
      sets.push('display_name=?'); vals.push(v);
    }
    if (b.bio !== undefined) {
      const v = String(b.bio).slice(0, 200);
      if (screenText(v).action === 'hold') fail(400, 'bio_not_allowed', 'Your bio contains content that is not allowed.');
      sets.push('bio=?'); vals.push(v);
    }
    if (b.dmPolicy !== undefined) { if (!['everyone', 'following', 'nobody'].includes(b.dmPolicy)) fail(400, 'invalid'); sets.push('dm_policy=?'); vals.push(b.dmPolicy); }
    if (b.defaultRemix !== undefined) { if (!['everyone', 'followers', 'nobody'].includes(b.defaultRemix)) fail(400, 'invalid'); sets.push('default_remix=?'); vals.push(b.defaultRemix); }
    if (b.commentFilter !== undefined) {
      if (!Array.isArray(b.commentFilter)) fail(400, 'invalid');
      sets.push('comment_filter=?'); vals.push(JSON.stringify(b.commentFilter.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 100)));
    }
    if (b.avatarMediaId !== undefined) {
      const m = await q.get("SELECT * FROM media WHERE id=? AND owner_id=? AND kind='image' AND status='ready'", b.avatarMediaId, user.id);
      if (!m) fail(400, 'invalid_media');
      sets.push('avatar=?'); vals.push(m.id);
    }
    if (sets.length) await q.run(`UPDATE users SET ${sets.join(',')} WHERE id=?`, ...vals, user.id);
    return me(await q.get('SELECT * FROM users WHERE id=?', user.id));
  });

  // Account deletion (GDPR / PIPEDA). Content removed, identity scrubbed.
  // Moderation evidence on reports is retained per the retention policy.
  r.delete('/api/me', { auth: 'session' }, async ({ user, body }) => {
    const b = await body();
    if (!(await checkPassword(String(b.password || ''), user.pass_hash))) fail(401, 'invalid_credentials', 'Password is incorrect.');
    await q.tx(async () => {
      await q.run("UPDATE posts SET status='removed' WHERE author_id=?", user.id);
      await q.run("UPDATE comments SET status='removed', body='' WHERE author_id=?", user.id);
      for (const t of ['likes', 'saves', 'views', 'not_interested', 'watchlist', 'watch_progress']) await q.run(`DELETE FROM ${t} WHERE user_id=?`, user.id);
      await q.run('DELETE FROM follows WHERE follower_id=? OR followee_id=?', user.id, user.id);
      await q.run('DELETE FROM sessions WHERE user_id=?', user.id);
      const gone = 'deleted_' + user.id.slice(2);
      await q.run("UPDATE users SET status='deleted', email=?, email_norm=?, handle=?, display_name='Deleted account', bio='', avatar=NULL, pass_hash='x' WHERE id=?",
        gone + '@deleted.invalid', gone + '@deleted.invalid', gone, user.id);
    });
    return { ok: true };
  });

  r.get('/api/me/export', { auth: 'session' }, async ({ user }) => ({
    profile: await me(user),
    posts: await q.all('SELECT id, caption, status, created_at FROM posts WHERE author_id=?', user.id),
    comments: await q.all('SELECT id, post_id, body, status, created_at FROM comments WHERE author_id=?', user.id),
    following: await q.all('SELECT followee_id, created_at FROM follows WHERE follower_id=?', user.id),
    ageChecks: await q.all('SELECT provider, method, status, created_at, completed_at FROM age_checks WHERE user_id=?', user.id),
    orders: await q.all('SELECT id, status, total_cents, currency, created_at FROM orders WHERE buyer_id=?', user.id),
    exportedAt: new Date().toISOString(),
  }));

  // ---- 19+ age assurance ---------------------------------------------------
  r.get('/api/age/methods', { auth: 'public' }, () => {
    const p = getProvider();
    return { threshold: ctx.config.minimumAge, provider: p.name, isTestMode: !!p.isTest, methods: AGE_METHODS };
  });

  r.post('/api/age/start', { auth: 'session' }, async ({ user, body }) => {
    if (user.age_status === 'verified') fail(409, 'already_verified');
    const b = await body();
    if (!AGE_METHODS.some((m) => m.id === b.method)) fail(400, 'invalid_method');
    const provider = getProvider();
    const checkId = id('ac_');
    let start;
    try { start = provider.start({ id: checkId, userId: user.id, method: b.method, threshold: ctx.config.minimumAge }); }
    catch (e) { fail(503, e.code || 'age_provider_error', e.message); }
    await q.run('INSERT INTO age_checks (id,user_id,provider,method,status,created_at) VALUES (?,?,?,?,?,?)', checkId, user.id, provider.name, b.method, 'started', now());
    await q.run("UPDATE users SET age_status='pending' WHERE id=?", user.id);
    return { checkId, redirectUrl: start.redirectUrl, isTestMode: !!provider.isTest };
  });

  async function completeCheck(check, outcome, personRef) {
    const refHash = personRef ? personRefHash(personRef) : null;
    const user = await q.get('SELECT * FROM users WHERE id=?', check.user_id);
    if (outcome === 'verified' && refHash && await q.get('SELECT 1 FROM banned_identities WHERE person_ref_hash=?', refHash)) outcome = 'review';
    await q.run('UPDATE age_checks SET status=?, over_threshold=?, person_ref_hash=?, completed_at=? WHERE id=?',
      outcome, outcome === 'verified' ? 1 : outcome === 'under_age' ? 0 : null, refHash, now(), check.id);
    if (outcome === 'verified') {
      await q.run("UPDATE users SET age_status='verified' WHERE id=?", user.id);
    } else if (outcome === 'under_age') {
      // Strictly 19+: close the account, end sessions, and scrub personal data.
      await q.run("UPDATE users SET age_status='failed', status='ineligible', email=?, email_norm=?, display_name='Closed', bio='', pass_hash='x' WHERE id=?",
        'closed_' + user.id + '@invalid', 'closed_' + user.id + '@invalid', user.id);
      await q.run('DELETE FROM sessions WHERE user_id=?', user.id);
    } else if (outcome === 'review') {
      await q.run("UPDATE users SET age_status='review' WHERE id=?", user.id);
      await q.run('INSERT INTO reports (id,reporter_id,target_type,target_id,target_user_id,reason,details,priority,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        id('r_'), 'system', 'user', user.id, user.id, 'other', 'Age-verified identity matches a banned account (possible ban evasion).', 4, now());
    } else {
      await q.run("UPDATE users SET age_status='failed' WHERE id=?", user.id);
    }
    await ctx.audit('system', 'age_check_' + outcome, 'user', user.id, { method: check.method, provider: check.provider });
    return outcome;
  }

  // Test simulator endpoint – only exists while the test provider is active.
  r.post('/api/age/test/complete', { auth: 'session' }, async ({ user, body }) => {
    if (!getProvider().isTest) fail(404, 'not_found');
    const b = await body();
    const check = await q.get("SELECT * FROM age_checks WHERE id=? AND user_id=? AND status='started'", b.checkId, user.id);
    if (!check) fail(404, 'check_not_found');
    if (!['verified', 'under_age', 'failed'].includes(b.outcome)) fail(400, 'invalid_outcome');
    const outcome = await completeCheck(check, b.outcome, 'test-person:' + String(b.testIdentity || user.id));
    return { outcome, user: outcome === 'under_age' ? null : await me(await q.get('SELECT * FROM users WHERE id=?', user.id)) };
  });

  r.post('/api/age/webhook', { auth: 'public' }, () => {
    fail(501, 'age_provider_not_configured', 'Connect a real age-assurance provider to receive verification webhooks.');
  });
  ctx.completeAgeCheck = completeCheck;
}
