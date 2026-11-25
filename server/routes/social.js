import { fail } from '../http.js';
import { id, now } from '../db.js';
import { appendChunk, processUpload } from '../media.js';
import { screenText, REPORT_REASONS, REPORT_PRIORITY } from '../safety.js';

export function registerSocial(r, ctx) {
  const { q, config, mapAsync } = ctx;
  const getPost = async (pid) => (await q.get('SELECT * FROM posts WHERE id=?', pid)) || fail(404, 'post_not_found');
  const visibleTo = async (p, viewer) => {
    if (p.status === 'published') return !await ctx.isBlockedEitherWay(viewer.id, p.author_id);
    return p.author_id === viewer.id && p.status !== 'removed' || viewer.role === 'admin';
  };

  // ---------------- uploads (resumable, chunked) ----------------
  r.post('/api/uploads', {}, async ({ user, body }) => {
    ctx.requireWrite(user);
    ctx.limiter.check('upload:' + user.id, 20, 20 / 60);
    const b = await body();
    const kind = b.kind === 'image' ? 'image' : b.kind === 'video' ? 'video' : fail(400, 'invalid_kind');
    const size = Number(b.size);
    const max = kind === 'video' ? config.uploads.maxVideoBytes : config.uploads.maxImageBytes;
    if (!Number.isInteger(size) || size <= 0) fail(400, 'invalid_size');
    if (size > max) fail(413, 'file_too_large', `Maximum size is ${Math.round(max / 1048576)} MB.`);
    const mid = id('m_');
    await q.run('INSERT INTO media (id,owner_id,kind,status,total_size,created_at) VALUES (?,?,?,?,?,?)', mid, user.id, kind, 'uploading', size, now());
    return { uploadId: mid, chunkSize: config.uploads.chunkSize, received: 0 };
  });

  const ownUpload = async (mid, user) => (await q.get('SELECT * FROM media WHERE id=? AND owner_id=?', mid, user.id)) || fail(404, 'upload_not_found');

  r.get('/api/uploads/:id', {}, async ({ params, user }) => {
    const m = await ownUpload(params.id, user);
    return { uploadId: m.id, status: m.status, received: m.received, totalSize: m.total_size, error: m.error };
  });

  r.put('/api/uploads/:id', {}, async ({ req, params, user, query }) => {
    const m = await ownUpload(params.id, user);
    if (m.status !== 'uploading') fail(409, 'upload_closed');
    const offset = Number(query.get('offset'));
    if (!Number.isInteger(offset) || offset < 0) fail(400, 'invalid_offset');
    let result;
    try { result = await appendChunk(ctx.storage, q, m, offset, req); } catch (e) { if (e.code) fail(413, e.code); throw e; }
    if (!result.ok) fail(409, 'offset_mismatch', 'Resume from the server offset.', { received: result.received });
    return { received: result.received };
  });

  ctx.finishProcessing = async (m, out, ownerId) => {
    await q.run('UPDATE media SET status=?, file=?, poster=?, width=?, height=?, duration=?, error=? WHERE id=?',
      out.status, out.file || null, out.poster || null, out.width || null, out.height || null, out.duration || null, out.error || null, m.id);
    // Publish any posts waiting on this media.
    const waiting = await q.all("SELECT * FROM posts WHERE media_id=? AND status='processing'", m.id);
    for (const p of waiting) {
      if (out.status === 'ready') await q.run("UPDATE posts SET status='published', published_at=? WHERE id=?", now(), p.id);
      else await q.run("UPDATE posts SET status='draft' WHERE id=?", p.id);
      ctx.events.emit(ownerId, 'post_status', { postId: p.id, status: out.status === 'ready' ? 'published' : 'failed', error: out.error });
    }
    ctx.events.emit(ownerId, 'media_status', { mediaId: m.id, status: out.status, error: out.error });
  };

  r.post('/api/uploads/:id/complete', {}, async ({ params, user }) => {
    const m = await ownUpload(params.id, user);
    if (m.status !== 'uploading') return { status: m.status };
    if (m.received !== m.total_size) fail(409, 'incomplete', 'Upload is not complete yet.', { received: m.received });
    const claimed = await q.run("UPDATE media SET status='processing' WHERE id=? AND status='uploading'", m.id);
    if (!claimed.changes) return { status: 'processing' };
    processUpload(ctx.storage, m)
      .catch((e) => ({ status: 'rejected', error: 'Processing failed: ' + String(e.message).slice(0, 200) }))
      .then((out) => ctx.finishProcessing(m, out, user.id))
      .catch((e) => console.error('media processing', m.id, e));
    return { status: 'processing' };
  });

  // ---------------- posts ----------------
  r.post('/api/posts', {}, async ({ user, body }) => {
    ctx.requireWrite(user);
    ctx.limiter.check('post:' + user.id, 30, 30 / 60);
    const b = await body();
    const m = (await q.get('SELECT * FROM media WHERE id=? AND owner_id=?', b.mediaId, user.id)) || fail(400, 'media_required', 'Attach a video or photo.');
    if (m.status === 'rejected') fail(400, 'media_rejected', m.error);
    if (await q.get('SELECT 1 FROM posts WHERE media_id=?', m.id)) fail(409, 'media_already_used');
    const caption = String(b.caption || '').slice(0, 2200);
    const remix = ['everyone', 'followers', 'nobody'].includes(b.remixPolicy) ? b.remixPolicy : user.default_remix;
    const screen = screenText(caption);
    let status = b.draft ? 'draft' : m.status === 'ready' ? 'published' : 'processing';
    if (screen.action === 'hold' && status !== 'draft') status = 'held';
    let vtt = null;
    if (b.captionsVtt) { vtt = String(b.captionsVtt).slice(0, 100000); if (!vtt.startsWith('WEBVTT')) fail(400, 'invalid_captions', 'Captions must be WebVTT.'); }
    const pid = id('p_');
    await q.run(`INSERT INTO posts (id,author_id,media_id,kind,caption,alt_text,captions_vtt,status,allow_comments,remix_policy,is_paid_partnership,created_at,published_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, pid, user.id, m.id, m.kind, caption, String(b.altText || '').slice(0, 300), vtt, status,
      b.allowComments === false ? 0 : 1, remix, b.paidPartnership ? 1 : 0, now(), status === 'published' ? now() : null);
    if (status === 'held') {
      await q.run('INSERT INTO reports (id,reporter_id,target_type,target_id,target_user_id,reason,details,evidence,priority,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        id('r_'), 'system', 'post', pid, user.id, 'other', 'Automatic hold: ' + screen.reasons.join(', '), caption, 3, now());
    }
    return { post: await ctx.serializePost(await q.get('SELECT * FROM posts WHERE id=?', pid), user.id), held: status === 'held' ? screen.reasons : null };
  });

  r.get('/api/posts/:id', {}, async ({ params, user }) => {
    const p = await getPost(params.id);
    if (!await visibleTo(p, user)) fail(404, 'post_not_found');
    return ctx.serializePost(p, user.id);
  });

  r.get('/api/posts/:id/captions.vtt', {}, async ({ params, user, res }) => {
    const p = await getPost(params.id);
    if (!await visibleTo(p, user) || !p.captions_vtt) fail(404, 'not_found');
    res.writeHead(200, { 'content-type': 'text/vtt; charset=utf-8' }); res.end(p.captions_vtt);
  });

  r.patch('/api/posts/:id', {}, async ({ params, user, body }) => {
    const p = await getPost(params.id);
    if (p.author_id !== user.id) fail(403, 'not_owner');
    ctx.requireWrite(user);
    const b = await body();
    if (b.caption !== undefined) {
      const c = String(b.caption).slice(0, 2200);
      if (screenText(c).action === 'hold') fail(400, 'caption_not_allowed', 'This caption contains content that breaks the Community Guidelines.');
      await q.run('UPDATE posts SET caption=? WHERE id=?', c, p.id);
    }
    if (b.allowComments !== undefined) await q.run('UPDATE posts SET allow_comments=? WHERE id=?', b.allowComments ? 1 : 0, p.id);
    if (b.remixPolicy !== undefined) {
      if (!['everyone', 'followers', 'nobody'].includes(b.remixPolicy)) fail(400, 'invalid_remix_policy');
      await q.run('UPDATE posts SET remix_policy=? WHERE id=?', b.remixPolicy, p.id);
    }
    if (b.publish && p.status === 'draft') {
      const m = await q.get('SELECT status FROM media WHERE id=?', p.media_id);
      await q.run('UPDATE posts SET status=?, published_at=? WHERE id=?', m.status === 'ready' ? 'published' : 'processing', m.status === 'ready' ? now() : null, p.id);
    }
    return ctx.serializePost(await getPost(p.id), user.id);
  });

  r.delete('/api/posts/:id', {}, async ({ params, user }) => {
    const p = await getPost(params.id);
    if (p.author_id !== user.id) fail(403, 'not_owner');
    await q.run("UPDATE posts SET status='removed' WHERE id=?", p.id);
    return { ok: true };
  });

  // Remix/stitch permission check used by the editor before allowing a stitch.
  r.get('/api/posts/:id/remix-permission', {}, async ({ params, user }) => {
    const p = await getPost(params.id);
    if (!await visibleTo(p, user)) fail(404, 'post_not_found');
    let allowed = p.remix_policy === 'everyone' ||
      (p.remix_policy === 'followers' && !!await q.get('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?', user.id, p.author_id));
    if (p.author_id === user.id) allowed = true;
    return { allowed, policy: p.remix_policy, note: 'Stitches made to mock or ridicule a person are removed under the harassment policy.' };
  });

  // ---------------- engagement ----------------
  const toggle = (table, notifyType) => {
    r.post(`/api/posts/:id/${table === 'likes' ? 'like' : 'save'}`, {}, async ({ params, user }) => {
      const p = await getPost(params.id);
      if (!await visibleTo(p, user) || p.status !== 'published') fail(404, 'post_not_found');
      ctx.limiter.check(`${table}:${user.id}`, 120, 120);
      const res = await q.run(`INSERT INTO ${table} (user_id,post_id,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING`, user.id, p.id, now());
      if (notifyType && res.changes) await ctx.notify(p.author_id, notifyType, user.id, 'post', p.id, `@${user.handle} liked your post`);
      return ctx.serializePost(p, user.id);
    });
    r.delete(`/api/posts/:id/${table === 'likes' ? 'like' : 'save'}`, {}, async ({ params, user }) => {
      const p = await getPost(params.id);
      await q.run(`DELETE FROM ${table} WHERE user_id=? AND post_id=?`, user.id, p.id);
      return ctx.serializePost(p, user.id);
    });
  };
  toggle('likes', 'like');
  toggle('saves', null);

  r.post('/api/posts/:id/view', {}, async ({ params, user }) => {
    const p = await getPost(params.id);
    if (p.status !== 'published') return { ok: false };
    const res = await q.run('INSERT INTO views (user_id,post_id,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', user.id, p.id, now());
    if (res.changes) await q.run('UPDATE posts SET view_count=view_count+1 WHERE id=?', p.id);
    return { ok: true };
  });

  r.post('/api/posts/:id/not-interested', {}, async ({ params, user }) => {
    await getPost(params.id);
    await q.run('INSERT INTO not_interested (user_id,post_id,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', user.id, params.id, now());
    return { ok: true }; // private signal only — never shown as a public count
  });

  // ---------------- comments ----------------
  r.get('/api/posts/:id/comments', {}, async ({ params, user }) => {
    const p = await getPost(params.id);
    if (!await visibleTo(p, user)) fail(404, 'post_not_found');
    const rows = await q.all(`SELECT c.* FROM comments c WHERE c.post_id=? AND (c.status='visible' OR (c.status='held' AND c.author_id=?))
      AND c.author_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?) AND c.author_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
      AND c.author_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=?) ORDER BY c.created_at ASC LIMIT 500`, p.id, user.id, user.id, user.id, user.id);
    return {
      allowComments: !!p.allow_comments,
      comments: await mapAsync(rows, async (c) => ({ id: c.id, body: c.body, status: c.status, createdAt: c.created_at, mine: c.author_id === user.id,
        canDelete: c.author_id === user.id || p.author_id === user.id,
        author: await ctx.publicUser(await q.get('SELECT * FROM users WHERE id=?', c.author_id), user.id) })),
    };
  });

  r.post('/api/posts/:id/comments', {}, async ({ params, user, body }) => {
    ctx.requireWrite(user);
    const p = await getPost(params.id);
    if (!await visibleTo(p, user) || p.status !== 'published') fail(404, 'post_not_found');
    if (!p.allow_comments) fail(403, 'comments_off', 'The creator has turned off comments.');
    if (await ctx.isBlockedEitherWay(user.id, p.author_id)) fail(403, 'blocked');
    ctx.limiter.check('comment:' + user.id, 8, 8);           // burst + per-minute cap
    ctx.limiter.check(`comment:${user.id}:${p.id}`, 5, 1);    // anti pile-on per post
    const b = await body();
    const text = String(b.body || '').trim();
    if (!text) fail(400, 'empty_comment');
    if (text.length > 500) fail(400, 'comment_too_long');
    const author = await q.get('SELECT comment_filter FROM users WHERE id=?', p.author_id);
    const screen = screenText(text, { personalFilter: JSON.parse(author.comment_filter) });
    const status = screen.action === 'hold' ? 'held' : 'visible';
    const cid = id('c_');
    await q.run('INSERT INTO comments (id,post_id,author_id,body,status,held_reason,created_at) VALUES (?,?,?,?,?,?,?)', cid, p.id, user.id, text, status, screen.reasons.join(',') || null, now());
    if (status === 'visible') await ctx.notify(p.author_id, 'comment', user.id, 'post', p.id, `@${user.handle} commented: ${text.slice(0, 80)}`);
    else if (!screen.reasons.every((x) => x === 'creator_keyword_filter')) {
      await q.run('INSERT INTO reports (id,reporter_id,target_type,target_id,target_user_id,reason,details,evidence,priority,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        id('r_'), 'system', 'comment', cid, user.id, screen.reasons.includes('threat_or_self_harm_encouragement') ? 'threat' : 'bullying',
        'Automatic hold: ' + screen.reasons.join(', '), text, screen.reasons.includes('threat_or_self_harm_encouragement') ? 5 : 3, now());
    }
    return { id: cid, status, held: status === 'held',
      message: status === 'held' ? 'Your comment is held for review because it may break the Community Guidelines. Respectful disagreement is welcome.' : null };
  });

  r.delete('/api/comments/:id', {}, async ({ params, user }) => {
    const c = (await q.get('SELECT c.*, p.author_id post_author FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=?', params.id)) || fail(404, 'not_found');
    if (c.author_id !== user.id && c.post_author !== user.id) fail(403, 'forbidden');
    await q.run("UPDATE comments SET status='removed' WHERE id=?", c.id);
    return { ok: true };
  });

  // ---------------- feed ----------------
  // Ranking uses engagement QUALITY, freshness and an exposure boost for
  // under-seen posts so every creator gets a fair start. It never reads
  // follower counts. Posts with open safety reports are down-ranked, and
  // held/removed comments add nothing (no reward for outrage).
  ctx.rankForYou = async function rankForYou(viewerId, limit = 10, offset = 0) {
    const cands = await q.all(`SELECT p.*,
        (SELECT COUNT(*) FROM likes WHERE post_id=p.id) e_l,
        (SELECT COUNT(*) FROM comments WHERE post_id=p.id AND status='visible') e_c,
        (SELECT COUNT(*) FROM saves WHERE post_id=p.id) e_s,
        (SELECT COUNT(DISTINCT reporter_id) FROM reports WHERE target_type='post' AND target_id=p.id AND status='open') e_r,
        EXISTS (SELECT 1 FROM views WHERE post_id=p.id AND user_id=?) e_seen
      FROM posts p JOIN users u ON u.id=p.author_id
      WHERE p.status='published' AND u.status IN ('active','restricted')
      AND p.author_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id=?)
      AND p.author_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
      AND p.author_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=?)
      AND p.id NOT IN (SELECT post_id FROM not_interested WHERE user_id=?)
      ORDER BY p.published_at DESC LIMIT 1000`, viewerId, viewerId, viewerId, viewerId, viewerId);
    const t = now();
    const scored = cands.map((p) => {
      const quality = (p.e_l + 2 * p.e_c + 3 * p.e_s + 1) / (p.view_count + 8);
      const ageH = (t - p.published_at) / 3.6e6;
      const fresh = Math.exp(-ageH / 72);
      const explore = 1 / (1 + p.view_count / 40);
      let score = quality * 2 + fresh + explore * 0.6;
      score *= Math.pow(0.5, p.e_r);
      if (p.e_seen) score *= 0.25;
      if (p.author_id === viewerId && ageH < 1) score += 5; // let creators see their fresh upload immediately
      return { p, score };
    }).sort((a, b) => b.score - a.score);
    // Diversity: avoid the same creator twice in a row.
    const out = [];
    const pool = scored.slice();
    while (pool.length) {
      const i = pool.findIndex((x) => !out.length || x.p.author_id !== out[out.length - 1].author_id);
      out.push(pool.splice(i === -1 ? 0 : i, 1)[0].p);
    }
    return out.slice(offset, offset + limit);
  };

  r.get('/api/feed', {}, async ({ user, query }) => {
    const mode = query.get('mode') === 'following' ? 'following' : 'foryou';
    const offset = Math.max(0, Number(query.get('cursor') || 0));
    const limit = Math.min(20, Math.max(1, Number(query.get('limit') || 8)));
    let rows;
    if (mode === 'following') {
      rows = await q.all(`SELECT p.* FROM posts p WHERE p.status='published'
        AND p.author_id IN (SELECT followee_id FROM follows WHERE follower_id=?)
        AND p.author_id NOT IN (SELECT muted_id FROM mutes WHERE muter_id=?)
        AND p.author_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?)
        ORDER BY p.published_at DESC LIMIT ? OFFSET ?`, user.id, user.id, user.id, limit, offset);
    } else rows = await ctx.rankForYou(user.id, limit, offset);
    return { mode, items: await ctx.serializePosts(rows, user.id), nextCursor: rows.length === limit ? offset + limit : null };
  });

  // ---------------- people ----------------
  const findUser = async (key) => (await q.get("SELECT * FROM users WHERE (id=? OR lower(handle)=lower(?)) AND status NOT IN ('deleted','ineligible')", key, key)) || fail(404, 'user_not_found');
  ctx.findUser = findUser;

  r.get('/api/users/:key', {}, async ({ params, user }) => {
    const u = await findUser(params.key);
    if (await q.get('SELECT 1 FROM blocks WHERE blocker_id=? AND blocked_id=?', u.id, user.id)) fail(404, 'user_not_found');
    const posts = await q.all("SELECT * FROM posts WHERE author_id=? AND (status='published' OR (author_id=? AND status IN ('draft','processing','held'))) ORDER BY created_at DESC LIMIT 60", u.id, user.id);
    return { user: await ctx.publicUser(u, user.id), banned: u.status === 'banned', posts: await ctx.serializePosts(posts, user.id) };
  });

  r.post('/api/users/:key/follow', {}, async ({ params, user }) => {
    const u = await findUser(params.key);
    if (u.id === user.id) fail(400, 'cannot_follow_self');
    if (await ctx.isBlockedEitherWay(user.id, u.id)) fail(403, 'blocked');
    ctx.limiter.check('follow:' + user.id, 60, 30); // anti follow-spam
    const res = await q.run('INSERT INTO follows (follower_id,followee_id,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', user.id, u.id, now());
    if (res.changes) await ctx.notify(u.id, 'follow', user.id, 'user', user.id, `@${user.handle} followed you`);
    return ctx.publicUser(u, user.id);
  });
  r.delete('/api/users/:key/follow', {}, async ({ params, user }) => {
    const u = await findUser(params.key);
    await q.run('DELETE FROM follows WHERE follower_id=? AND followee_id=?', user.id, u.id);
    return ctx.publicUser(u, user.id);
  });

  const block = (blockerId, blockedId) => q.tx(async () => {
    await q.run('INSERT INTO blocks (blocker_id,blocked_id,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', blockerId, blockedId, now());
    await q.run('DELETE FROM follows WHERE (follower_id=? AND followee_id=?) OR (follower_id=? AND followee_id=?)', blockerId, blockedId, blockedId, blockerId);
  });
  r.post('/api/users/:key/block', {}, async ({ params, user }) => {
    const u = await findUser(params.key);
    if (u.id === user.id) fail(400, 'cannot_block_self');
    await block(user.id, u.id);
    return ctx.publicUser(u, user.id);
  });
  r.delete('/api/users/:key/block', {}, async ({ params, user }) => {
    const u = await findUser(params.key);
    await q.run('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?', user.id, u.id);
    return ctx.publicUser(u, user.id);
  });
  r.post('/api/users/:key/mute', {}, async ({ params, user }) => {
    const u = await findUser(params.key);
    await q.run('INSERT INTO mutes (muter_id,muted_id,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', user.id, u.id, now());
    return ctx.publicUser(u, user.id);
  });
  r.delete('/api/users/:key/mute', {}, async ({ params, user }) => {
    const u = await findUser(params.key);
    await q.run('DELETE FROM mutes WHERE muter_id=? AND muted_id=?', user.id, u.id);
    return ctx.publicUser(u, user.id);
  });
  r.get('/api/me/blocked', {}, async ({ user }) => mapAsync(await q.all('SELECT u.* FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=?', user.id), (u) => ctx.publicUser(u, user.id)));
  r.get('/api/me/muted', {}, async ({ user }) => mapAsync(await q.all('SELECT u.* FROM mutes m JOIN users u ON u.id=m.muted_id WHERE m.muter_id=?', user.id), (u) => ctx.publicUser(u, user.id)));
  r.get('/api/me/saved', {}, async ({ user }) => ctx.serializePosts(await q.all("SELECT p.* FROM saves s JOIN posts p ON p.id=s.post_id WHERE s.user_id=? AND p.status='published' ORDER BY s.created_at DESC", user.id), user.id));

  // ---------------- reports & appeals ----------------
  r.get('/api/reports/reasons', { auth: 'public' }, () => REPORT_REASONS);

  r.post('/api/reports', {}, async ({ user, body }) => {
    ctx.limiter.check('report:' + user.id, 20, 20 / 60);
    const b = await body();
    if (!REPORT_REASONS[b.reason]) fail(400, 'invalid_reason');
    let targetUser = null, evidence = null;
    switch (b.targetType) {
      case 'post': { const p = await getPost(b.targetId); targetUser = p.author_id; evidence = JSON.stringify({ caption: p.caption, media: p.media_id }); break; }
      case 'comment': { const c = (await q.get('SELECT * FROM comments WHERE id=?', b.targetId)) || fail(404, 'not_found'); targetUser = c.author_id; evidence = c.body; break; }
      case 'user': { const u = await findUser(b.targetId); targetUser = u.id; evidence = JSON.stringify({ handle: u.handle, name: u.display_name, bio: u.bio }); break; }
      case 'message': {
        const m = (await q.get('SELECT m.* FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.user_id=? WHERE m.id=?', user.id, b.targetId)) || fail(404, 'not_found');
        targetUser = m.sender_id; evidence = m.body; break;
      }
      default: fail(400, 'invalid_target');
    }
    if (targetUser === user.id) fail(400, 'cannot_report_self');
    const rid = id('r_');
    await q.run('INSERT INTO reports (id,reporter_id,target_type,target_id,target_user_id,reason,details,evidence,priority,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      rid, user.id, b.targetType, b.targetId, targetUser, b.reason, String(b.details || '').slice(0, 1000), evidence, REPORT_PRIORITY[b.reason], now());
    // Severe harms reported by several distinct people are hidden pending human review.
    if (['post', 'comment'].includes(b.targetType) && REPORT_PRIORITY[b.reason] >= 4) {
      const n = (await q.get("SELECT COUNT(DISTINCT reporter_id) n FROM reports WHERE target_type=? AND target_id=? AND status='open' AND priority>=4 AND reporter_id!='system'", b.targetType, b.targetId)).n;
      if (n >= 3) await q.run(`UPDATE ${b.targetType === 'post' ? 'posts' : 'comments'} SET status='held' WHERE id=? AND status IN ('published','visible')`, b.targetId);
    }
    if (b.alsoBlock && targetUser) await block(user.id, targetUser);
    return { reportId: rid, blocked: !!b.alsoBlock, message: 'Thanks. A trained reviewer will look at this. You won’t be identified to the person you reported.' };
  });

  r.get('/api/me/reports', {}, ({ user }) => q.all('SELECT id,target_type,reason,status,resolution,created_at FROM reports WHERE reporter_id=? ORDER BY created_at DESC', user.id));
  r.get('/api/me/sanctions', { auth: 'session' }, ({ user }) => q.all('SELECT id,level,reason,expires_at,revoked,created_at FROM sanctions WHERE user_id=? ORDER BY created_at DESC', user.id));
  r.post('/api/appeals', { auth: 'session' }, async ({ user, body }) => {
    const b = await body();
    const s = (await q.get('SELECT * FROM sanctions WHERE id=? AND user_id=?', b.sanctionId, user.id)) || fail(404, 'sanction_not_found');
    if (await q.get("SELECT 1 FROM appeals WHERE sanction_id=? AND status='open'", s.id)) fail(409, 'appeal_open');
    const text = String(b.body || '').trim().slice(0, 2000);
    if (!text) fail(400, 'appeal_text_required');
    const aid = id('a_');
    await q.run('INSERT INTO appeals (id,user_id,sanction_id,report_id,body,created_at) VALUES (?,?,?,?,?,?)', aid, user.id, s.id, s.report_id, text, now());
    return { appealId: aid };
  });

  // ---------------- notifications ----------------
  r.get('/api/notifications', {}, async ({ user }) => ({
    unread: (await q.get('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read=0', user.id)).n,
    items: (await q.all('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100', user.id)).map((n) => ({
      id: n.id, type: n.type, text: n.text, read: !!n.read, refType: n.ref_type, refId: n.ref_id, createdAt: n.created_at })),
  }));
  r.post('/api/notifications/read', {}, async ({ user }) => { await q.run('UPDATE notifications SET read=1 WHERE user_id=?', user.id); return { ok: true }; });

  // ---------------- search ----------------
  r.get('/api/search', {}, async ({ user, query }) => {
    const term = String(query.get('q') || '').trim().slice(0, 60);
    if (term.length < 2) return { users: [], posts: [], titles: [], businesses: [], campaigns: [] };
    const like = '%' + term.replace(/[%_\\]/g, '') + '%';
    return {
      users: await mapAsync(await q.all("SELECT * FROM users WHERE (handle ILIKE ? OR display_name ILIKE ?) AND status IN ('active','restricted') AND age_status='verified' AND id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?) LIMIT 10", like, like, user.id), (u) => ctx.publicUser(u, user.id)),
      posts: await ctx.serializePosts(await q.all("SELECT * FROM posts WHERE caption ILIKE ? AND status='published' AND author_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id=?) LIMIT 10", like, user.id), user.id),
      titles: await q.all('SELECT id,name,genres,kind FROM titles WHERE name ILIKE ? OR genres ILIKE ? LIMIT 10', like, like),
      businesses: await q.all("SELECT id,name,category FROM businesses WHERE verification='verified' AND (name ILIKE ? OR category ILIKE ?) LIMIT 10", like, like),
      campaigns: await q.all("SELECT id,title,category FROM campaigns WHERE status='open' AND (title ILIKE ? OR category ILIKE ?) LIMIT 10", like, like),
    };
  });

  // ---------------- creator studio ----------------
  r.get('/api/studio', {}, async ({ user }) => {
    const posts = await ctx.serializePosts(await q.all("SELECT * FROM posts WHERE author_id=? AND status!='removed' ORDER BY created_at DESC", user.id), user.id);
    const pub = posts.filter((p) => p.status === 'published');
    const sum = (k) => pub.reduce((a, p) => a + p[k], 0);
    const ledger = await q.all('SELECT * FROM earnings WHERE user_id=? ORDER BY created_at DESC', user.id);
    const total = (st) => ledger.filter((e) => st.includes(e.status)).reduce((a, e) => a + e.amount_cents, 0);
    return {
      drafts: posts.filter((p) => p.status === 'draft'),
      processing: posts.filter((p) => p.status === 'processing'),
      held: posts.filter((p) => p.status === 'held'),
      published: pub,
      totals: { posts: pub.length, views: sum('views'), likes: sum('likes'), comments: sum('comments'),
        followers: (await q.get('SELECT COUNT(*) c FROM follows WHERE followee_id=?', user.id)).c },
      earnings: {
        currency: 'CAD', pendingCents: total(['pending']), availableCents: total(['available']), paidOutCents: total(['paid_out']),
        ledger: ledger.map((e) => ({ id: e.id, source: e.source, amountCents: e.amount_cents, currency: e.currency, status: e.status, createdAt: e.created_at })),
        payoutsEnabled: !!config.paymentsProvider,
        payoutsNote: config.paymentsProvider ? null : 'Payouts start once a payout provider (e.g. Stripe Connect) is connected. Earnings only come from real, compliant revenue — never from follower count.',
      },
      eligibility: 'Every 19+ verified creator in good standing is eligible. There is no follower minimum and there are no creator tiers.',
    };
  });
}
