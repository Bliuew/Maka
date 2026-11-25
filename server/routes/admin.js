import { fail } from '../http.js';
import { id, now } from '../db.js';

// Every admin action writes to audit_log.
export function registerAdmin(r, ctx) {
  const { q, mapAsync } = ctx;
  const A = { auth: 'admin' };

  function targetSnapshot(rep) {
    switch (rep.target_type) {
      case 'post': return q.get('SELECT id, caption, status FROM posts WHERE id=?', rep.target_id);
      case 'comment': return q.get('SELECT id, body, status FROM comments WHERE id=?', rep.target_id);
      case 'message': return q.get('SELECT id, body, status FROM messages WHERE id=?', rep.target_id);
      case 'user': return q.get('SELECT id, handle, display_name, status FROM users WHERE id=?', rep.target_id);
      case 'live': return q.get('SELECT id, title, status FROM live_streams WHERE id=?', rep.target_id);
    }
    return null;
  }

  r.get('/api/admin/reports', A, async ({ query }) => {
    const status = query.get('status') || 'open';
    return mapAsync(await q.all('SELECT * FROM reports WHERE status=? ORDER BY priority DESC, created_at ASC LIMIT 200', status), async (rep) => {
      const tu = rep.target_user_id ? await q.get('SELECT * FROM users WHERE id=?', rep.target_user_id) : null;
      const history = tu ? await q.all('SELECT level, reason, created_at, revoked FROM sanctions WHERE user_id=? ORDER BY created_at', tu.id) : [];
      return { id: rep.id, targetType: rep.target_type, targetId: rep.target_id, reason: rep.reason, details: rep.details, evidence: rep.evidence,
        priority: rep.priority, status: rep.status, createdAt: rep.created_at, systemGenerated: rep.reporter_id === 'system',
        current: (await targetSnapshot(rep)) || null, targetUser: tu ? { id: tu.id, handle: tu.handle, status: tu.status } : null,
        sanctionHistory: history, recommendedLevel: recommend(history) };
    });
  });

  // Graduated sanctions: warning -> restrict(7d) -> suspend(30d) -> ban.
  const LADDER = ['warning', 'restrict', 'suspend', 'ban'];
  function recommend(history) {
    const active = history.filter((h) => !h.revoked).length;
    return LADDER[Math.min(active, LADDER.length - 1)];
  }

  async function removeTarget(rep) {
    const table = { post: 'posts', comment: 'comments', message: 'messages' }[rep.target_type];
    if (table) await q.run(`UPDATE ${table} SET status='removed' WHERE id=?`, rep.target_id);
    if (rep.target_type === 'live') await ctx.removeLive(rep.target_id);
  }

  async function sanction(admin, userId, level, reason, reportId, days) {
    const sid = id('s_');
    const expires = level === 'restrict' ? now() + (days || 7) * 864e5 : level === 'suspend' ? now() + (days || 30) * 864e5 : null;
    await q.run('INSERT INTO sanctions (id,user_id,level,reason,report_id,expires_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)', sid, userId, level, reason, reportId, expires, admin.id, now());
    if (level === 'restrict') await q.run("UPDATE users SET status='restricted' WHERE id=? AND status='active'", userId);
    if (level === 'suspend') { await q.run("UPDATE users SET status='suspended', suspended_until=? WHERE id=?", expires, userId); await q.run('DELETE FROM sessions WHERE user_id=?', userId); }
    if (level === 'ban') {
      await q.run("UPDATE users SET status='banned' WHERE id=?", userId);
      await q.run('DELETE FROM sessions WHERE user_id=?', userId);
      // Ban evasion: block the verified identity (not the IP) from re-registering.
      for (const c of await q.all('SELECT person_ref_hash FROM age_checks WHERE user_id=? AND person_ref_hash IS NOT NULL', userId))
        await q.run('INSERT INTO banned_identities (person_ref_hash,user_id,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', c.person_ref_hash, userId, now());
    }
    await ctx.notify(userId, 'sanction', null, 'sanction', sid, `Your account received a ${level}: ${reason}. You can appeal this decision.`);
    return sid;
  }

  r.post('/api/admin/reports/:id/resolve', A, async ({ user, params, body }) => {
    const rep = (await q.get('SELECT * FROM reports WHERE id=?', params.id)) || fail(404, 'not_found');
    if (rep.status !== 'open' && rep.status !== 'escalated') fail(409, 'already_resolved');
    const b = await body();
    const action = b.action;
    if (!['dismiss', 'approve_content', 'remove_content', 'warning', 'restrict', 'suspend', 'ban', 'escalate'].includes(action)) fail(400, 'invalid_action');
    const note = String(b.note || '').slice(0, 1000);
    if (action !== 'dismiss' && action !== 'approve_content' && !note) fail(400, 'note_required', 'Add a reason; it is shown to the user and kept for appeals.');
    let sid = null;
    await q.tx(async () => {
      if (action === 'escalate') {
        await q.run("UPDATE reports SET status='escalated', priority=priority+1 WHERE id=?", rep.id);
        await ctx.audit(user.id, 'report_escalate', rep.target_type, rep.target_id, { reportId: rep.id, note });
        return;
      }
      if (action === 'approve_content') {
        const table = { post: 'posts', comment: 'comments', message: 'messages' }[rep.target_type];
        const restored = { posts: 'published', comments: 'visible', messages: 'sent' }[table];
        if (table) await q.run(`UPDATE ${table} SET status=? WHERE id=? AND status='held'`, restored, rep.target_id);
        if (table === 'posts') await q.run('UPDATE posts SET published_at=COALESCE(published_at, ?) WHERE id=?', now(), rep.target_id);
      }
      if (['remove_content', 'warning', 'restrict', 'suspend', 'ban'].includes(action)) await removeTarget(rep);
      if (['warning', 'restrict', 'suspend', 'ban'].includes(action) && rep.target_user_id) sid = await sanction(user, rep.target_user_id, action, note, rep.id, b.days);
      const outcome = action === 'dismiss' || action === 'approve_content' ? 'dismissed' : 'actioned';
      await q.run('UPDATE reports SET status=?, resolved_by=?, resolution=?, resolved_at=? WHERE id=?',
        outcome, user.id, action + (note ? ': ' + note : ''), now(), rep.id);
      // Close duplicate reports on the same target with the same outcome.
      await q.run("UPDATE reports SET status=?, resolved_by=?, resolution=?, resolved_at=? WHERE target_type=? AND target_id=? AND status='open' AND id!=?",
        outcome, user.id, 'merged: ' + action, now(), rep.target_type, rep.target_id, rep.id);
      await ctx.audit(user.id, 'report_' + action, rep.target_type, rep.target_id, { reportId: rep.id, note, sanctionId: sid });
    });
    return { ok: true, sanctionId: sid };
  });

  r.get('/api/admin/appeals', A, async () => mapAsync(await q.all("SELECT * FROM appeals WHERE status='open' ORDER BY created_at"), async (a) => ({
    ...a, sanction: (await q.get('SELECT * FROM sanctions WHERE id=?', a.sanction_id)) || null, user: (await q.get('SELECT id, handle, status FROM users WHERE id=?', a.user_id)) || null,
    report: a.report_id ? (await q.get('SELECT reason, evidence, resolution FROM reports WHERE id=?', a.report_id)) || null : null })));

  r.post('/api/admin/appeals/:id/decide', A, async ({ user, params, body }) => {
    const a = (await q.get("SELECT * FROM appeals WHERE id=? AND status='open'", params.id)) || fail(404, 'not_found');
    const { decision, note } = await body();
    if (!['upheld', 'overturned'].includes(decision)) fail(400, 'invalid_decision');
    const s = await q.get('SELECT * FROM sanctions WHERE id=?', a.sanction_id);
    if (s && s.created_by === user.id) fail(403, 'reviewer_conflict', 'A different reviewer must decide appeals on your own decisions.');
    await q.tx(async () => {
      await q.run('UPDATE appeals SET status=?, decided_by=?, decision_note=? WHERE id=?', decision, user.id, String(note || ''), a.id);
      if (decision === 'overturned' && s) {
        await q.run('UPDATE sanctions SET revoked=1 WHERE id=?', s.id);
        await q.run("UPDATE users SET status='active', suspended_until=NULL WHERE id=?", s.user_id);
        await q.run('DELETE FROM banned_identities WHERE user_id=?', s.user_id);
        const rep = s.report_id ? await q.get('SELECT * FROM reports WHERE id=?', s.report_id) : null;
        if (rep?.target_type === 'post') await q.run("UPDATE posts SET status='published' WHERE id=? AND status='removed'", rep.target_id);
        if (rep?.target_type === 'comment') await q.run("UPDATE comments SET status='visible' WHERE id=? AND status='removed'", rep.target_id);
      }
      await ctx.audit(user.id, 'appeal_' + decision, 'appeal', a.id, { sanctionId: s?.id });
    });
    await ctx.notify(a.user_id, 'appeal', null, 'appeal', a.id, `Your appeal was reviewed: ${decision === 'overturned' ? 'the decision was reversed' : 'the decision stands'}.`);
    return { ok: true };
  });

  r.get('/api/admin/businesses', A, ({ query }) => q.all('SELECT * FROM businesses WHERE verification=? ORDER BY created_at', query.get('status') || 'pending'));
  r.post('/api/admin/businesses/:id/verify', A, async ({ user, params, body }) => {
    const { decision, note } = await body();
    if (!['verified', 'rejected'].includes(decision)) fail(400, 'invalid_decision');
    const b = (await q.get('SELECT * FROM businesses WHERE id=?', params.id)) || fail(404, 'not_found');
    await q.run('UPDATE businesses SET verification=? WHERE id=?', decision, b.id);
    await ctx.audit(user.id, 'business_' + decision, 'business', b.id, { note });
    await ctx.notify(b.owner_id, 'business_verification', null, 'business', b.id, `${b.name} was ${decision}.`);
    return { ok: true };
  });

  r.post('/api/admin/users/:id/role', A, async ({ user, params, body }) => {
    const { role } = await body();
    if (!['user', 'admin'].includes(role)) fail(400, 'invalid_role');
    await q.run('UPDATE users SET role=? WHERE id=?', role, params.id);
    await ctx.audit(user.id, 'role_' + role, 'user', params.id, {});
    return { ok: true };
  });

  // Age checks that need a human decision. Reviewers look at the session in the provider's
  // dashboard (Mäka never holds the ID), then record the outcome here.
  r.get('/api/admin/age-reviews', A, async () => mapAsync(await q.all("SELECT * FROM users WHERE age_status='review' ORDER BY created_at LIMIT 200"), async (u) => {
    const c = await q.get("SELECT id, provider, provider_ref, method, completed_at FROM age_checks WHERE user_id=? AND status='review' ORDER BY completed_at DESC LIMIT 1", u.id);
    const rep = await q.get("SELECT details FROM reports WHERE target_type='user' AND target_id=? AND reporter_id='system' ORDER BY created_at DESC LIMIT 1", u.id);
    return { userId: u.id, handle: u.handle, checkId: c?.id || null, provider: c?.provider || null, providerRef: c?.provider_ref || null, method: c?.method || null, reason: rep?.details || null, since: c?.completed_at || null };
  }));
  r.post('/api/admin/age-reviews/:userId/decide', A, async ({ user, params, body }) => {
    const { decision, note } = await body();
    if (!['verified', 'under_age', 'failed'].includes(decision)) fail(400, 'invalid_decision');
    if (!String(note || '').trim()) fail(400, 'note_required', 'Add a reason; it is kept for audits and appeals.');
    const u = (await q.get("SELECT * FROM users WHERE id=? AND age_status='review'", params.userId)) || fail(404, 'not_found');
    const c = (await q.get("SELECT * FROM age_checks WHERE user_id=? AND status='review' ORDER BY completed_at DESC LIMIT 1", u.id)) || fail(404, 'check_not_found');
    await q.tx(async () => {
      await q.run("UPDATE age_checks SET status='started' WHERE id=?", c.id);
      // personRef is not re-applied: the stored hash stays as recorded by the provider decision.
      await ctx.completeAgeCheck(c, decision, null);
      if (c.person_ref_hash) await q.run('UPDATE age_checks SET person_ref_hash=? WHERE id=?', c.person_ref_hash, c.id);
      await q.run("UPDATE reports SET status='actioned', resolved_by=?, resolution=?, resolved_at=? WHERE target_type='user' AND target_id=? AND reporter_id='system' AND status IN ('open','escalated')",
        user.id, 'age_' + decision + ': ' + note, now(), u.id);
      await ctx.audit(user.id, 'age_review_' + decision, 'user', u.id, { checkId: c.id, note: String(note).slice(0, 1000) });
    });
    if (decision !== 'under_age') await ctx.notify(u.id, 'age_check', null, 'user', u.id, decision === 'verified' ? 'You’re verified. Welcome to Mäka.' : 'Your age check didn’t go through. You can try again.');
    return { ok: true };
  });

  r.get('/api/admin/audit', A, () => q.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300'));
  r.get('/api/admin/overview', A, async () => {
    const n = async (sql) => (await q.get(sql)).n;
    return {
      openReports: await n("SELECT COUNT(*) n FROM reports WHERE status IN ('open','escalated')"),
      openAppeals: await n("SELECT COUNT(*) n FROM appeals WHERE status='open'"),
      pendingBusinesses: await n("SELECT COUNT(*) n FROM businesses WHERE verification='pending'"),
      ageReview: await n("SELECT COUNT(*) n FROM users WHERE age_status='review'"),
      payoutsPending: await n("SELECT COUNT(*) n FROM contracts WHERE status='payout_pending'"),
    };
  });
}
