import { api } from './api.js';
import { $, $$, esc, attr, avatar, money, count, ago, toast, sheet, setSheetBody, closeSheet, formData, busy } from './ui.js';
import { state, actions, forms, screens, go, route, onLeave } from './core.js';
import { openReport, refreshUnread } from './app.js';

// ======================= CINEMA =======================
let cinemaFilter = { kind: '', genre: '', list: '' };
screens.cinema = async (el) => {
  const qs = new URLSearchParams(Object.entries(cinemaFilter).filter(([, v]) => v)).toString();
  const r = await api.get('/api/cinema?' + qs);
  const hero = r.items[0];
  const pill = (k, v, label) => `<button class="pill ${cinemaFilter[k] === v ? 'on' : ''}" data-act="cinemaFilter" data-k="${k}" data-v="${v}">${esc(label)}</button>`;
  el.innerHTML = `<div class="pagehead"><h1>Cinema</h1>
    <p>Films and shows are free with ads, wherever we hold the rights for your region (${esc(r.territory)}).</p></div>
    <div class="pills">${pill('kind', '', 'All')}${pill('kind', 'movie', 'Movies')}${pill('kind', 'series', 'Series')}${pill('kind', 'documentary', 'Documentaries')}${pill('list', 'watchlist', 'My List')}</div>
    <div class="pills">${pill('genre', '', 'Any genre')}${r.genres.map((g) => pill('genre', g, g)).join('')}</div>
    ${r.licensedCount === 0 ? '<div class="pad"><div class="banner">No films are licensed yet. These are <strong>fictional placeholders</strong> and can’t be played.</div></div>' : ''}
    ${hero && !cinemaFilter.list ? `<div class="hero" style="background-image:url('${attr(hero.posterUrl)}')"><div class="hero-content"><span class="badge">${hero.isPlaceholder ? 'Fictional placeholder' : 'Featured'}</span>
      <h2>${esc(hero.name)}</h2><p>${esc(hero.genres.join(' · '))}</p><button class="button" data-act="openTitle" data-id="${hero.id}">View details</button></div></div>` : ''}
    <div class="pad">${r.continueWatching.length ? `<div class="section-title">Continue watching</div><div class="grid2">${r.continueWatching.map(poster).join('')}</div>` : ''}
    <div class="section-title">${cinemaFilter.list ? 'My List' : 'Browse'}</div>
    <div class="grid2">${r.items.map(poster).join('') || '<p class="subtle">Nothing here yet.</p>'}</div></div>`;
};
const poster = (t) => `<button class="poster" data-act="openTitle" data-id="${t.id}" style="background-image:url('${attr(t.posterUrl)}')" aria-label="${attr(t.name)}">
  <span class="postertxt">${esc(t.name)}<small>${esc(t.genres.join(' · '))} · ${t.availability.playable ? 'Free with ads' : t.isPlaceholder ? 'Placeholder' : 'Unavailable'}</small></span></button>`;
actions.cinemaFilter = (b) => { cinemaFilter[b.dataset.k] = cinemaFilter[b.dataset.k] === b.dataset.v ? '' : b.dataset.v; route(); };
actions.openTitle = async (b) => {
  const t = await api.get('/api/cinema/' + b.dataset.id);
  sheet(t.name, `<img src="${attr(t.posterUrl)}" alt="" style="width:100%;border-radius:13px;max-height:180px;object-fit:cover">
    <p><strong>${esc(t.genres.join(' · '))}</strong> · ${esc(t.kind)} · ${esc(t.language.toUpperCase())} · Rated ${esc(t.maturity)}</p><p>${esc(t.synopsis)}</p>
    ${t.availability.playable ? '' : `<div class="banner">${esc(t.availability.message)}</div>`}
    <div class="row"><button class="button" data-act="playTitle" data-id="${t.id}" ${t.availability.playable ? '' : 'disabled'}>▶ ${t.availability.playable ? 'Watch free' : 'Not available'}</button>
    <button class="button secondary" data-act="watchlist" data-id="${t.id}" data-on="${t.inWatchlist}">${t.inWatchlist ? '✓ In My List' : '+ My List'}</button></div>`);
};
actions.playTitle = async (b) => { const r = await api.post(`/api/cinema/${b.dataset.id}/play`); toast('Stream ready: ' + r.streamUrl); };
actions.watchlist = async (b) => {
  const on = b.dataset.on === 'true';
  const r = on ? await api.del(`/api/cinema/${b.dataset.id}/watchlist`) : await api.post(`/api/cinema/${b.dataset.id}/watchlist`);
  b.dataset.on = r.inWatchlist; b.textContent = r.inWatchlist ? '✓ In My List' : '+ My List';
  toast(r.inWatchlist ? 'Added to My List' : 'Removed from My List');
};

