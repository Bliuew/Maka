import { fail } from '../http.js';
import { id, now } from '../db.js';
import { screenText } from '../safety.js';
import { getLiveProvider } from '../live.js';

export function registerLive(r, ctx) {
  const { q, mapAsync, config } = ctx;
  const ser = async (l, viewerId) => ({
    id: l.id, title: l.title, status: l.status, startedAt: l.started_at, playbackUrl: l.status === 'live' ? l.playback_url : null,
    host: await ctx.publicUser(await q.get('SELECT * FROM users WHERE id=?', l.host_id), viewerId),
  });

  // Ends a stream at the provider and marks it removed (moderation).
  ctx.removeLive = async (liveId) => {
    const l = await q.get('SELECT * FROM live_streams WHERE id=?', liveId);
    if (!l) return;
    await q.run("UPDATE live_streams SET status='removed', ended_at=COALESCE(ended_at, ?) WHERE id=?", now(), liveId);
    if (l.provider_ref) await getLiveProvider().end(l.provider_ref).catch(() => {});
  };

  r.get('/api/live', {}, async ({ user }) => {
    const rows = await q.all(`SELECT l.* FROM live_streams l WHERE l.status='live'
      AND l.host_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?) AND l.host_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
      ORDER BY l.started_at DESC LIMIT 50`, user.id, user.id);
    return { configured: !!getLiveProvider().name, streams: await mapAsync(rows, (l) => ser(l, user.id)) };
  });

  // Moves a stream between waiting -> live -> ended. Called by the provider webhook and by GET below.
  async function applyState(l, state) {
    if (state === 'live' && l.status === 'created') {
      await q.run("UPDATE live_streams SET status='live', started_at=? WHERE id=? AND status='created'", now(), l.id);
    } else if (state === 'ended' && (l.status === 'live' || l.status === 'created')) {
      await q.run("UPDATE live_streams SET status='ended', ended_at=? WHERE id=? AND status IN ('live','created')", now(), l.id);
      if (l.status === 'live') await getLiveProvider().end(l.provider_ref).catch(() => {});
    }
  }

  // One stream. While the host waits for their broadcast app to connect, this checks the provider.
  r.get('/api/live/:id', {}, async ({ user, params }) => {
    let l = (await q.get('SELECT * FROM live_streams WHERE id=?', params.id)) || fail(404, 'not_found');
    if (await ctx.isBlockedEitherWay(user.id, l.host_id)) fail(404, 'not_found');
    if (l.host_id !== user.id && l.status !== 'live') fail(404, 'not_found', 'This live has ended.');
    const provider = getLiveProvider();
    if (l.host_id === user.id && l.status === 'created' && l.provider_ref && provider.status) {
      ctx.limiter.check('livestatus:' + user.id, 30, 30);
      await applyState(l, await provider.status(l.provider_ref).catch(() => 'waiting'));
      l = await q.get('SELECT * FROM live_streams WHERE id=?', l.id);
    }
    return ser(l, user.id);
  });

  r.post('/api/live/webhook', { auth: 'public' }, async ({ req, raw }) => {
    const provider = getLiveProvider();
    if (!provider.verifyWebhook) fail(503, 'live_not_configured');
    let ev;
    try { ev = provider.verifyWebhook(await raw(), req.headers); } catch (e) { fail(e.status || 400, e.code || 'invalid_signature'); }
    if (ev?.providerRef) {
      const l = await q.get('SELECT * FROM live_streams WHERE provider=? AND provider_ref=?', provider.name, ev.providerRef);
      if (l) await applyState(l, ev.type);
    }
    return { received: true };
  });

  r.post('/api/live', {}, async ({ user, body }) => {
    ctx.requireWrite(user);
    ctx.limiter.check('live:' + user.id, 5, 5 / 60);
    const b = await body();
    const title = String(b.title || '').trim().slice(0, 100);
    if (!title) fail(400, 'title_required', 'Give your live a title.');
    if (screenText(title).action === 'hold') fail(400, 'title_not_allowed', 'This title may break the Community Guidelines. Please change it.');
    const provider = getLiveProvider();
    const lid = id('lv_');
    let created;
    try { created = await provider.create({ id: lid, title, hostId: user.id }); }
    catch (e) { fail(e.status || 503, e.code || 'live_provider_error', e.message); }
    await q.run('INSERT INTO live_streams (id,host_id,title,status,provider,provider_ref,playback_url,created_at) VALUES (?,?,?,?,?,?,?,?)',
      lid, user.id, title, 'created', provider.name, created.providerRef, created.playbackUrl || null, now());
    // The ingest key goes only to the host and is never stored.
    return { id: lid, ingestUrl: created.ingestUrl, streamKey: created.streamKey };
  });

  r.post('/api/live/:id/end', {}, async ({ user, params }) => {
    const l = (await q.get('SELECT * FROM live_streams WHERE id=?', params.id)) || fail(404, 'not_found');
    if (l.host_id !== user.id && user.role !== 'admin') fail(403, 'forbidden');
    if (l.status === 'ended' || l.status === 'removed') return { status: l.status };
    await q.run("UPDATE live_streams SET status='ended', ended_at=? WHERE id=?", now(), l.id);
    if (l.provider_ref) await getLiveProvider().end(l.provider_ref).catch(() => {});
    if (user.role === 'admin' && l.host_id !== user.id) await ctx.audit(user.id, 'live_end', 'live', l.id, {});
    return { status: 'ended' };
  });
}
