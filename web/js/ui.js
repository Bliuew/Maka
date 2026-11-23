export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const attr = esc;
export const money = (c, cur = 'CAD') => new Intl.NumberFormat('en-CA', { style: 'currency', currency: cur }).format((c || 0) / 100);
export const count = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n ?? 0);
export const ago = (t) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'now'; if (s < 3600) return Math.floor(s / 60) + 'm'; if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'd'; return new Date(t).toLocaleDateString();
};

export function avatar(u, size) {
  const st = size ? `width:${size}px;height:${size}px;` : '';
  if (u?.avatarUrl) return `<span class="avatar" style="${st}background-image:url('${attr(u.avatarUrl)}')" aria-hidden="true"></span>`;
  return `<span class="avatar" style="${st}" aria-hidden="true">${esc((u?.displayName || '?').trim()[0]?.toUpperCase() || '?')}</span>`;
}

let toastTimer;
export function toast(msg, isError) {
  const root = $('#toastroot');
  root.innerHTML = `<div class="toast ${isError ? 'err' : ''}">${esc(msg)}</div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { root.innerHTML = ''; }, isError ? 4500 : 2800);
}
export const errorToast = (e) => toast(e?.message || 'Something went wrong.', true);

let lastFocus = null;
export function sheet(title, html, { onClose } = {}) {
  lastFocus = document.activeElement;
  $('#modalroot').innerHTML = `<div class="shade" data-act="shade"><div class="sheet" role="dialog" aria-modal="true" aria-label="${attr(title)}">
    <button class="sheetClose" data-act="closeSheet" aria-label="Close">×</button><h2>${esc(title)}</h2><div class="sheetbody">${html}</div></div></div>`;
  sheet.onClose = onClose;
  setTimeout(() => ($('#modalroot .sheet [autofocus]') || $('#modalroot .sheetClose'))?.focus(), 30);
  return $('#modalroot .sheetbody');
}
export function setSheetBody(html) { const b = $('#modalroot .sheetbody'); if (b) b.innerHTML = html; return b; }
export function closeSheet() {
  if (!$('#modalroot').innerHTML) return;
  $('#modalroot').innerHTML = '';
  const fn = sheet.onClose; sheet.onClose = null; fn?.();
  lastFocus?.focus?.();
}
export const sheetOpen = () => !!$('#modalroot').innerHTML;

export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.type !== 'file') o[el.name] = el.value;
  }
  return o;
}

export async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = '…'; }
  try { return await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = btn.dataset.label; } }
}
