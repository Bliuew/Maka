import { fail } from '../http.js';
import { id, now } from '../db.js';

// Every admin action writes to audit_log.
export function registerAdmin(r, ctx) {
  const { q } = ctx;
  const A = { auth: 'admin' };

  function targetSnapshot(rep) {
    switch (rep.target_type) {
      case 'post': return q.get('SELECT id, caption, status FROM posts WHERE id=?', rep.target_id);
      case 'comment': return q.get('SELECT id, body, status FROM comments WHERE id=?', rep.target_id);
      case 'message': return q.get('SELECT id, body, status FROM messages WHERE id=?', rep.target_id);
      case 'user': return q.get('SELECT id, handle, display_name, status FROM users WHERE id=?', rep.target_id);
    }
  }

  r.get('/api/admin/reports', A, ({ query }) => {
    const status = query.get('status') || 'open';
    return q.all('SELECT * FROM reports WHERE status=? ORDER BY priority DESC, created_at ASC LIMIT 200', status).map((rep) => {
      const tu = rep.target_user_id ? q.get('SELECT * FROM users WHERE id=?', rep.target_user_id) : null;
      const history = tu ? q.all('SELECT level, reason, created_at, revoked FROM sanctions WHERE user_id=? ORDER BY created_at', tu.id) : [];
      return { id: rep.id, targetType: rep.target_type, targetId: rep.target_id, reason: rep.reason, details: rep.details, evidence: rep.evidence,
        priority: rep.priority, status: rep.status, createdAt: rep.created_at, systemGenerated: rep.reporter_id === 'system',
        current: targetSnapshot(rep), targetUser: tu ? { id: tu.id, handle: tu.handle, status: tu.status } : null,
        sanctionHistory: history, recommendedLevel: recommend(history) };
    });
  });

  // Graduated sanctions: warning -> restrict(7d) -> suspend(30d) -> ban.
  const LADDER = ['warning', 'restrict', 'suspend', 'ban'];
  function recommend(history) {
    const active = history.filter((h) => !h.revoked).length;
    return LADDER[Math.min(active, LADDER.length - 1)];
  }

  function removeTarget(rep) {
    const table = { post: 'posts', comment: 'comments', message: 'messages' }[rep.target_type];
    if (table) q.run(`UPDATE ${table} SET status='removed' WHERE id=?`, rep.target_id);
  }

  function sanction(admin, userId, level, reason, reportId, days) {
    const sid = id('s_');
    const expires = level === 'restrict' ? now() + (days || 7) * 864e5 : level === 'suspend' ? now() + (days || 30) * 864e5 : null;
    q.run('INSERT INTO sanctions (id,user_id,level,reason,report_id,expires_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)', sid, userId, level, reason, reportId, expires, admin.id, now());
    if (level === 'restrict') q.run("UPDATE users SET status='restricted' WHERE id=? AND status='active'", userId);
    if (level === 'suspend') { q.run("UPDATE users SET status='suspended', suspended_until=? WHERE id=?", expires, userId); q.run('DELETE FROM sessions WHERE user_id=?', userId); }
    if (level === 'ban') {
      q.run("UPDATE users SET status='banned' WHERE id=?", userId);
      q.run('DELETE FROM sessions WHERE user_id=?', userId);
      // Ban evasion: block the verified identity (not the IP) from re-registering.
      for (const c of q.all("SELECT person_ref_hash FROM age_checks WHERE user_id=? AND person_ref_hash IS NOT NULL", userId))
        q.run('INSERT OR IGNORE INTO banned_identities (person_ref_hash,user_id,created_at) VALUES (?,?,?)', c.person_ref_hash, userId, now());
    }
    ctx.notify(userId, 'sanction', null, 'sanction', sid, `Your account received a ${level}: ${reason}. You can appeal this decision.`);
    return sid;
  }

  r.post('/api/admin/reports/:id/resolve', A, async ({ user, params, body }) => {
    const rep = q.get('SELECT * FROM reports WHERE id=?', params.id) || fail(404, 'not_found');
    if (rep.status !== 'open' && rep.status !== 'escalated') fail(409, 'already_resolved');
    const b = await body();
    const action = b.action;
    if (!['dismiss', 'approve_content', 'remove_content', 'warning', 'restrict', 'suspend', 'ban', 'escalate'].includes(action)) fail(400, 'invalid_action');
    const note = String(b.note || '').slice(0, 1000);
    if (action !== 'dismiss' && action !== 'approve_content' && !note) fail(400, 'note_required', 'Add a reason; it is shown to the user and kept for appeals.');
    let sid = null;
    q.tx(() => {
      if (action === 'escalate') { q.run("UPDATE reports SET status='escalated', priority=priority+1 WHERE id=?", rep.id); return; }
      if (action === 'approve_content') {
        const table = { post: 'posts', comment: 'comments', message: 'messages' }[rep.target_type];
        const restored = { posts: 'published', comments: 'visible', messages: 'sent' }[table];
        if (table) q.run(`UPDATE ${table} SET status=? WHERE id=? AND status='held'`, restored, rep.target_id);
        if (table === 'posts') q.run('UPDATE posts SET published_at=COALESCE(published_at, ?) WHERE id=?', now(), rep.target_id);
      }
      if (['remove_content', 'warning', 'restrict', 'suspend', 'ban'].includes(action)) removeTarget(rep);
      if (['warning', 'restrict', 'suspend', 'ban'].includes(action) && rep.target_user_id) sid = sanction(user, rep.target_user_id, action, note, rep.id, b.days);
      q.run("UPDATE reports SET status=?, resolved_by=?, resolution=?, resolved_at=? WHERE id=?",
        action === 'dismiss' || action === 'approve_content' ? 'dismissed' : 'actioned', user.id, action + (note ? ': ' + note : ''), now(), rep.id);
      // Close duplicate reports on the same target with the same outcome.
      q.run("UPDATE reports SET status=?, resolved_by=?, resolution=?, resolved_at=? WHERE target_type=? AND target_id=? AND status='open' AND id!=?",
        action === 'dismiss' || action === 'approve_content' ? 'dismissed' : 'actioned', user.id, 'merged: ' + action, now(), rep.target_type, rep.target_id, rep.id);
      ctx.audit(user.id, 'report_' + action, rep.target_type, rep.target_id, { reportId: rep.id, note, sanctionId: sid });
    });
    return { ok: true, sanctionId: sid };
  });

  r.get('/api/admin/appeals', A, () => q.all("SELECT * FROM appeals WHERE status='open' ORDER BY created_at").map((a) => ({
    ...a, sanction: q.get('SELECT * FROM sanctions WHERE id=?', a.sanction_id), user: q.get('SELECT id, handle, status FROM users WHERE id=?', a.user_id),
    report: a.report_id ? q.get('SELECT reason, evidence, resolution FROM reports WHERE id=?', a.report_id) : null })));

  r.post('/api/admin/appeals/:id/decide', A, async ({ user, params, body }) => {
    const a = q.get("SELECT * FROM appeals WHERE id=? AND status='open'", params.id) || fail(404, 'not_found');
    const { decision, note } = await body();
    if (!['upheld', 'overturned'].includes(decision)) fail(400, 'invalid_decision');
    const s = q.get('SELECT * FROM sanctions WHERE id=?', a.sanction_id);
    if (s && s.created_by === user.id) fail(403, 'reviewer_conflict', 'A different reviewer must decide appeals on your own decisions.');
    q.tx(() => {
      q.run('UPDATE appeals SET status=?, decided_by=?, decision_note=? WHERE id=?', decision, user.id, String(note || ''), a.id);
      if (decision === 'overturned' && s) {
        q.run('UPDATE sanctions SET revoked=1 WHERE id=?', s.id);
        q.run("UPDATE users SET status='active', suspended_until=NULL WHERE id=?", s.user_id);
        q.run('DELETE FROM banned_identities WHERE user_id=?', s.user_id);
        const rep = s.report_id ? q.get('SELECT * FROM reports WHERE id=?', s.report_id) : null;
        if (rep?.target_type === 'post') q.run("UPDATE posts SET status='published' WHERE id=? AND status='removed'", rep.target_id);
        if (rep?.target_type === 'comment') q.run("UPDATE comments SET status='visible' WHERE id=? AND status='removed'", rep.target_id);
      }
      ctx.audit(user.id, 'appeal_' + decision, 'appeal', a.id, { sanctionId: s?.id });
    });
    ctx.notify(a.user_id, 'appeal', null, 'appeal', a.id, `Your appeal was reviewed: ${decision === 'overturned' ? 'the decision was reversed' : 'the decision stands'}.`);
    return { ok: true };
  });

  r.get('/api/admin/businesses', A, ({ query }) => q.all('SELECT * FROM businesses WHERE verification=? ORDER BY created_at', query.get('status') || 'pending'));
  r.post('/api/admin/businesses/:id/verify', A, async ({ user, params, body }) => {
    const { decision, note } = await body();
    if (!['verified', 'rejected'].includes(decision)) fail(400, 'invalid_decision');
    const b = q.get('SELECT * FROM businesses WHERE id=?', params.id) || fail(404, 'not_found');
    q.run('UPDATE businesses SET verification=? WHERE id=?', decision, b.id);
    ctx.audit(user.id, 'business_' + decision, 'business', b.id, { note });
    ctx.notify(b.owner_id, 'business_verification', null, 'business', b.id, `${b.name} was ${decision}.`);
    return { ok: true };
  });

  r.post('/api/admin/users/:id/role', A, async ({ user, params, body }) => {
    const { role } = await body();
    if (!['user', 'admin'].includes(role)) fail(400, 'invalid_role');
    q.run('UPDATE users SET role=? WHERE id=?', role, params.id);
    ctx.audit(user.id, 'role_' + role, 'user', params.id, {});
    return { ok: true };
  });

  r.get('/api/admin/audit', A, () => q.all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 300'));
  r.get('/api/admin/overview', A, () => ({
    openReports: q.get("SELECT COUNT(*) n FROM reports WHERE status IN ('open','escalated')").n,
    openAppeals: q.get("SELECT COUNT(*) n FROM appeals WHERE status='open'").n,
    pendingBusinesses: q.get("SELECT COUNT(*) n FROM businesses WHERE verification='pending'").n,
    ageReview: q.get("SELECT COUNT(*) n FROM users WHERE age_status='review'").n,
    payoutsPending: q.get("SELECT COUNT(*) n FROM contracts WHERE status='payout_pending'").n,
  }));
}