// ======================= CREATE =======================
screens.create = (el) => {
  el.innerHTML = `<div class="pagehead"><h1>Create</h1><p>Share an original video or photo. </p></div>
    <div class="pad"><form data-form="createPost" id="createForm">
      <div class="row"><label class="pill on"><input class="sr" type="radio" name="kind" value="video" checked> ▸ Video</label><label class="pill"><input class="sr" type="radio" name="kind" value="image"> ▧ Photo</label></div>
      <label class="formlabel" for="cfile">Choose or record</label>
      <input id="cfile" class="field" type="file" accept="video/*" capture="environment" required>
      <div id="cprev"></div>
      <label class="formlabel" for="ccap">Caption</label><textarea id="ccap" class="field" name="caption" rows="3" maxlength="2200" placeholder="Tell your story… #hashtags"></textarea>
      <label class="formlabel" for="calt">Description for screen readers</label><input id="calt" class="field" name="altText" maxlength="300" placeholder="What happens in the video or photo">
      <label class="formlabel" for="cvtt">Captions file (.vtt, optional)</label><input id="cvtt" class="field" type="file" accept=".vtt,text/vtt">
      <label class="formlabel" for="cremix">Who can stitch or remix this</label>
      <select id="cremix" class="field" name="remixPolicy"><option value="followers" ${state.me.defaultRemix === 'followers' ? 'selected' : ''}>People I follow back / followers</option><option value="everyone" ${state.me.defaultRemix === 'everyone' ? 'selected' : ''}>Everyone</option><option value="nobody" ${state.me.defaultRemix === 'nobody' ? 'selected' : ''}>Nobody</option></select>
      <label class="check"><input type="checkbox" name="allowComments" checked> Allow comments</label>
      <label class="check"><input type="checkbox" name="paidPartnership"> This is a paid partnership (adds a disclosure label)</label>
      <label class="check"><input type="checkbox" name="original" required> This is my original content or I have the rights to share it</label>
      <div class="progress hidden" id="cprog"><i></i></div><p class="subtle" id="cstatus" aria-live="polite"></p>
      <div class="row"><button class="button" type="submit" data-draft="0">Publish</button><button class="button secondary" type="submit" data-draft="1">Save draft</button></div>
    </form></div>`;
  const f = $('#createForm');
  $$('input[name=kind]', f).forEach((r) => r.addEventListener('change', () => {
    $$('label.pill', f).forEach((l) => l.classList.toggle('on', l.contains(r) ? r.checked : !r.checked));
    $('#cfile').accept = r.value === 'video' ? 'video/*' : 'image/*'; $('#cfile').value = ''; $('#cprev').innerHTML = '';
  }));
  $('#cfile').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const url = URL.createObjectURL(file);
    $('#cprev').innerHTML = file.type.startsWith('video') ? `<video class="preview" src="${url}" controls playsinline muted></video>` : `<img class="preview" src="${url}" alt="Selected photo preview">`;
  });
};
forms.createPost = async (f, ev) => {
  f.dataset.draft = ev.submitter?.dataset.draft || '0';
  const file = $('#cfile').files[0];
  if (!file) throw new Error('Choose a video or photo first.');
  const b = formData(f);
  if (!b.original) throw new Error('Please confirm you have the rights to share this.');
  const kind = b.kind;
  let captionsVtt = null;
  const vtt = $('#cvtt').files[0]; if (vtt) captionsVtt = await vtt.text();
  $$('button', f).forEach((x) => { x.disabled = true; });
  const prog = $('#cprog'), status = $('#cstatus');
  prog.classList.remove('hidden');
  try {
    status.textContent = 'Uploading…';
    const mediaId = await api.upload(file, kind, (x) => { prog.firstElementChild.style.width = Math.round(x * 100) + '%'; status.textContent = `Uploading… ${Math.round(x * 100)}%`; });
    status.textContent = 'Processing (checking and optimising your file)…';
    const r = await api.post('/api/posts', { mediaId, caption: b.caption, altText: b.altText, captionsVtt, remixPolicy: b.remixPolicy,
      allowComments: b.allowComments, paidPartnership: b.paidPartnership, draft: f.dataset.draft === '1' });
    if (r.held) { toast('Your post is held for review because the caption may break the Community Guidelines.', true); go('studio'); return; }
    if (r.post.status === 'draft') {
      const s = await api.waitForMedia(mediaId);
      toast(s.status === 'ready' ? 'Draft saved to Creator Studio' : 'Upload failed: ' + s.error, s.status !== 'ready'); go('studio'); return;
    }
    const s = await api.waitForMedia(mediaId);
    if (s.status !== 'ready') throw new Error('Your file could not be processed: ' + (s.error || 'unknown error'));
    toast('Posted! 🎉'); state.feedMode = 'foryou'; go('p/' + r.post.id);
  } finally { if (f.isConnected) { $$('button', f).forEach((x) => { x.disabled = false; }); } }
};

