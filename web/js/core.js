// Shared app state, router and event delegation.
import { api } from './api.js';
import { $, closeSheet, errorToast } from './ui.js';

export const state = { me: null, muted: true, unread: 0, cart: {}, feedMode: 'foryou' };
export const actions = {};
export const forms = {};
export const screens = {};

export function go(path) {
  const h = '#/' + path.replace(/^#?\//, '');
  if (location.hash === h) route(); else location.hash = h;
}

const TABS = [['home', 'Home', '⌂'], ['cinema', 'Cinema', '▣'], ['create', 'Create', '✚'], ['collabs', 'Collabs', '♡'], ['market', 'Market', '▤']];
const SIDE = [...TABS, ['inbox', 'Inbox', '✉'], ['profile', 'Profile', '◉'], ['studio', 'Studio', '▥']];

function navHTML(current) {
  const admin = state.me?.role === 'admin' ? [['admin', 'Trust & Safety', '⚖']] : [];
  $('#side-links').innerHTML = [...SIDE, ...admin].map(([k, l, i]) => `<button class="navBtn ${current === k ? 'active' : ''}" data-go="${k}"><span class="nav-ic" aria-hidden="true">${i}</span>${l}</button>`).join('');
  $('#bottom').innerHTML = TABS.map(([k, l, i]) => `<button class="tab ${current === k ? 'active' : ''} ${k === 'create' ? 'create' : ''}" data-go="${k}" aria-label="${l}" ${current === k ? 'aria-current="page"' : ''}><span class="ti" aria-hidden="true">${i}</span><span>${l}</span></button>`).join('');
}

let cleanup = null;
export function onLeave(fn) { cleanup = fn; }

export async function route() {
  closeSheet();
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  const [name, ...args] = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const signedOut = !api.token;
  const needsAge = state.me && state.me.ageStatus !== 'verified';
  const publicScreens = ['welcome', 'signin', 'signup', 'forgot'];
  const ageScreens = ['verify', 'age-test'];
  let target = name;
  if (signedOut && !publicScreens.includes(name)) target = 'welcome';
  else if (!signedOut && needsAge && !ageScreens.includes(name)) target = 'verify';
  else if (!signedOut && !needsAge && [...publicScreens, ...ageScreens].includes(name)) target = 'home';
  if (target !== name) { history.replaceState(null, '', '#/' + target); }
  const fn = screens[target] || screens.home;
  const chrome = !publicScreens.includes(target) && !ageScreens.includes(target);
  $('#topbar').classList.toggle('hidden', !chrome);
  $('#bottom').classList.toggle('hidden', !chrome);
  document.querySelector('.sidebar').classList.toggle('hidden', !chrome);
  navHTML(target === 'u' || target === 'p' ? '' : target);
  const el = $('#screen');
  el.scrollTop = 0;
  try { await fn(el, ...(target === name ? args : [])); }
  catch (e) { el.innerHTML = `<div class="empty">Couldn’t load this screen.<br><span class="subtle">${e.message}</span><p><button class="button secondary" data-act="reload">Try again</button></p></div>`; }
  el.focus({ preventScroll: true });
}

actions.reload = () => route();

document.addEventListener('click', (ev) => {
  const g = ev.target.closest('[data-go]');
  if (g) { ev.preventDefault(); go(g.dataset.go); return; }
  const a = ev.target.closest('[data-act]');
  if (!a) return;
  const fn = actions[a.dataset.act];
  if (!fn) return;
  if (a.dataset.act === 'shade' && ev.target !== a) return;
  ev.preventDefault();
  Promise.resolve(fn(a, ev)).catch(errorToast);
});
document.addEventListener('submit', (ev) => {
  const f = ev.target.closest('form[data-form]');
  if (!f) return;
  ev.preventDefault();
  const fn = forms[f.dataset.form];
  if (fn) Promise.resolve(fn(f, ev)).catch(errorToast);
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeSheet(); });
actions.closeSheet = () => closeSheet();
actions.shade = () => closeSheet();
