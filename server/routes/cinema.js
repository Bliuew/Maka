import { fail } from '../http.js';
import { id, now } from '../db.js';

// Free, ad-supported cinema. A title is playable ONLY when:
//  - it is not a placeholder,
//  - a licensed stream exists (CDN manifest), and
//  - a rights window covers the viewer's territory right now.
export function registerCinema(r, ctx) {
  const { q, config, mapAsync } = ctx;

  const territoryOf = (req) => config.defaultTerritory; // production: trusted geo-IP at the edge, never client-supplied
  async function availability(t, territory) {
    if (t.is_placeholder) return { playable: false, reason: 'placeholder', message: 'Fictional placeholder title. No film has been licensed yet, so nothing can play.' };
    const w = await q.get(`SELECT * FROM title_rights WHERE title_id=? AND starts_at<=? AND ends_at>? AND (','||territories||',') LIKE ?`,
      t.id, now(), now(), `%,${territory},%`);
    if (!w) return { playable: false, reason: 'not_licensed_here', message: 'Not available in your region right now.' };
    if (!t.stream_url) return { playable: false, reason: 'no_stream', message: 'Licensed, but the stream has not been delivered to our CDN yet.' };
    return { playable: true, adSupported: !!w.ad_supported, until: w.ends_at };
  }
  const ser = async (t, user, territory) => ({
    id: t.id, name: t.name, kind: t.kind, genres: t.genres.split(','), language: t.language, synopsis: t.synopsis,
    maturity: t.maturity, posterUrl: await ctx.assetUrl(t.poster), isPlaceholder: !!t.is_placeholder,
    availability: await availability(t, territory),
    inWatchlist: !!await q.get('SELECT 1 FROM watchlist WHERE user_id=? AND title_id=?', user.id, t.id),
    progress: (await q.get('SELECT position_s FROM watch_progress WHERE user_id=? AND title_id=?', user.id, t.id))?.position_s || null,
  });

  r.get('/api/cinema', {}, async ({ req, user, query }) => {
    const territory = territoryOf(req);
    let rows = await q.all('SELECT * FROM titles ORDER BY created_at DESC');
    const kind = query.get('kind'), genre = query.get('genre'), lang = query.get('language'), term = (query.get('q') || '').toLowerCase();
    if (kind) rows = rows.filter((t) => t.kind === kind);
    if (genre) rows = rows.filter((t) => t.genres.split(',').includes(genre));
    if (lang) rows = rows.filter((t) => t.language === lang);
    if (term) rows = rows.filter((t) => (t.name + ' ' + t.genres + ' ' + t.synopsis).toLowerCase().includes(term));
    if (query.get('list') === 'watchlist') {
      const mine = new Set((await q.all('SELECT title_id FROM watchlist WHERE user_id=?', user.id)).map((w) => w.title_id));
      rows = rows.filter((t) => mine.has(t.id));
    }
    const items = await mapAsync(rows, (t) => ser(t, user, territory));
    const all = await q.all('SELECT genres, language FROM titles');
    return {
      territory, items,
      continueWatching: items.filter((t) => t.progress && t.availability.playable),
      genres: [...new Set(all.flatMap((t) => t.genres.split(',')))].sort(),
      languages: [...new Set(all.map((t) => t.language))].sort(),
      licensedCount: items.filter((t) => t.availability.playable).length,
    };
  });

  r.get('/api/cinema/:id', {}, async ({ req, user, params }) => {
    const t = (await q.get('SELECT * FROM titles WHERE id=?', params.id)) || fail(404, 'title_not_found');
    return ser(t, user, territoryOf(req));
  });

  r.post('/api/cinema/:id/play', {}, async ({ req, params }) => {
    const t = (await q.get('SELECT * FROM titles WHERE id=?', params.id)) || fail(404, 'title_not_found');
    const a = await availability(t, territoryOf(req));
    if (!a.playable) fail(409, a.reason, a.message);
    // With a real CDN this returns a short-lived tokenized manifest URL plus ad-break schedule.
    return { streamUrl: t.stream_url, captionsUrl: t.captions_url, adSupported: a.adSupported };
  });

  r.post('/api/cinema/:id/watchlist', {}, async ({ user, params }) => {
    (await q.get('SELECT 1 FROM titles WHERE id=?', params.id)) || fail(404, 'title_not_found');
    await q.run('INSERT INTO watchlist (user_id,title_id,created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING', user.id, params.id, now());
    return { inWatchlist: true };
  });
  r.delete('/api/cinema/:id/watchlist', {}, async ({ user, params }) => {
    await q.run('DELETE FROM watchlist WHERE user_id=? AND title_id=?', user.id, params.id);
    return { inWatchlist: false };
  });
  r.post('/api/cinema/:id/progress', {}, async ({ req, user, params, body }) => {
    const t = (await q.get('SELECT * FROM titles WHERE id=?', params.id)) || fail(404, 'title_not_found');
    if (!(await availability(t, territoryOf(req))).playable) fail(409, 'not_playable');
    const pos = Number((await body()).positionS);
    if (!(pos >= 0)) fail(400, 'invalid_position');
    await q.run('INSERT INTO watch_progress (user_id,title_id,position_s,updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id,title_id) DO UPDATE SET position_s=excluded.position_s, updated_at=excluded.updated_at', user.id, t.id, pos, now());
    return { ok: true };
  });

  // ---- licensor / rights portal (admin) ----
  r.get('/api/admin/titles', { auth: 'admin' }, async () => mapAsync(await q.all('SELECT * FROM titles ORDER BY created_at DESC'), async (t) => ({
    id: t.id, name: t.name, kind: t.kind, isPlaceholder: !!t.is_placeholder, hasStream: !!t.stream_url,
    rights: await q.all('SELECT id, licensor, territories, starts_at, ends_at, contract_ref FROM title_rights WHERE title_id=? ORDER BY starts_at', t.id),
  })));
  r.post('/api/admin/titles', { auth: 'admin' }, async ({ user, body }) => {
    const b = await body();
    if (!b.name || !['movie', 'series', 'documentary'].includes(b.kind)) fail(400, 'invalid_title');
    const tid = id('t_');
    await q.run('INSERT INTO titles (id,name,kind,genres,language,synopsis,maturity,poster,is_placeholder,stream_url,captions_url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      tid, String(b.name), b.kind, (b.genres || []).join(','), String(b.language || 'en'), String(b.synopsis || ''), String(b.maturity || '19+'),
      b.poster || null, b.isPlaceholder ? 1 : 0, b.streamUrl || null, b.captionsUrl || null, now());
    await ctx.audit(user.id, 'title_create', 'title', tid, { name: b.name });
    return { id: tid };
  });
  r.post('/api/admin/titles/:id/rights', { auth: 'admin' }, async ({ user, params, body }) => {
    (await q.get('SELECT 1 FROM titles WHERE id=?', params.id)) || fail(404, 'title_not_found');
    const b = await body();
    if (!b.licensor || !b.contractRef || !Array.isArray(b.territories) || !b.territories.length) fail(400, 'invalid_rights', 'Licensor, contract reference and territories are required.');
    const starts = Date.parse(b.startsAt), ends = Date.parse(b.endsAt);
    if (!(starts < ends)) fail(400, 'invalid_window');
    const rid = id('tr_');
    await q.run('INSERT INTO title_rights (id,title_id,licensor,territories,starts_at,ends_at,ad_supported,rights_holder_share_pct,contract_ref,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      rid, params.id, String(b.licensor), b.territories.map((s) => String(s).toUpperCase()).join(','), starts, ends, b.adSupported === false ? 0 : 1,
      Number(b.rightsHolderSharePct ?? 50), String(b.contractRef), now());
    await ctx.audit(user.id, 'title_rights_add', 'title', params.id, { rid, territories: b.territories, contractRef: b.contractRef });
    return { id: rid };
  });
}
