import { api } from './api.js';
import { $, $$, esc, attr, avatar, count, ago, toast, errorToast, sheet, setSheetBody, closeSheet, formData, busy } from './ui.js';
import { state, actions, forms, screens, go, route, onLeave } from './core.js';
import './sections.js';

// ======================= auth & 19+ gate =======================
const TAGLINE = 'Feel The Power Of Love Within You';

screens.welcome = (el) => {
  el.innerHTML = `<div class="auth">
    <div class="logo-card"><img src="/assets/approved-logo.webp" alt="Mäka. ${TAGLINE}"></div>
    <p class="subtle" style="text-align:center;margin:0 0 18px">A respectful community for creators, film lovers and businesses. <strong>Strictly 19+.</strong></p>
    <div class="stack"><button class="button block" data-go="signup">Create account</button><button class="button secondary block" data-go="signin">Sign in</button></div>
    <p class="subtle" style="text-align:center;margin-top:18px">You’ll confirm you are 19 or older with a privacy-first verification method before you can use Mäka.</p></div>`;
};

screens.signup = async (el) => {
  const health = await api.get('/api/health').catch(() => ({}));
  el.innerHTML = `<div class="auth"><button class="link button secondary small" data-go="welcome" style="align-self:flex-start">← Back</button>
    <h1 style="margin:16px 0 4px">Join Mäka</h1><p class="subtle">Strictly for adults aged 19+. Your public handle can differ from your legal name.</p>
    <form data-form="signup" novalidate>
      <label class="formlabel" for="su-email">Email</label><input id="su-email" class="field" name="email" type="email" autocomplete="email" required>
      <label class="formlabel" for="su-pass">Password (10+ characters)</label><input id="su-pass" class="field" name="password" type="password" minlength="10" autocomplete="new-password" required>
      <label class="formlabel" for="su-handle">Handle</label><input id="su-handle" class="field" name="handle" autocomplete="username" placeholder="yourname" required>
      <label class="formlabel" for="su-name">Display name</label><input id="su-name" class="field" name="displayName" required maxlength="40">
      ${health.inviteRequired ? '<label class="formlabel" for="su-invite">Invite code</label><input id="su-invite" class="field" name="inviteCode" required autocomplete="off">' : ''}
      <label class="check"><input type="checkbox" name="acceptTerms"> <span>I agree to the <a href="/guidelines.html" target="_blank" rel="noopener">Community Guidelines</a> (no bullying, racism, threats, doxxing or ridicule) and the <a href="/terms.html" target="_blank" rel="noopener">Terms</a> &amp; <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>
      <button class="button block" type="submit">Continue to age check</button></form></div>`;
};
forms.signup = async (f) => {
  const b = formData(f);
  await busy(f.querySelector('button[type=submit]'), async () => {
    const r = await api.post('/api/auth/register', b);
    api.token = r.token; state.me = r.user; go('verify');
  });
};

screens.signin = (el) => {
  el.innerHTML = `<div class="auth"><button class="button secondary small" data-go="welcome" style="align-self:flex-start">← Back</button>
    <h1 style="margin:16px 0 14px">Welcome back</h1>
    <form data-form="signin"><label class="formlabel" for="si-email">Email</label><input id="si-email" class="field" name="email" type="email" autocomplete="email" required>
    <label class="formlabel" for="si-pass">Password</label><input id="si-pass" class="field" name="password" type="password" autocomplete="current-password" required>
    <div style="margin-top:16px"><button class="button block" type="submit">Sign in</button></div></form>
    <button class="button secondary block" data-go="forgot" style="margin-top:8px">Forgot password?</button></div>`;
};
screens.forgot = (el) => {
  el.innerHTML = `<div class="auth"><button class="button secondary small" data-go="signin" style="align-self:flex-start">← Back</button>
    <h1 style="margin:16px 0 8px">Reset password</h1><p class="muted">Enter the email on your account. We’ll send a link to choose a new password.</p>
    <form data-form="forgot"><label class="formlabel" for="fp-email">Email</label><input id="fp-email" class="field" name="email" type="email" autocomplete="email" required>
    <div style="margin-top:16px"><button class="button block" type="submit">Send reset link</button></div><p class="muted" data-sent hidden></p></form></div>`;
};
forms.forgot = async (f) => {
  await busy(f.querySelector('button'), async () => {
    await api.post('/api/auth/forgot', formData(f));
    const p = f.querySelector('[data-sent]'); p.hidden = false;
    p.textContent = 'If an account uses that email, a reset link is on its way. It expires in 30 minutes.';
  });
};
forms.signin = async (f) => {
  await busy(f.querySelector('button'), async () => {
    const r = await api.post('/api/auth/login', formData(f));
    api.token = r.token; state.me = r.user; startRealtime(); go('home');
  });
};

