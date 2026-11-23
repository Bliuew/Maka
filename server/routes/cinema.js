import { fail } from '../http.js';
import { id, now } from '../db.js';

// Free, ad-supported cinema. A title is playable ONLY when:
//  - it is not a placeholder,
//  - a licensed stream exists (CDN manifest), and
//  - a rights window covers the viewer's territory right now.
export function registerCinema(r, ctx) {
  const { q, config } = ctx;

  const territoryOf = (req) => config.defaultTerritory; // production: trusted geo-IP at the edge, never client-supplied
  function availability(t, territory) {
    if (t.is_placeholder) return { playable: false, reason: 'placeholder', message: 'Fictional placeholder title. No film has been licensed yet, so nothing can play.' };
    const w = q.get(`SELECT * FROM title_rights WHERE title_id=? AND starts_at<=? AND ends_at>? AND (','||territories||',') LIKE ?`,
      t.id, now(), now(), `%,${territory},%`);
    if (!w) return { playable: false, reason: 'not_licensed_here', message: 'Not available in your region right now.' };
    if (!t.stream_url) return { playable: false, reason: 'no_stream', message: 'Licensed, but the stream has not been delivered to our CDN yet.' };
    return { playable: true, adSupported: !!w.ad_supported, until: w.ends_at };
  }
  const ser = (t, user, territory) => ({
    id: t.id, name: t.name, kind: t.kind, genres: t.genres.split(','), language: t.language, synopsis: t.synopsis,
    maturity: t.maturity, posterUrl: ctx.assetUrl(t.poster), isPlaceholder: !!t.is_placeholder,
    availability: availability(t, territory),
    inWatchlist: !!q.get('SELECT 1 FROM watchlist WHERE user_id=? AND title_id=?', user.id, t.id),
    progress: q.get('SELECT position_s FROM watch_progress WHERE user_id=? AND title_id=?', user.id, t.id)?.position_s || null,
  });

  r.get('/api/cinema', {}, ({ req, user, query }) => {
    const territory = territoryOf(req);
    let rows = q.all('SELECT * FROM titles ORDER BY created_at DESC');
    const kind = query.get('kind'), genre = query.get('genre'), lang = query.get('language'), term = (query.get('q') || '').toLowerCase();
    if (kind) rows = rows.filter((t) => t.kind === kind);
    if (genre) rows = rows.filter((t) => t.genres.split(',').includes(genre));
    if (lang) rows = rows.filter((t) => t.language === lang);
    if (term) rows = rows.filter((t) => (t.name + ' ' + t.genres + ' ' + t.synopsis).toLowerCase().includes(term));
    if (query.get('list') === 'watchlist') rows = rows.filter((t) => q.get('SELECT 1 FROM watchlist WHERE user_id=? AND title_id=?', user.id, t.id));
    const items = rows.map((t) => ser(t, user, territory));
    const all = q.all('SELECT genres, language FROM titles');
    return {
      territory, items,
      continueWatching: items.filter((t) => t.progress && t.availability.playable),
      genres: [...new Set(all.flatMap((t) => t.genres.split(',')))].sort(),
      languages: [...new Set(all.map((t) => t.language))].sort(),
      licensedCount: items.filter((t) => t.availability.playable).length,
    };
  });

  r.get('/api/cinema/:id', {}, ({ req, user, params }) => {
    const t = q.get('SELECT * FROM titles WHERE id=?', params.id) || fail(404, 'title_not_found');
    return ser(t, user, territoryOf(req));
  });

  r.post('/api/cinema/:id/play', {}, ({ req, user, params }) => {
    const t = q.get('SELECT * FROM titles WHERE id=?', params.id) || fail(404, 'title_not_found');
    const a = availability(t, territoryOf(req));
    if (!a.playable) fail(409, a.reason, a.message);
    // With a real CDN this returns a short-lived tokenized manifest URL plus ad-break schedule.
    return { streamUrl: t.stream_url, captionsUrl: t.captions_url, adSupported: a.adSupported };
  });

  r.post('/api/cinema/:id/watchlist', {}, ({ user, params }) => {
    q.get('SELECT 1 FROM titles WHERE id=?', params.id) || fail(404, 'title_not_found');
    q.run('INSERT OR IGNORE INTO watchlist (user_id,title_id,created_at) VALUES (?,?,?)', user.id, params.id, now());
    return { inWatchlist: true };
  });
  r.delete('/api/cinema/:id/watchlist', {}, ({ user, params }) => {
    q.run('DELETE FROM watchlist WHERE user_id=? AND title_id=?', user.id, params.id);
    return { inWatchlist: false };
  });
  r.post('/api/cinema/:id/progress', {}, async ({ req, user, params, body }) => {
    const t = q.get('SELECT * FROM titles WHERE id=?', params.id) || fail(404, 'title_not_found');
    if (!availability(t, territoryOf(req)).playable) fail(409, 'not_playable');
    const pos = Number((await body()).positionS);
    if (!(pos >= 0)) fail(400, 'invalid_position');
    q.run('INSERT INTO watch_progress (user_id,title_id,position_s,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id,title_id) DO UPDATE SET position_s=excluded.position_s, updated_at=excluded.updated_at', user.id, t.id, pos, now());
    return { ok: true };
  });

  // ---- licensor / rights portal (admin) ----
  r.post('/api/admin/titles', { auth: 'admin' }, async ({ user, body }) => {
    const b = await body();
    if (!b.name || !['movie', 'series', 'documentary'].includes(b.kind)) fail(400, 'invalid_title');
    const tid = id('t_');
    q.run('INSERT INTO titles (id,name,kind,genres,language,synopsis,maturity,poster,is_placeholder,stream_url,captions_url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      tid, String(b.name), b.kind, (b.genres || []).join(','), String(b.language || 'en'), String(b.synopsis || ''), String(b.maturity || '19+'),
      b.poster || null, b.isPlaceholder ? 1 : 0, b.streamUrl || null, b.captionsUrl || null, now());
    ctx.audit(user.id, 'title_create', 'title', tid, { name: b.name });
    return { id: tid };
  });
  r.post('/api/admin/titles/:id/rights', { auth: 'admin' }, async ({ user, params, body }) => {
    q.get('SELECT 1 FROM titles WHERE id=?', params.id) || fail(404, 'title_not_found');
    const b = await body();
    if (!b.licensor || !b.contractRef || !Array.isArray(b.territories) || !b.territories.length) fail(400, 'invalid_rights', 'Licensor, contract reference and territories are required.');
    const starts = Date.parse(b.startsAt), ends = Date.parse(b.endsAt);
    if (!(starts < ends)) fail(400, 'invalid_window');
    const rid = id('tr_');
    q.run('INSERT INTO title_rights (id,title_id,licensor,territories,starts_at,ends_at,ad_supported,rights_holder_share_pct,contract_ref,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      rid, params.id, String(b.licensor), b.territories.map((s) => String(s).toUpperCase()).join(','), starts, ends, b.adSupported === false ? 0 : 1,
      Number(b.rightsHolderSharePct ?? 50), String(b.contractRef), now());
    ctx.audit(user.id, 'title_rights_add', 'title', params.id, { rid, territories: b.territories, contractRef: b.contractRef });
    return { id: rid };
  });
}