// ======================= COLLABS =======================
let collabCat = '';
screens.collabs = async (el) => {
  const r = await api.get('/api/campaigns' + (collabCat ? '?category=' + encodeURIComponent(collabCat) : ''));
  const mine = await api.get('/api/me/applications');
  el.innerHTML = `<div class="pagehead"><h1>Collabs</h1>
    <p>Paid briefs from verified businesses, open to every 19+ verified creator. Follower counts are visible but never decide who can apply.</p></div>
    <div class="pad"><div class="feature"><strong>Talent over follower count.</strong><p>No nano, micro or mega tiers and no follower minimums. Brands choose on fit, creativity, quality and reliability.</p></div></div>
    <div class="pills"><button class="pill ${!collabCat ? 'on' : ''}" data-act="collabCat" data-v="">All</button>${r.categories.map((c) => `<button class="pill ${collabCat === c ? 'on' : ''}" data-act="collabCat" data-v="${attr(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="pad"><div class="section-title">Open briefs <span class="badge">${r.items.length}</span></div>
    ${r.items.map((c) => `<button class="offer" data-act="openCampaign" data-id="${c.id}"><span class="offer-image" style="background-image:url('${attr(c.imageUrl || '')}')"></span><span class="grow">
      <h3>${esc(c.title)}</h3><p>${esc(c.brief.slice(0, 130))}</p><span class="tag">${esc(c.category)}</span><span class="tag">${money(c.compensationCents, c.currency)}</span>
      ${c.isSample ? '<span class="tag grey">Sample</span>' : ''}${c.myApplication ? `<span class="tag green">Applied · ${esc(c.myApplication.status)}</span>` : ''}</span></button>`).join('') || '<p class="subtle">No open briefs right now.</p>'}
    ${mine.length ? `<div class="section-title">My applications</div>${mine.map((a) => `<div class="listitem"><div class="grow"><strong>${esc(a.title)}</strong><p>${esc(a.status)}${a.contract ? ' · contract ' + esc(a.contract.status) : ''}</p></div>
      <button class="button secondary small" data-go="inbox/${a.conversationId}">Messages</button></div>`).join('')}` : ''}
    <p class="subtle" style="margin-top:16px">Sample briefs are fictional. Real campaigns require a verified business, disclosure, a contract, and a connected payment provider before money moves.</p></div>`;
};
actions.collabCat = (b) => { collabCat = b.dataset.v; route(); };
actions.openCampaign = async (b) => {
  const c = await api.get('/api/campaigns/' + b.dataset.id);
  const studio = await api.get('/api/studio');
  sheet(c.title, `<p>${esc(c.brief)}</p><p><strong>Deliverables:</strong> ${esc(c.deliverables)}</p>
    <p><strong>Pay:</strong> ${money(c.compensationCents, c.currency)} · <strong>Disclosure:</strong> ${esc(c.disclosure)}</p>
    <p><strong>Business:</strong> ${esc(c.business.name)} <span class="tag green">Verified</span></p>
    <div class="banner">${esc(c.eligibility)}${c.isSample ? ' Sample brief: no business pays through it.' : ''}</div>
    ${c.myApplication ? `<p class="tag green">You applied · ${esc(c.myApplication.status)}</p>` : `<form data-form="apply" data-id="${c.id}">
      <label class="formlabel" for="pitch">Your pitch</label><textarea id="pitch" class="field" name="pitch" rows="4" minlength="20" required placeholder="Your idea, why it fits, and how you’ll deliver it."></textarea>
      <label class="formlabel" for="pf">Portfolio post (optional)</label><select id="pf" class="field" name="portfolioPostId"><option value="">None</option>${studio.published.map((p) => `<option value="${p.id}">${esc(p.caption.slice(0, 50) || 'Untitled post')}</option>`).join('')}</select>
      <div style="margin-top:12px"><button class="button" type="submit">Submit application</button></div></form>`}`);
};
forms.apply = async (f) => {
  const b = formData(f);
  await api.post(`/api/campaigns/${f.dataset.id}/apply`, { pitch: b.pitch, portfolioPostId: b.portfolioPostId || null });
  closeSheet(); toast('Application sent'); route();
};

// ======================= MARKET =======================
let marketQ = '', marketCat = '';
screens.market = async (el, storeId) => {
  if (storeId) return storefront(el, storeId);
  el.innerHTML = `<div class="pagehead"><h1>Market</h1><p>Shop verified independent businesses and established brands.</p></div>
    <div class="pad"><input class="search" id="mq" placeholder="Search businesses and products…" aria-label="Search marketplace" value="${attr(marketQ)}"><div id="mcats" class="pills" style="padding:0 0 12px"></div><div id="mres" class="grid2"></div>
    <div class="feature" style="margin-top:16px"><strong>Sell on Mäka</strong><p>Register your business for verification, then open a storefront and post creator campaigns.</p><button class="button secondary" style="margin-top:12px" data-go="studio">Business tools →</button></div></div>`;
  let t; $('#mq').addEventListener('input', (e) => { clearTimeout(t); marketQ = e.target.value; t = setTimeout(loadMarket, 200); });
  await loadMarket();
};
async function loadMarket() {
  const r = await api.get(`/api/market/businesses?q=${encodeURIComponent(marketQ)}&category=${encodeURIComponent(marketCat)}`);
  $('#mcats').innerHTML = ['', ...r.categories].map((c) => `<button class="pill ${marketCat === c ? 'on' : ''}" data-act="marketCat" data-v="${attr(c)}">${esc(c || 'All')}</button>`).join('');
  $('#mres').innerHTML = r.items.map((b) => `<button class="tile" data-go="market/${b.id}"><div class="pic" style="background-image:url('${attr(b.coverUrl || '')}')"></div><div class="tiletxt"><strong>${esc(b.name)}</strong><p>${esc(b.category)} · ${b.productCount} products</p>${b.isSample ? '<span class="tag grey">Sample store</span>' : ''}</div></button>`).join('') || '<p class="subtle">No matching stores.</p>';
}
actions.marketCat = (b) => { marketCat = b.dataset.v; loadMarket(); };
async function storefront(el, id) {
  const r = await api.get('/api/market/businesses/' + id);
  const cart = state.cart[id] || {};
  const items = Object.values(cart).reduce((a, n) => a + n, 0);
  el.innerHTML = `<div class="pagehead"><button class="button secondary small" data-go="market">← Market</button><h1 style="margin-top:12px">${esc(r.business.name)}</h1>
    <p>${esc(r.business.description)}</p><span class="tag green">Verified business</span>${r.business.isSample ? '<span class="tag grey">Sample store</span>' : ''}</div>
    <div class="pad"><div class="grid2">${r.products.map((p) => `<div class="tile"><div class="pic" style="background-image:url('${attr(p.imageUrl || '')}')"></div><div class="tiletxt"><strong>${esc(p.name)}</strong><p>${esc(p.description)}</p>
      <div class="row between"><strong>${money(p.priceCents, p.currency)}</strong>${p.inStock ? `<button class="button small" data-act="addCart" data-store="${id}" data-product="${p.id}">Add</button>` : '<span class="tag grey">Sold out</span>'}</div></div></div>`).join('')}</div>
    <div style="margin-top:16px"><button class="button block" data-act="viewCart" data-store="${id}" ${items ? '' : 'disabled'} id="cartBtn">View bag (${items})</button></div></div>`;
  state.storeProducts = Object.fromEntries(r.products.map((p) => [p.id, p]));
}
actions.addCart = (b) => {
  const c = (state.cart[b.dataset.store] ??= {});
  c[b.dataset.product] = (c[b.dataset.product] || 0) + 1;
  const n = Object.values(c).reduce((a, x) => a + x, 0);
  $('#cartBtn').disabled = false; $('#cartBtn').textContent = `View bag (${n})`; toast('Added to bag');
};
actions.viewCart = (b) => {
  const store = b.dataset.store, c = state.cart[store] || {};
  const lines = Object.entries(c).map(([pid, qty]) => ({ p: state.storeProducts[pid], qty }));
  const total = lines.reduce((a, l) => a + l.p.priceCents * l.qty, 0);
  sheet('Your bag', `${lines.map((l) => `<div class="kv"><span>${esc(l.p.name)} × ${l.qty}</span><span>${money(l.p.priceCents * l.qty, l.p.currency)}</span></div>`).join('')}
    <div class="kv"><strong>Total</strong><strong>${money(total)}</strong></div>
    <p class="subtle">Taxes and shipping are calculated at checkout. Card details are entered with the payment provider and never stored by Mäka.</p>
    <button class="button block" data-act="placeOrder" data-store="${store}">Place order & pay</button>`);
};
actions.placeOrder = async (b) => {
  const store = b.dataset.store;
  const items = Object.entries(state.cart[store]).map(([productId, qty]) => ({ productId, qty }));
  const o = await api.post('/api/orders', { businessId: store, items });
  state.cart[store] = {};
  try { await api.post(`/api/orders/${o.orderId}/checkout`); }
  catch (e) {
    setSheetBody(`<p><strong>Order ${esc(o.orderId)}</strong> saved · ${money(o.totalCents, o.currency)}</p>
      <div class="banner">${esc(e.message)}</div><p class="subtle">You can find it under Settings → Orders, and cancel it at any time.</p>
      <button class="button secondary block" data-act="closeSheet">OK</button>`);
    return;
  }
};

// ======================= INBOX =======================
screens.inbox = async (el, convId) => {
  if (convId) return thread(el, convId);
  const [convs, notes] = await Promise.all([api.get('/api/conversations'), api.get('/api/notifications')]);
  el.innerHTML = `<div class="pagehead"><h1>Inbox</h1><p>Private messages, group chats, brand conversations and activity.</p></div>
    <div class="pad"><div class="row"><button class="button" data-act="newChat">New message</button><button class="button secondary" data-act="newGroup">New group</button></div>
    <div class="section-title">Messages</div>
    ${convs.map((c) => `<button class="listitem" data-go="inbox/${c.id}">${c.isGroup ? '<span class="avatar">👥</span>' : avatar(c.members[0])}<div class="grow"><strong>${esc(c.title)}</strong>
      <p>${c.lastMessage ? (c.lastMessage.mine ? 'You: ' : '') + esc(c.lastMessage.body) : 'No messages yet'}</p></div>${c.unread ? `<span class="unread">${c.unread}</span>` : ''}</button>`).join('') || '<p class="subtle">No conversations yet.</p>'}
    <div class="section-title">Activity <button class="button secondary small" data-act="readAll">Mark all read</button></div>
    ${notes.items.map((n) => `<div class="listitem"><div class="grow"><strong style="font-weight:${n.read ? 500 : 800}">${esc(n.text)}</strong><p>${ago(n.createdAt)}</p></div>
      ${n.refType === 'post' ? `<button class="button secondary small" data-go="p/${n.refId}">View</button>` : ''}</div>`).join('') || '<p class="subtle">No activity yet.</p>'}</div>`;
};
actions.readAll = async () => { await api.post('/api/notifications/read'); await refreshUnread(); route(); };
actions.newChat = () => sheet('New message', `<form data-form="newChat"><label class="formlabel" for="to">To (handle)</label><input id="to" class="field" name="to" required placeholder="@handle" autofocus>
  <label class="formlabel" for="firstmsg">Message</label><textarea id="firstmsg" class="field" name="message" rows="3" required maxlength="2000"></textarea>
  <div style="margin-top:12px"><button class="button" type="submit">Send</button></div></form>`);
actions.newGroup = () => sheet('New group', `<form data-form="newChat"><label class="formlabel" for="gt">Group name</label><input id="gt" class="field" name="title" required maxlength="60">
  <label class="formlabel" for="to">Members (handles, comma separated)</label><input id="to" class="field" name="to" required placeholder="@amara.creates, @olivia.studio">
  <label class="formlabel" for="firstmsg">First message</label><textarea id="firstmsg" class="field" name="message" rows="2" required maxlength="2000"></textarea>
  <div style="margin-top:12px"><button class="button" type="submit">Create group</button></div></form>`);
forms.newChat = async (f) => {
  const b = formData(f);
  const memberIds = b.to.split(',').map((s) => s.trim().replace(/^@/, '')).filter(Boolean);
  const r = await api.post('/api/conversations', { memberIds, title: b.title, message: b.message });
  closeSheet(); go('inbox/' + r.id);
};
async function thread(el, id) {
  const convs = await api.get('/api/conversations');
  const c = convs.find((x) => x.id === id);
  if (!c) throw new Error('Conversation not found');
  el.innerHTML = `<div class="thread"><div class="row" style="padding:10px 14px;border-bottom:1px solid #2c292f"><button class="button secondary small" data-go="inbox">←</button>
    <strong class="grow">${esc(c.title)}</strong>${c.isGroup ? `<button class="button secondary small" data-act="leaveChat" data-id="${id}">Leave</button>` : `<button class="button secondary small" data-go="u/${attr(c.members[0].handle)}">Profile</button>`}</div>
    <div class="msgs" id="msgs" aria-live="polite"></div>
    <form data-form="sendMsg" data-id="${id}"><input class="field" name="body" required maxlength="2000" placeholder="Write a respectful message…" aria-label="Message" autocomplete="off"><button class="button" type="submit">Send</button></form></div>`;
  await loadMsgs(id);
  const onMsg = (e) => { if (e.detail.conversationId === id) loadMsgs(id); };
  window.addEventListener('maka:message', onMsg);
  onLeave(() => window.removeEventListener('maka:message', onMsg));
  refreshUnread();
}
async function loadMsgs(id) {
  const msgs = await api.get(`/api/conversations/${id}/messages`);
  const box = $('#msgs'); if (!box) return;
  box.innerHTML = msgs.map((m) => `<div class="bubble ${m.mine ? 'me' : ''} ${m.status === 'held' ? 'held' : ''}">${m.mine ? '' : `<small>@${esc(m.sender.handle)}</small>`}${esc(m.body)}
    <small>${ago(m.createdAt)}${m.status === 'held' ? ' · held for review, not delivered' : ''}${!m.mine ? ` · <a href="#" data-act="reportMsg" data-id="${m.id}">Report</a>` : ''}</small></div>`).join('') || '<p class="subtle">Say hello 👋</p>';
  box.scrollTop = box.scrollHeight;
}
forms.sendMsg = async (f) => {
  const input = f.elements.body;
  const r = await api.post(`/api/conversations/${f.dataset.id}/messages`, { body: input.value });
  input.value = ''; if (r.message) toast(r.message, true);
  await loadMsgs(f.dataset.id);
};
actions.reportMsg = (b) => openReport('message', b.dataset.id, 'Report message');
actions.leaveChat = async (b) => { await api.post(`/api/conversations/${b.dataset.id}/leave`); go('inbox'); };

// ======================= CREATOR STUDIO & BUSINESS TOOLS =======================
screens.studio = async (el) => {
  const [s, apps, bizs] = await Promise.all([api.get('/api/studio'), api.get('/api/me/applications'), api.get('/api/me/businesses')]);
  const e = s.earnings;
  const row = (p, extra = '') => `<div class="listitem"><span class="thumb" style="width:46px;flex:0 0 46px;background-image:url('${attr(p.posterUrl || '')}')"></span><div class="grow"><strong>${esc(p.caption.slice(0, 50) || 'Untitled')}</strong>
    <p>${p.status === 'published' ? `${count(p.views)} views · ${count(p.likes)} likes · ${count(p.comments)} comments` : esc(p.status) + (p.mediaError ? ' · ' + esc(p.mediaError) : '')}</p></div>${extra}</div>`;
  el.innerHTML = `<div class="pagehead"><h1>Studio</h1><p>${esc(s.eligibility)}</p></div><div class="pad">
    <div class="metrics"><div class="metric"><strong>${count(s.totals.views)}</strong><span>Views</span></div><div class="metric"><strong>${count(s.totals.likes)}</strong><span>Likes</span></div><div class="metric"><strong>${count(s.totals.comments)}</strong><span>Comments</span></div></div>
    <div class="section-title">Earnings</div><div class="feature">
      <div class="num" style="margin:6px 0">${money(e.availableCents + e.pendingCents, e.currency)}</div>
      <p>Pending ${money(e.pendingCents)} · Available ${money(e.availableCents)} · Paid out ${money(e.paidOutCents)}</p>${e.payoutsNote ? `<p>${esc(e.payoutsNote)}</p>` : ''}</div>
    ${e.ledger.length ? e.ledger.map((x) => `<div class="kv"><span>${esc(x.source)} · ${esc(x.status)}</span><span>${money(x.amountCents, x.currency)}</span></div>`).join('') : ''}
    ${s.drafts.length ? `<div class="section-title">Drafts</div>${s.drafts.map((p) => row(p, `<button class="button small" data-act="publishDraft" data-post="${p.id}">Publish</button>`)).join('')}` : ''}
    ${s.processing.length ? `<div class="section-title">Processing</div>${s.processing.map((p) => row(p)).join('')}` : ''}
    ${s.held.length ? `<div class="section-title">Held for review</div>${s.held.map((p) => row(p)).join('')}` : ''}
    <div class="section-title">Published</div>${s.published.map((p) => row(p, `<button class="button secondary small" data-go="p/${p.id}">Open</button>`)).join('') || '<p class="subtle">Nothing published yet.</p>'}
    <div class="section-title">Collaborations</div>${apps.map((a) => `<div class="listitem"><div class="grow"><strong>${esc(a.title)}</strong><p>Application ${esc(a.status)}${a.contract ? ` · contract ${esc(a.contract.status)} · ${money(a.contract.amountCents, a.contract.currency)}` : ''}</p></div>
      ${a.contract?.status === 'offered' ? `<button class="button small" data-act="contract" data-id="${a.contract.id}" data-do="sign">Sign</button>` : ''}
      ${a.contract?.status === 'signed' ? `<button class="button small" data-act="contract" data-id="${a.contract.id}" data-do="deliver">Mark delivered</button>` : ''}</div>`).join('') || '<p class="subtle">No applications yet. <a href="#/collabs">Browse open briefs</a>.</p>'}
    <div class="section-title">Business tools</div>
    ${bizs.map((b) => `<div class="card p" style="margin-bottom:10px"><div class="row between"><strong>${esc(b.name)}</strong><span class="tag ${b.verification === 'verified' ? 'green' : 'grey'}">${esc(b.verification)}</span></div>
      ${b.verification === 'verified' ? `<div class="row wrap" style="margin-top:10px"><button class="button small" data-act="newCampaign" data-biz="${b.id}">Post campaign</button><button class="button small secondary" data-act="newProduct" data-biz="${b.id}">Add product</button><button class="button small secondary" data-act="applicants" data-biz="${b.id}">Applicants</button></div>` : '<p class="subtle">Awaiting verification by the Mäka team.</p>'}</div>`).join('')}
    <button class="button secondary" data-act="newBusiness">Register a business</button></div>`;
};
actions.publishDraft = async (b) => { await api.patch('/api/posts/' + b.dataset.post, { publish: true }); toast('Published'); route(); };
actions.contract = async (b) => { const r = await api.post(`/api/contracts/${b.dataset.id}/${b.dataset.do}`); toast(r.note || 'Contract ' + r.status); route(); };
actions.newBusiness = () => sheet('Register a business', `<form data-form="newBusiness"><label class="formlabel" for="bn">Business name</label><input id="bn" class="field" name="name" required>
  <label class="formlabel" for="bc">Category</label><input id="bc" class="field" name="category" required placeholder="Beauty, Fashion, Food…">
  <label class="formlabel" for="bd">Description</label><textarea id="bd" class="field" name="description" rows="2"></textarea>
  <label class="formlabel" for="bw">Website</label><input id="bw" class="field" name="website" type="url">
  <label class="formlabel" for="br">Business registration / tax number</label><input id="br" class="field" name="registrationRef" required>
  <div style="margin-top:12px"><button class="button" type="submit">Submit for verification</button></div></form>`);
forms.newBusiness = async (f) => { const r = await api.post('/api/businesses', formData(f)); closeSheet(); toast(r.message); route(); };
actions.newCampaign = (b) => sheet('Post a campaign', `<div class="banner">Campaigns are open to every eligible creator. Follower minimums and creator tiers are not allowed.</div>
  <form data-form="newCampaign" data-biz="${b.dataset.biz}"><label class="formlabel" for="ct">Title</label><input id="ct" class="field" name="title" required>
  <label class="formlabel" for="cb">Brief</label><textarea id="cb" class="field" name="brief" rows="3" required></textarea>
  <label class="formlabel" for="cd">Deliverables</label><input id="cd" class="field" name="deliverables" required>
  <label class="formlabel" for="cc">Paid compensation (CAD)</label><input id="cc" class="field" name="pay" type="number" min="1" step="1" required>
  <div style="margin-top:12px"><button class="button" type="submit">Publish campaign</button></div></form>`);
forms.newCampaign = async (f) => { const b = formData(f); await api.post(`/api/businesses/${f.dataset.biz}/campaigns`, { title: b.title, brief: b.brief, deliverables: b.deliverables, compensationCents: Math.round(b.pay * 100) }); closeSheet(); toast('Campaign published'); };
actions.newProduct = (b) => sheet('Add product', `<form data-form="newProduct" data-biz="${b.dataset.biz}"><label class="formlabel" for="pn">Name</label><input id="pn" class="field" name="name" required>
  <label class="formlabel" for="pd">Description</label><textarea id="pd" class="field" name="description" rows="2"></textarea>
  <label class="formlabel" for="pp">Price (CAD)</label><input id="pp" class="field" name="price" type="number" min="0" step="0.01" required>
  <label class="formlabel" for="ps">Stock</label><input id="ps" class="field" name="stock" type="number" min="0" value="10">
  <div style="margin-top:12px"><button class="button" type="submit">Add product</button></div></form>`);
forms.newProduct = async (f) => { const b = formData(f); await api.post(`/api/businesses/${f.dataset.biz}/products`, { name: b.name, description: b.description, priceCents: Math.round(b.price * 100), stock: Number(b.stock) }); closeSheet(); toast('Product added'); };
actions.applicants = async (b) => {
  const list = await api.get(`/api/businesses/${b.dataset.biz}/applications`);
  sheet('Applicants', `<p class="subtle">In the order they applied.</p>
    ${list.map((a) => `<div class="adminitem"><div class="row">${avatar(a.creator, 30)}<strong class="grow">@${esc(a.creator.handle)}</strong><span class="tag">${esc(a.status)}</span></div>
      <p><em>${esc(a.campaign)}</em></p><p>${esc(a.pitch)}</p><p class="subtle">Completed collaborations: ${a.completedCollaborations}${a.portfolio ? ` · <a href="#/p/${a.portfolio.id}">portfolio post</a>` : ''}</p>
      <div class="row wrap">${['shortlisted', 'accepted', 'declined'].map((s) => `<button class="button small secondary" data-act="decide" data-id="${a.id}" data-s="${s}">${s}</button>`).join('')}<button class="button small" data-go="inbox/${a.conversationId}">Message</button></div></div>`).join('') || '<p class="subtle">No applications yet.</p>'}`);
};
actions.decide = async (b) => { await api.post(`/api/applications/${b.dataset.id}/decision`, { status: b.dataset.s }); toast('Applicant ' + b.dataset.s); closeSheet(); };

// ======================= SETTINGS & SAFETY =======================
screens.settings = async (el) => {
  const [blocked, sanctions, reports, orders] = await Promise.all([api.get('/api/me/blocked'), api.get('/api/me/sanctions'), api.get('/api/me/reports'), api.get('/api/me/orders')]);
  const m = state.me;
  el.innerHTML = `<div class="pagehead"><button class="button secondary small" data-go="profile">← Profile</button><h1 style="margin-top:12px">Settings & safety</h1></div><div class="pad">
    <form data-form="privacy" class="card p"><strong>Privacy & interactions</strong>
      <label class="formlabel" for="dm">Who can message me</label><select id="dm" class="field" name="dmPolicy">${[['everyone', 'Everyone (19+ verified)'], ['following', 'Only people I follow'], ['nobody', 'Nobody']].map(([v, l]) => `<option value="${v}" ${m.dmPolicy === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="formlabel" for="rx">Default stitch/remix permission</label><select id="rx" class="field" name="defaultRemix">${['everyone', 'followers', 'nobody'].map((v) => `<option ${m.defaultRemix === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label class="formlabel" for="cf">Hide comments containing (comma separated)</label><input id="cf" class="field" name="commentFilter" value="${attr(m.commentFilter.join(', '))}">
      <div style="margin-top:12px"><button class="button" type="submit">Save</button></div></form>
    <div class="section-title">Blocked accounts</div>${blocked.map((u) => `<div class="listitem">${avatar(u)}<strong class="grow">@${esc(u.handle)}</strong><button class="button secondary small" data-act="unblockUser" data-user="${u.id}">Unblock</button></div>`).join('') || '<p class="subtle">None.</p>'}
    <div class="section-title">Your reports</div>${reports.map((r) => `<div class="kv"><span>${esc(r.reason)} (${esc(r.target_type)})</span><span>${esc(r.status)}</span></div>`).join('') || '<p class="subtle">None.</p>'}
    <div class="section-title">Account standing</div>${sanctions.map((s) => `<div class="adminitem"><strong>${esc(s.level)}:</strong> ${esc(s.reason)}<br><span class="subtle">${new Date(s.created_at).toLocaleString()}${s.revoked ? ' · overturned' : ''}</span>
      ${s.revoked ? '' : `<div style="margin-top:8px"><button class="button small secondary" data-act="appeal" data-id="${s.id}">Appeal</button></div>`}</div>`).join('') || '<p class="subtle">Good standing ✓</p>'}
    <div class="section-title">Orders</div>${orders.map((o) => `<div class="kv"><span>${esc(o.business)} · ${esc(o.status)}</span><span>${money(o.totalCents, o.currency)} ${o.status === 'awaiting_payment' ? `<button class="button small secondary" data-act="cancelOrder" data-id="${o.id}">Cancel</button>` : ''}</span></div>`).join('') || '<p class="subtle">No orders.</p>'}
    <div class="section-title">Your data</div><div class="stack"><button class="button secondary" data-act="exportData">Download my data</button>
      <button class="button secondary" data-act="signout">Sign out</button><button class="button danger" data-act="deleteAccount">Delete account</button></div>
    <p class="subtle" style="margin-top:16px">Age status: ${esc(m.ageStatus)} (19+). We keep only the verification result, never ID images.</p></div>`;
};
forms.privacy = async (f) => {
  const b = formData(f);
  state.me = await api.patch('/api/me', { dmPolicy: b.dmPolicy, defaultRemix: b.defaultRemix, commentFilter: b.commentFilter.split(',').map((s) => s.trim()).filter(Boolean) });
  toast('Settings saved');
};
actions.appeal = (b) => sheet('Appeal', `<form data-form="appeal" data-id="${b.dataset.id}"><p>Explain why you think this decision was wrong. A different reviewer will look at it.</p>
  <textarea class="field" name="body" rows="4" required maxlength="2000" aria-label="Appeal"></textarea><div style="margin-top:12px"><button class="button" type="submit">Submit appeal</button></div></form>`);
forms.appeal = async (f) => { await api.post('/api/appeals', { sanctionId: f.dataset.id, body: formData(f).body }); closeSheet(); toast('Appeal submitted'); };
actions.cancelOrder = async (b) => { await api.post(`/api/orders/${b.dataset.id}/cancel`); toast('Order cancelled'); route(); };
actions.exportData = async () => {
  const data = await api.get('/api/me/export');
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'maka-data-export.json'; a.click(); URL.revokeObjectURL(url);
};
actions.deleteAccount = () => sheet('Delete account', `<form data-form="deleteAccount"><p>This permanently removes your profile, posts and comments. Enter your password to confirm.</p>
  <input class="field" type="password" name="password" required aria-label="Password" autocomplete="current-password"><div style="margin-top:12px"><button class="button danger" type="submit">Delete my account</button></div></form>`);
forms.deleteAccount = async (f) => { await api.del('/api/me', formData(f)); api.token = null; state.me = null; closeSheet(); go('welcome'); };

// ======================= TRUST & SAFETY ADMIN =======================
screens.admin = async (el) => {
  if (state.me.role !== 'admin') { el.innerHTML = '<div class="empty">Not available.</div>'; return; }
  const [o, reports, appeals, biz, audit] = await Promise.all([api.get('/api/admin/overview'), api.get('/api/admin/reports'), api.get('/api/admin/appeals'), api.get('/api/admin/businesses'), api.get('/api/admin/audit')]);
  el.innerHTML = `<div class="pagehead"><h1>Moderation</h1><p>Every action is logged and can be appealed.</p></div><div class="pad">
    <div class="metrics"><div class="metric"><strong>${o.openReports}</strong><span>Open reports</span></div><div class="metric"><strong>${o.openAppeals}</strong><span>Appeals</span></div><div class="metric"><strong>${o.pendingBusinesses}</strong><span>Businesses</span></div></div>
    <div class="section-title">Report queue (highest risk first)</div>
    ${reports.map((r) => `<div class="adminitem"><div class="row between"><strong>${esc(r.reason)} · ${esc(r.targetType)}</strong><span class="tag ${r.priority >= 4 ? 'red' : ''}">P${r.priority}${r.systemGenerated ? ' · auto' : ''}</span></div>
      <p class="subtle">${esc(r.details)}</p>${r.evidence ? `<pre>${esc(r.evidence)}</pre>` : ''}<p class="subtle">Target: ${r.targetUser ? '@' + esc(r.targetUser.handle) : 'none'} · prior sanctions: ${r.sanctionHistory.length} · suggested: <strong>${esc(r.recommendedLevel)}</strong></p>
      <form data-form="resolve" data-id="${r.id}" class="row wrap"><input class="field" name="note" placeholder="Reason (shown to user)" style="flex:1 1 100%">
      ${['dismiss', 'approve_content', 'remove_content', 'warning', 'restrict', 'suspend', 'ban', 'escalate'].map((a) => `<button class="button small ${a === 'ban' ? 'danger' : 'secondary'}" type="submit" data-action="${a}">${a.replace('_', ' ')}</button>`).join('')}</form></div>`).join('') || '<p class="subtle">Queue is clear.</p>'}
    <div class="section-title">Appeals</div>${appeals.map((a) => `<div class="adminitem"><strong>@${esc(a.user.handle)}</strong> appeals ${esc(a.sanction?.level)}: ${esc(a.sanction?.reason)}<p>${esc(a.body)}</p>
      <div class="row"><button class="button small" data-act="decideAppeal" data-id="${a.id}" data-d="overturned">Overturn</button><button class="button small secondary" data-act="decideAppeal" data-id="${a.id}" data-d="upheld">Uphold</button></div></div>`).join('') || '<p class="subtle">No open appeals.</p>'}
    <div class="section-title">Business verification</div>${biz.map((b) => `<div class="adminitem"><strong>${esc(b.name)}</strong> · ${esc(b.category)} · reg ${esc(b.registration_ref)}
      <div class="row" style="margin-top:8px"><button class="button small" data-act="verifyBiz" data-id="${b.id}" data-d="verified">Verify</button><button class="button small secondary" data-act="verifyBiz" data-id="${b.id}" data-d="rejected">Reject</button></div></div>`).join('') || '<p class="subtle">None pending.</p>'}
    <div class="section-title">Audit log</div>${audit.slice(0, 40).map((a) => `<div class="kv"><span>${esc(a.action)} · ${esc(a.target_type || '')}</span><span class="subtle">${new Date(a.created_at).toLocaleString()}</span></div>`).join('')}</div>`;
};
forms.resolve = async (f, ev) => {
  f.dataset.action = ev.submitter?.dataset.action || 'dismiss'; await api.post(`/api/admin/reports/${f.dataset.id}/resolve`, { action: f.dataset.action, note: f.elements.note.value }); toast('Done: ' + f.dataset.action); route(); };
actions.decideAppeal = async (b) => { await api.post(`/api/admin/appeals/${b.dataset.id}/decide`, { decision: b.dataset.d }); toast('Appeal ' + b.dataset.d); route(); };
actions.verifyBiz = async (b) => { await api.post(`/api/admin/businesses/${b.dataset.id}/verify`, { decision: b.dataset.d }); toast('Business ' + b.dataset.d); route(); };