screens.verify = async (el) => {
  const m = await api.get('/api/age/methods');
  const st = state.me.ageStatus;
  const msg = { pending: 'You started a check. You can continue it or choose another method.', failed: 'That check didn’t complete. You can try again or pick another method.',
    review: 'Your verification is under review by our team. We’ll notify you when it’s done.' }[st] || '';
  el.innerHTML = `<div class="auth">
    <h1 style="margin:6px 0">Confirm you’re 19 or older</h1>
    <p class="subtle">Choose <strong>one</strong> method that works for you. We only keep the result, never your ID or selfie.</p>
    ${m.isTestMode ? '<div class="banner test"><strong>TEST MODE.</strong> No real age-verification provider is connected yet. The next step is a simulator for development and testing only. Production will not start in this mode.</div>' : ''}
    ${msg ? `<div class="banner">${esc(msg)}</div>` : ''}
    ${st === 'review' ? '' : `<form data-form="ageStart">${m.methods.map((x, i) => `<label class="method ${i === 0 ? 'sel' : ''}"><input class="sr" type="radio" name="method" value="${x.id}" ${i === 0 ? 'checked' : ''}><strong>${esc(x.label)}</strong><span>${esc(x.note)}</span></label>`).join('')}
    <button class="button block" type="submit">Start verification</button></form>`}
    <button class="button secondary block" style="margin-top:10px" data-act="signout">Sign out</button></div>`;
  $$('.method input', el).forEach((i) => i.addEventListener('change', () => $$('.method', el).forEach((l) => l.classList.toggle('sel', l.contains(i) && i.checked))));
};
forms.ageStart = async (f) => {
  const r = await api.post('/api/age/start', { method: formData(f).method });
  state.me.ageStatus = 'pending';
  if (/^https:\/\//.test(r.redirectUrl)) location.href = r.redirectUrl; // the provider's hosted check
  else location.hash = r.redirectUrl.replace(/^\/?#/, '');
};

screens['age-test'] = (el, checkId) => {
  el.innerHTML = `<div class="auth"><div class="banner test"><strong>AGE-VERIFICATION SIMULATOR (TEST ONLY).</strong> This page stands in for a real provider’s hosted check so the rest of Mäka can be developed and tested. It verifies nothing.</div>
    <h1 style="margin:6px 0 12px">Simulated result</h1>
    <label class="formlabel" for="tid">Test identity (used to demo ban-evasion checks)</label><input id="tid" class="field" value="test-person-${Math.random().toString(36).slice(2, 8)}">
    <div class="stack" style="margin-top:14px">
      <button class="button block" data-act="ageSim" data-check="${attr(checkId)}" data-outcome="verified">Simulate: verified adult (19+)</button>
      <button class="button secondary block" data-act="ageSim" data-check="${attr(checkId)}" data-outcome="under_age">Simulate: under 19</button>
      <button class="button secondary block" data-act="ageSim" data-check="${attr(checkId)}" data-outcome="failed">Simulate: check failed</button></div></div>`;
};
actions.ageSim = async (b) => {
  const r = await api.post('/api/age/test/complete', { checkId: b.dataset.check, outcome: b.dataset.outcome, testIdentity: $('#tid').value });
  if (r.outcome === 'under_age') {
    api.token = null; state.me = null;
    $('#screen').innerHTML = '<div class="auth"><h1>Mäka is for adults 19+</h1><p class="subtle">We couldn’t confirm you are 19 or older, so the account has been closed and its personal details removed.</p><button class="button secondary" data-go="welcome">OK</button></div>';
    return;
  }
  state.me = r.user || state.me;
  if (r.outcome === 'verified') { toast('Age confirmed. Welcome to Mäka 🐝'); startRealtime(); }
  go(r.outcome === 'verified' ? 'home' : 'verify');
};

actions.signout = async () => {
  try { await api.post('/api/auth/logout'); } catch { /* already out */ }
  api.token = null; state.me = null; stopRealtime?.(); go('welcome');
};
window.addEventListener('maka:signedout', () => { state.me = null; go('welcome'); });

// ======================= feed =======================
function storyHTML(p, { withTabs = true } = {}) {
  const a = p.author;
  const media = p.kind === 'video'
    ? `<video playsinline loop ${state.muted ? 'muted' : ''} preload="metadata" poster="${attr(p.posterUrl || '')}" data-src="${attr(p.videoUrl || '')}" aria-label="Video by @${attr(a.handle)}${p.altText ? ': ' + attr(p.altText) : ''}">${p.captionsUrl ? `<track kind="captions" srclang="en" label="Captions" src="${attr(p.captionsUrl)}" default>` : ''}</video>`
    : p.kind === 'text' ? `<div class="textpost ${attr(p.textStyle || 'honey')}" role="img" aria-label="Text post by @${attr(a.handle)}"><p>${esc(p.caption)}</p></div>`
    : `<img class="still" src="${attr(p.imageUrl || p.posterUrl || '')}" alt="${attr(p.altText || 'Photo by @' + a.handle)}">${p.kind === 'carousel' && p.images ? `<span class="carouselcount">1 / ${p.images.length}</span>` : ''}`;
  const me = state.me.id === a.id;
  return `<section class="story" data-post="${p.id}" data-author="${a.id}" aria-label="Post by @${attr(a.handle)}">
    ${media}
    ${withTabs ? `<div class="feedtop"><button class="${state.feedMode === 'following' ? 'sel' : ''}" data-act="feedMode" data-mode="following">Following</button><button class="${state.feedMode === 'foryou' ? 'sel' : ''}" data-act="feedMode" data-mode="foryou">For You</button></div>` : ''}
    ${p.kind === 'video' ? `<button class="mute" data-act="toggleMute" aria-label="${state.muted ? 'Unmute' : 'Mute'}">${state.muted ? '🔇' : '🔊'}</button>` : ''}
    <div class="pausehint" aria-hidden="true">❚❚</div>
    <div class="storybody"><div class="handle"><button class="who" data-go="u/${attr(a.handle)}">${avatar(a)}<span>@${esc(a.handle)}</span></button>
      ${me ? '' : `<button class="followbtn" data-act="follow" data-user="${a.id}" aria-pressed="${a.isFollowing}">${a.isFollowing ? 'Following' : '+ Follow'}</button>`}</div>
      ${p.kind === 'text' ? '' : `<div class="caption">${esc(p.caption)}</div>`}
      ${p.isPaidPartnership ? '<div class="tagline">Paid partnership</div>' : ''}${a.isSample ? '<div class="tagline">Sample account</div>' : ''}
      ${p.status !== 'published' ? `<div class="tagline">Status: ${esc(p.status)}</div>` : ''}</div>
    <div class="actions">
      <button class="act ${p.liked ? 'on' : ''}" data-act="like" aria-pressed="${p.liked}" aria-label="Like, ${p.likes} likes"><span class="symbol">${p.liked ? '♥' : '♡'}</span><span class="n">${count(p.likes)}</span></button>
      <button class="act" data-act="comments" aria-label="Comments, ${p.comments}"><span class="symbol">💬</span><span class="n">${count(p.comments)}</span></button>
      <button class="act ${p.saved ? 'saved' : ''}" data-act="save" aria-pressed="${p.saved}" aria-label="Save"><span class="symbol">${p.saved ? '◆' : '◇'}</span>Save</button>
      <button class="act" data-act="share" aria-label="Share"><span class="symbol">↗</span>Share</button>
      <button class="act" data-act="more" aria-label="More options and report"><span class="symbol">⋯</span>More</button>
    </div></section>`;
}

const posts = new Map(); // id -> post (latest known state)
const remember = (list) => list.forEach((p) => posts.set(p.id, p));
let observer = null;

function setupPlayback(container) {
  observer?.disconnect();
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const story = e.target, v = story.querySelector('video');
      if (e.isIntersecting && e.intersectionRatio >= 0.6) {
        if (v) {
          if (!v.src && v.dataset.src) v.src = v.dataset.src;
          v.muted = state.muted;
          v.play().catch(() => story.classList.add('paused'));
        } else scheduleView(story.dataset.post, 2000);
        // preload next video
        const next = story.nextElementSibling?.querySelector('video');
        if (next && !next.src && next.dataset.src) { next.preload = 'auto'; next.src = next.dataset.src; }
        if (!story.nextElementSibling && container.dataset.more) loadMore(container);
      } else if (v && !v.paused) v.pause();
    }
  }, { threshold: [0, 0.6, 1], root: container });
  $$('.story', container).forEach((s) => observe(s));
}
function observe(s) {
  observer.observe(s);
  const v = s.querySelector('video');
  if (v) {
    v.addEventListener('timeupdate', () => { if (v.currentTime > 2) scheduleView(s.dataset.post, 0); });
    v.addEventListener('play', () => s.classList.remove('paused'));
    v.addEventListener('pause', () => s.classList.add('paused'));
  }
}
const viewed = new Set();
function scheduleView(id, delay) {
  if (viewed.has(id)) return; viewed.add(id);
  setTimeout(() => api.post(`/api/posts/${id}/view`).catch(() => viewed.delete(id)), delay);
}

