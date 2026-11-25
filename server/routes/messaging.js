import crypto from 'node:crypto';
import { fail } from '../http.js';
import { id, now } from '../db.js';
import { screenText } from '../safety.js';

export function registerMessaging(r, ctx) {
  const { q, mapAsync } = ctx;

  const member = (cid, uid) => q.get('SELECT 1 FROM conversation_members WHERE conversation_id=? AND user_id=?', cid, uid);
  const canMessage = async (from, to) => {
    if (await ctx.isBlockedEitherWay(from.id, to.id)) return 'blocked';
    if (to.age_status !== 'verified' || !['active', 'restricted'].includes(to.status)) return 'unavailable';
    if (to.dm_policy === 'nobody') return 'dm_closed';
    if (to.dm_policy === 'following' && !await q.get('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?', to.id, from.id)) return 'dm_following_only';
    return null;
  };
  ctx.canMessage = canMessage;

  ctx.openConversation = async function (creator, others, title) {
    if (others.length === 1) {
      const existing = await q.get(`SELECT c.id FROM conversations c WHERE c.is_group=0
        AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id=c.id AND user_id=?)
        AND EXISTS (SELECT 1 FROM conversation_members WHERE conversation_id=c.id AND user_id=?)`, creator.id, others[0].id);
      if (existing) return existing.id;
    }
    const cid = id('cv_');
    await q.tx(async () => {
      await q.run('INSERT INTO conversations (id,is_group,title,created_by,created_at,last_message_at) VALUES (?,?,?,?,?,?)', cid, others.length > 1 ? 1 : 0, title || null, creator.id, now(), now());
      for (const u of [creator, ...others]) await q.run('INSERT INTO conversation_members (conversation_id,user_id) VALUES (?,?)', cid, u.id);
    });
    return cid;
  };

  ctx.postMessage = async function (cid, sender, text) {
    const screen = screenText(text);
    const mid = id('msg_');
    const status = screen.action === 'hold' ? 'held' : 'sent';
    const t = now();
    await q.run('INSERT INTO messages (id,conversation_id,sender_id,body,status,created_at) VALUES (?,?,?,?,?,?)', mid, cid, sender.id, text, status, t);
    await q.run('UPDATE conversations SET last_message_at=? WHERE id=?', t, cid);
    await q.run('UPDATE conversation_members SET last_read_at=? WHERE conversation_id=? AND user_id=?', t, cid, sender.id);
    if (status === 'sent') {
      for (const m of await q.all('SELECT user_id FROM conversation_members WHERE conversation_id=? AND user_id!=?', cid, sender.id)) {
        if (await ctx.isBlockedEitherWay(m.user_id, sender.id)) continue;
        ctx.events.emit(m.user_id, 'message', { conversationId: cid, id: mid, body: text, sender: sender.handle, createdAt: t });
        if (!await q.get('SELECT 1 FROM mutes WHERE muter_id=? AND muted_id=?', m.user_id, sender.id))
          ctx.pushTo(m.user_id, { title: 'Mäka', body: `New message from @${sender.handle}`, data: { type: 'message', refType: 'conversation', refId: cid } });
      }
    } else {
      await q.run('INSERT INTO reports (id,reporter_id,target_type,target_id,target_user_id,reason,details,evidence,priority,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        id('r_'), 'system', 'message', mid, sender.id, 'bullying', 'Automatic hold: ' + screen.reasons.join(', '), text, 3, now());
    }
    return { id: mid, status };
  };

  r.get('/api/conversations', {}, async ({ user }) => {
    const rows = await q.all(`SELECT c.*, cm.last_read_at FROM conversations c JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=?
      ORDER BY c.last_message_at DESC`, user.id);
    return mapAsync(rows, async (c) => {
      const members = await q.all('SELECT u.* FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.conversation_id=? AND u.id!=?', c.id, user.id);
      const last = await q.get(`SELECT * FROM messages WHERE conversation_id=? AND (status='sent' OR sender_id=?)
        AND sender_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?) ORDER BY created_at DESC LIMIT 1`, c.id, user.id, user.id);
      const unread = (await q.get(`SELECT COUNT(*) n FROM messages WHERE conversation_id=? AND created_at>? AND sender_id!=? AND status='sent'
        AND sender_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)`, c.id, c.last_read_at, user.id, user.id)).n;
      return { id: c.id, isGroup: !!c.is_group, title: c.title || members.map((m) => m.display_name).join(', '),
        members: await mapAsync(members, (m) => ctx.publicUser(m, user.id)), lastMessage: last ? { body: last.body, at: last.created_at, mine: last.sender_id === user.id } : null, unread };
    });
  });

  r.post('/api/conversations', {}, async ({ user, body }) => {
    ctx.requireWrite(user);
    const b = await body();
    const ids = [...new Set((b.memberIds || []).map(String))].filter((x) => x !== user.id);
    if (!ids.length || ids.length > 31) fail(400, 'invalid_members', 'Choose 1–31 people.');
    const others = [];
    for (const k of ids) others.push((await q.get('SELECT * FROM users WHERE id=? OR lower(handle)=lower(?)', k, k)) || fail(404, 'user_not_found'));
    for (const o of others) {
      const why = await canMessage(user, o);
      if (why) fail(403, why, why === 'dm_following_only' ? `@${o.handle} only accepts messages from people they follow.` : `You can’t message @${o.handle}.`);
    }
    const cid = await ctx.openConversation(user, others, b.title ? String(b.title).slice(0, 60) : null);
    if (b.message) await ctx.postMessage(cid, user, String(b.message).slice(0, 2000));
    return { id: cid };
  });

  r.get('/api/conversations/:id/messages', {}, async ({ params, user, query }) => {
    if (!await member(params.id, user.id)) fail(404, 'not_found');
    await q.run('UPDATE conversation_members SET last_read_at=? WHERE conversation_id=? AND user_id=?', now(), params.id, user.id);
    // `since` lets clients fetch only what they missed after a reconnect.
    const since = Number(query.get('since') || 0);
    const msgs = await q.all(`SELECT * FROM messages WHERE conversation_id=? AND (status='sent' OR sender_id=?) AND created_at>?
      AND sender_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?) ORDER BY created_at ASC LIMIT 500`, params.id, user.id, since, user.id);
    const senders = {};
    const out = [];
    for (const m of msgs) {
      senders[m.sender_id] ??= await ctx.publicUser(await q.get('SELECT * FROM users WHERE id=?', m.sender_id), user.id);
      out.push({ id: m.id, body: m.body, status: m.status, mine: m.sender_id === user.id, createdAt: m.created_at, sender: senders[m.sender_id] });
    }
    return out;
  });

  r.post('/api/conversations/:id/messages', {}, async ({ params, user, body }) => {
    ctx.requireWrite(user);
    if (!await member(params.id, user.id)) fail(404, 'not_found');
    ctx.limiter.check('msg:' + user.id, 30, 30);
    const others = await q.all('SELECT u.* FROM conversation_members cm JOIN users u ON u.id=cm.user_id WHERE cm.conversation_id=? AND u.id!=?', params.id, user.id);
    const conv = await q.get('SELECT * FROM conversations WHERE id=?', params.id);
    if (!conv.is_group && others[0] && await ctx.isBlockedEitherWay(user.id, others[0].id)) fail(403, 'blocked', 'You can’t message this person.');
    const text = String((await body()).body || '').trim();
    if (!text || text.length > 2000) fail(400, 'invalid_message');
    const out = await ctx.postMessage(params.id, user, text);
    return { ...out, message: out.status === 'held' ? 'This message was held because it may break the Community Guidelines.' : null };
  });

  r.post('/api/conversations/:id/leave', {}, async ({ params, user }) => {
    await q.run('DELETE FROM conversation_members WHERE conversation_id=? AND user_id=?', params.id, user.id);
    return { ok: true };
  });

  // ---- realtime stream (SSE). EventSource can't set headers, so the client
  // trades its bearer token for a 60-second one-time ticket.
  r.post('/api/stream/ticket', {}, ({ user }) => {
    const t = crypto.randomBytes(18).toString('base64url');
    ctx.stream.tickets.set(t, { userId: user.id, exp: now() + 60000 });
    return { ticket: t };
  });
  r.get('/api/stream', { auth: 'public' }, ({ req, res, query }) => {
    const t = ctx.stream.tickets.get(query.get('ticket') || '');
    ctx.stream.tickets.delete(query.get('ticket') || '');
    if (!t || t.exp < now()) fail(401, 'invalid_ticket');
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    const set = ctx.stream.streams.get(t.userId) || new Set();
    set.add(res); ctx.stream.streams.set(t.userId, set);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); set.delete(res); });
  });
}