async function loadMore(container) {
  if (container.dataset.loading) return;
  container.dataset.loading = '1';
  try {
    const r = await api.get(`/api/feed?mode=${state.feedMode}&cursor=${container.dataset.more}`);
    remember(r.items);
    container.dataset.more = r.nextCursor ?? '';
    const frag = document.createElement('div');
    frag.innerHTML = r.items.map((p) => storyHTML(p)).join('');
    for (const s of [...frag.children]) { container.appendChild(s); observe(s); }
  } finally { delete container.dataset.loading; }
}

screens.home = async (el) => {
  el.innerHTML = '<div class="feed" id="feed" aria-label="Video feed"></div>';
  const feed = $('#feed');
  const r = await api.get(`/api/feed?mode=${state.feedMode}`);
  remember(r.items);
  if (!r.items.length) {
    feed.innerHTML = `<section class="story"><div class="feedtop"><button class="${state.feedMode === 'following' ? 'sel' : ''}" data-act="feedMode" data-mode="following">Following</button><button class="${state.feedMode === 'foryou' ? 'sel' : ''}" data-act="feedMode" data-mode="foryou">For You</button></div>
      <div class="empty" style="padding-top:140px">${state.feedMode === 'following' ? 'Posts from people you follow appear here. Follow creators from For You or Search.' : 'No posts yet. Be the first to share something.'}<p><button class="button" data-go="create">Create a post</button></p></div></section>`;
    return;
  }
  feed.dataset.more = r.nextCursor ?? '';
  feed.innerHTML = r.items.map((p) => storyHTML(p)).join('');
  setupPlayback(feed);
  attachGestures(feed);
  onLeave(() => { observer?.disconnect(); $$('video', feed).forEach((v) => { v.pause(); v.removeAttribute('src'); v.load(); }); });
};

screens.p = async (el, id) => {
  const p = await api.get('/api/posts/' + id);
  remember([p]);
  el.innerHTML = `<div class="feed" id="feed">${storyHTML(p, { withTabs: false })}</div>`;
  $('#feed .storybody').insertAdjacentHTML('beforebegin', '<button class="button secondary small" style="position:absolute;top:12px;left:12px;z-index:3" data-act="back">← Back</button>');
  setupPlayback($('#feed')); attachGestures($('#feed'));
  onLeave(() => { observer?.disconnect(); $$('video', el).forEach((v) => v.pause()); });
};
actions.back = () => history.length > 1 ? history.back() : go('home');

function attachGestures(feed) {
  let lastTap = 0, tapTimer = null;
  feed.addEventListener('click', (ev) => {
    if (ev.target.closest('button,a,input')) return;
    const story = ev.target.closest('.story'); if (!story) return;
    const t = Date.now();
    if (t - lastTap < 300) { // double tap = like
      clearTimeout(tapTimer); lastTap = 0;
      const p = posts.get(story.dataset.post);
      if (p && !p.liked) actions.like(story.querySelector('[data-act=like]'));
      story.insertAdjacentHTML('beforeend', '<div class="heartpop" aria-hidden="true">♥</div>');
      setTimeout(() => story.querySelector('.heartpop')?.remove(), 800);
      return;
    }
    lastTap = t;
    tapTimer = setTimeout(() => { const v = story.querySelector('video'); if (v) v.paused ? v.play().catch(() => {}) : v.pause(); }, 280);
  });
  feed.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); feed.scrollBy({ top: (ev.key === 'ArrowDown' ? 1 : -1) * feed.clientHeight, behavior: 'smooth' }); }
  });
  feed.tabIndex = 0;
}

const storyOf = (el) => el.closest('.story');
const postOf = (el) => posts.get(storyOf(el)?.dataset.post || el.dataset.post);

function refreshStory(p) {
  posts.set(p.id, p);
  for (const s of $$(`.story[data-post="${p.id}"]`)) {
    const like = s.querySelector('[data-act=like]');
    like.classList.toggle('on', p.liked); like.setAttribute('aria-pressed', p.liked);
    like.querySelector('.symbol').textContent = p.liked ? '♥' : '♡'; like.querySelector('.n').textContent = count(p.likes);
    const save = s.querySelector('[data-act=save]');
    save.classList.toggle('saved', p.saved); save.querySelector('.symbol').textContent = p.saved ? '◆' : '◇';
    s.querySelector('[data-act=comments] .n').textContent = count(p.comments);
  }
}

actions.feedMode = (b) => { state.feedMode = b.dataset.mode; route(); };
actions.toggleMute = () => {
  state.muted = !state.muted;
  $$('.story video').forEach((v) => { v.muted = state.muted; });
  $$('.mute').forEach((b) => { b.textContent = state.muted ? '🔇' : '🔊'; b.setAttribute('aria-label', state.muted ? 'Unmute' : 'Mute'); });
};
actions.like = async (b) => {
  const p = postOf(b);
  const r = p.liked ? await api.del(`/api/posts/${p.id}/like`) : await api.post(`/api/posts/${p.id}/like`);
  refreshStory(r);
};
actions.save = async (b) => {
  const p = postOf(b);
  const r = p.saved ? await api.del(`/api/posts/${p.id}/save`) : await api.post(`/api/posts/${p.id}/save`);
  refreshStory(r); toast(r.saved ? 'Saved to your collection' : 'Removed from saved');
};
actions.follow = async (b) => {
  const uid = b.dataset.user;
  const following = b.getAttribute('aria-pressed') === 'true';
  const u = following ? await api.del(`/api/users/${uid}/follow`) : await api.post(`/api/users/${uid}/follow`);
  $$(`[data-act=follow][data-user="${uid}"]`).forEach((x) => { x.setAttribute('aria-pressed', u.isFollowing); x.textContent = u.isFollowing ? 'Following' : '+ Follow'; });
  $$(`.followers-count[data-user="${uid}"]`).forEach((x) => { x.textContent = count(u.followers); });
  for (const p of posts.values()) if (p.author.id === uid) p.author.isFollowing = u.isFollowing;
  toast(u.isFollowing ? `Following @${u.handle}` : `Unfollowed @${u.handle}`);
};
actions.share = async (b) => {
  const p = postOf(b);
  const data = { title: 'Mäka', text: `@${p.author.handle} on Mäka`, url: p.shareUrl };
  if (navigator.share) { try { await navigator.share(data); return; } catch { /* cancelled */ } }
  try { await navigator.clipboard.writeText(p.shareUrl); toast('Link copied'); }
  catch { sheet('Share', `<p>Copy this link:</p><input class="field" readonly value="${attr(p.shareUrl)}">`); }
};

// ---- comments ----
async function renderComments(pid) {
  const r = await api.get(`/api/posts/${pid}/comments`);
  const list = r.comments.length ? r.comments.map((c) => `<div class="comment" data-comment="${c.id}">${avatar(c.author, 30)}<div class="grow">
      <div class="row between"><span class="who">@${esc(c.author.handle)} <span class="subtle">· ${ago(c.createdAt)}</span></span>
      <span>${c.canDelete ? `<button class="button secondary small" data-act="delComment" data-id="${c.id}" data-post="${pid}">Delete</button>` : ''}
      ${!c.mine ? `<button class="button secondary small" data-act="reportComment" data-id="${c.id}" aria-label="Report comment">⚑</button>` : ''}</span></div>
      <p>${esc(c.body)}</p>${c.status === 'held' ? '<span class="tag">Held for review · only you can see this</span>' : ''}</div></div>`).join('') : '<p class="subtle">No comments yet. Start a kind conversation.</p>';
  setSheetBody(`<div class="banner">Respectful discussion only. Constructive criticism is welcome; harassment, racism, threats and ridicule are not.</div>
    <div id="commentList">${list}</div>
    ${r.allowComments ? `<form data-form="comment" data-post="${pid}"><label class="formlabel" for="commentText">Add a comment</label>
      <textarea id="commentText" name="body" class="field" required maxlength="500" rows="2" placeholder="Add a respectful comment…"></textarea>
      <div style="margin-top:10px"><button type="submit" class="button">Post comment</button></div></form>` : '<p class="subtle">The creator has turned off comments.</p>'}`);
}
actions.comments = async (b) => { const p = postOf(b); sheet('Comments', '<p class="subtle">Loading…</p>'); await renderComments(p.id); };
forms.comment = async (f) => {
  const pid = f.dataset.post;
  await busy(f.querySelector('button'), async () => {
    const r = await api.post(`/api/posts/${pid}/comments`, formData(f));
    if (r.held) toast(r.message, true); else toast('Comment posted');
    await renderComments(pid);
    refreshStory(await api.get('/api/posts/' + pid));
  });
};
actions.delComment = async (b) => { await api.del('/api/comments/' + b.dataset.id); await renderComments(b.dataset.post); refreshStory(await api.get('/api/posts/' + b.dataset.post)); };
actions.reportComment = (b) => openReport('comment', b.dataset.id);

// ---- more / report / block ----
let reasonsCache = null;
export async function openReport(targetType, targetId, label = 'Report') {
  reasonsCache ??= await api.get('/api/reports/reasons');
  sheet(label, `<p>Reports are reviewed by trained people. The person won’t be told who reported them.</p>
    <form data-form="report" data-type="${targetType}" data-id="${attr(targetId)}">
    ${Object.entries(reasonsCache).map(([k, v], i) => `<label class="check"><input type="radio" name="reason" value="${k}" ${i === 0 ? 'checked' : ''}> ${esc(v)}</label>`).join('')}
    <label class="formlabel" for="rdetails">Details (optional)</label><textarea id="rdetails" class="field" name="details" rows="2" maxlength="1000"></textarea>
    <label class="check"><input type="checkbox" name="alsoBlock"> Also block this person</label>
    <button class="button block" type="submit">Submit report</button></form>`);
}
forms.report = async (f) => {
  const b = formData(f);
  const r = await api.post('/api/reports', { targetType: f.dataset.type, targetId: f.dataset.id, reason: b.reason, details: b.details, alsoBlock: b.alsoBlock });
  closeSheet(); toast(r.blocked ? 'Reported and blocked' : 'Thanks, we’ll take a look');
  if (r.blocked && $('#feed')) route();
};
actions.more = async (b) => {
  const p = postOf(b);
  const mine = p.author.id === state.me.id;
  const remix = await api.get(`/api/posts/${p.id}/remix-permission`);
  sheet(mine ? 'Your post' : 'Options', `<div class="stack">
    ${mine ? `<button class="button secondary block" data-act="editPost" data-post="${p.id}">Edit caption & permissions</button><button class="button danger block" data-act="deletePost" data-post="${p.id}">Delete post</button>`
      : `<button class="button secondary block" data-act="notInterested" data-post="${p.id}">Not interested</button>
      <button class="button secondary block" data-act="reportPost" data-post="${p.id}">⚑ Report post</button>
      <button class="button secondary block" data-act="muteUser" data-user="${p.author.id}">Mute @${esc(p.author.handle)}</button>
      <button class="button danger block" data-act="blockUser" data-user="${p.author.id}" data-handle="${attr(p.author.handle)}">Block @${esc(p.author.handle)}</button>`}
    <p class="subtle">Stitch/remix: ${remix.allowed ? 'allowed for you' : 'not allowed'} (creator setting: ${esc(remix.policy)}). ${esc(remix.note)}</p></div>`);
};
actions.reportPost = (b) => openReport('post', b.dataset.post, 'Report post');
actions.notInterested = async (b) => { await api.post(`/api/posts/${b.dataset.post}/not-interested`); closeSheet(); toast('We’ll show you less like this'); };
actions.muteUser = async (b) => { await api.post(`/api/users/${b.dataset.user}/mute`); closeSheet(); toast('Muted. You won’t see their posts or comments.'); };
actions.blockUser = async (b) => {
  if (!confirm(`Block @${b.dataset.handle}? They won’t be able to see your posts, comment, follow or message you.`)) return;
  await api.post(`/api/users/${b.dataset.user}/block`); closeSheet(); toast(`Blocked @${b.dataset.handle}`); route();
};
actions.unblockUser = async (b) => { await api.del(`/api/users/${b.dataset.user}/block`); toast('Unblocked'); route(); };
actions.unmuteUser = async (b) => { await api.del(`/api/users/${b.dataset.user}/mute`); toast('Unmuted'); route(); };
actions.deletePost = async (b) => { if (!confirm('Delete this post?')) return; await api.del('/api/posts/' + b.dataset.post); closeSheet(); toast('Post deleted'); route(); };
actions.editPost = (b) => {
  const p = posts.get(b.dataset.post);
  sheet('Edit post', `<form data-form="editPost" data-post="${p.id}"><label class="formlabel" for="ecap">Caption</label><textarea id="ecap" class="field" name="caption" rows="3" maxlength="2200">${esc(p.caption)}</textarea>
    <label class="check"><input type="checkbox" name="allowComments" ${p.allowComments ? 'checked' : ''}> Allow comments</label>
    <label class="formlabel" for="eremix">Who can stitch/remix</label><select id="eremix" class="field" name="remixPolicy">${['everyone', 'followers', 'nobody'].map((x) => `<option ${p.remixPolicy === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <div style="margin-top:12px"><button class="button" type="submit">Save</button></div></form>`);
};
forms.editPost = async (f) => { const r = await api.patch('/api/posts/' + f.dataset.post, formData(f)); posts.set(r.id, r); closeSheet(); toast('Post updated'); route(); };

// ======================= profiles =======================
function grid(list, own) {
  if (!list.length) return `<div class="card p" style="text-align:center"><p class="subtle">${own ? 'Your posts will appear here.' : 'No posts yet.'}</p>${own ? '<button class="button" data-go="create">Create your first post</button>' : ''}</div>`;
  return `<div class="grid3">${list.map((p) => `<button class="thumb" data-go="p/${p.id}" style="background-image:url('${attr(p.posterUrl || '')}')" aria-label="Open post: ${attr(p.caption.slice(0, 60))}">
    ${p.status !== 'published' ? `<span class="badge">${esc(p.status)}</span>` : ''}<span>▶ ${count(p.views)}</span></button>`).join('')}</div>`;
}
async function renderProfile(el, key) {
  const r = await api.get('/api/users/' + encodeURIComponent(key));
  const u = r.user; const own = u.id === state.me.id;
  remember(r.posts);
  el.innerHTML = `<div class="pagehead"><div class="profilehead">${avatar(u)}<div class="grow"><h1 style="font-size:21px;margin:0">${esc(u.displayName)}</h1>
    <p class="subtle" style="margin:2px 0">@${esc(u.handle)}${u.isSample ? ' · <span class="tag grey">Sample account</span>' : ''}${r.banned ? ' · <span class="tag red">Account removed</span>' : ''}</p>
    ${own ? `<span class="badge">✓ 19+ verified</span>` : u.followsYou ? '<span class="tag grey">Follows you</span>' : ''}</div></div>
    ${u.bio ? `<p>${esc(u.bio)}</p>` : ''}</div>
    <div class="pad"><div class="metrics"><div class="metric"><strong>${count(u.posts)}</strong><span>Posts</span></div>
      <div class="metric"><strong class="followers-count" data-user="${u.id}">${count(u.followers)}</strong><span>Followers</span></div>
      <div class="metric"><strong>${count(u.following)}</strong><span>Following</span></div></div>
    <p class="subtle" style="margin:8px 0 0">Follower counts are public, but never decide earnings, collaborations or who gets recommended.</p>
    <div class="row wrap" style="margin-top:14px">${own
      ? `<button class="button secondary" data-act="editProfile">Edit profile</button><button class="button secondary" data-go="studio">Creator Studio</button><button class="button secondary" data-go="settings">Settings & safety</button>`
      : u.isBlocked ? `<button class="button secondary" data-act="unblockUser" data-user="${u.id}">Unblock</button>`
      : `<button class="button" data-act="follow" data-user="${u.id}" aria-pressed="${u.isFollowing}">${u.isFollowing ? 'Following' : '+ Follow'}</button>
         <button class="button secondary" data-act="messageUser" data-user="${u.id}">Message</button>
         <button class="button secondary" data-act="userMore" data-user="${u.id}" data-handle="${attr(u.handle)}" aria-label="More options">⋯</button>`}</div>
    <div class="section-title">${own ? 'Your content' : 'Posts'}</div>${u.isBlocked ? '<p class="subtle">You blocked this account.</p>' : grid(r.posts, own)}</div>`;
}
screens.profile = (el) => renderProfile(el, state.me.id);
screens.u = (el, handle) => renderProfile(el, handle);
actions.userMore = (b) => sheet('@' + b.dataset.handle, `<div class="stack">
  <button class="button secondary block" data-act="reportUser" data-user="${b.dataset.user}">⚑ Report account</button>
  <button class="button secondary block" data-act="muteUser" data-user="${b.dataset.user}">Mute</button>
  <button class="button danger block" data-act="blockUser" data-user="${b.dataset.user}" data-handle="${attr(b.dataset.handle)}">Block</button></div>`);
actions.reportUser = (b) => openReport('user', b.dataset.user, 'Report account');
actions.messageUser = async (b) => {
  const r = await api.post('/api/conversations', { memberIds: [b.dataset.user] });
  go('inbox/' + r.id);
};
actions.editProfile = () => {
  const m = state.me;
  sheet('Edit profile', `<form data-form="editProfile"><label class="formlabel" for="pname">Display name</label><input id="pname" class="field" name="displayName" maxlength="40" value="${attr(m.displayName)}">
    <label class="formlabel" for="pbio">Bio</label><textarea id="pbio" class="field" name="bio" maxlength="200" rows="3">${esc(m.bio)}</textarea>
    <label class="formlabel" for="pav">Profile photo</label><input id="pav" class="field" type="file" accept="image/*" name="avatar">
    <div class="progress hidden" id="avprog"><i></i></div>
    <div style="margin-top:12px"><button class="button" type="submit">Save profile</button></div></form>`);
};
forms.editProfile = async (f) => {
  await busy(f.querySelector('button'), async () => {
    const b = formData(f); const file = f.querySelector('#pav').files[0];
    if (file) {
      $('#avprog').classList.remove('hidden');
      const id = await api.upload(file, 'image', (x) => { $('#avprog i').style.width = (x * 100) + '%'; });
      const s = await api.waitForMedia(id);
      if (s.status !== 'ready') throw new Error(s.error || 'Photo could not be processed.');
      b.avatarMediaId = id;
    }
    state.me = await api.patch('/api/me', b); closeSheet(); toast('Profile saved'); route();
  });
};

// ======================= search & notifications =======================
screens.search = (el) => {
  el.innerHTML = `<div class="pagehead"><h1>Search</h1></div><div class="pad"><input class="search" id="q" placeholder="Creators, videos, films, businesses…" aria-label="Search Mäka" autofocus><div id="results"></div></div>`;
  let t;
  $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => runSearch(e.target.value), 250); });
};
async function runSearch(term) {
  const r = await api.get('/api/search?q=' + encodeURIComponent(term));
  const sec = (title, items) => items ? `<div class="section-title">${title}</div>${items}` : '';
  $('#results').innerHTML = [
    r.users.length && sec('People', r.users.map((u) => `<button class="listitem" data-go="u/${attr(u.handle)}">${avatar(u)}<div class="grow"><strong>${esc(u.displayName)}</strong><p>@${esc(u.handle)} · ${count(u.followers)} followers</p></div></button>`).join('')),
    r.posts.length && sec('Videos', r.posts.map((p) => `<button class="listitem" data-go="p/${p.id}"><div class="grow"><strong>@${esc(p.author.handle)}</strong><p>${esc(p.caption)}</p></div></button>`).join('')),
    r.titles.length && sec('Cinema', r.titles.map((t) => `<button class="listitem" data-act="openTitle" data-id="${t.id}"><div class="grow"><strong>${esc(t.name)}</strong><p>${esc(t.genres)}</p></div></button>`).join('')),
    r.businesses.length && sec('Market', r.businesses.map((b) => `<button class="listitem" data-go="market/${b.id}"><div class="grow"><strong>${esc(b.name)}</strong><p>${esc(b.category)}</p></div></button>`).join('')),
    r.campaigns.length && sec('Collabs', r.campaigns.map((c) => `<button class="listitem" data-act="openCampaign" data-id="${c.id}"><div class="grow"><strong>${esc(c.title)}</strong><p>${esc(c.category)}</p></div></button>`).join('')),
  ].filter(Boolean).join('') || (term.length > 1 ? '<p class="subtle">No results.</p>' : '');
}

// ======================= realtime =======================
let stopRealtime = null;
function updateDot() { const d = $('#inboxDot'); d.textContent = state.unread > 9 ? '9+' : state.unread; d.classList.toggle('hidden', !state.unread); }
export async function refreshUnread() {
  try {
    const [n, c] = await Promise.all([api.get('/api/notifications'), api.get('/api/conversations')]);
    state.unread = n.unread + c.reduce((a, x) => a + x.unread, 0); updateDot();
  } catch { /* offline */ }
}
function startRealtime() {
  stopRealtime?.();
  if (!state.me || state.me.ageStatus !== 'verified') return;
  refreshUnread();
  stopRealtime = api.connectEvents({
    message: (m) => { window.dispatchEvent(new CustomEvent('maka:message', { detail: m })); if (!location.hash.includes(m.conversationId)) { state.unread++; updateDot(); toast(`New message from @${m.sender}`); } },
    notification: (n) => { state.unread++; updateDot(); toast(n.text); },
    post_status: (s) => toast(s.status === 'published' ? 'Your post is live 🎉' : 'Your upload could not be processed: ' + (s.error || '')),
  });
}

// ======================= boot =======================
async function boot() {
  if (api.token) {
    try { state.me = await api.get('/api/me'); startRealtime(); }
    catch (e) { if (e.status === 401 || e.status === 403) api.token = null; }
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => toast('Back online'));
  window.addEventListener('offline', () => toast('You’re offline. We’ll reconnect automatically.', true));
  route();
}
boot();
export { storyHTML, remember, posts, errorToast };
