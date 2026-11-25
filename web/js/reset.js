// Password reset page. The token stays in the URL fragment-free query only long enough to read it.
(() => {
  const token = new URLSearchParams(location.search).get('token') || '';
  history.replaceState(null, '', location.pathname);
  const f = document.getElementById('f'), msg = document.getElementById('msg'), go = document.getElementById('go');
  const say = (t) => { msg.textContent = t; msg.hidden = false; };
  if (!token) { say('This link is incomplete. Ask for a new one from the sign-in screen.'); go.disabled = true; }
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = document.getElementById('pw').value, pw2 = document.getElementById('pw2').value;
    if (pw !== pw2) return say('The passwords don’t match.');
    go.disabled = true;
    try {
      const r = await fetch('/api/auth/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password: pw }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { say(d.message || 'Something went wrong. Try again.'); go.disabled = d.error === 'reset_invalid'; return; }
      f.querySelectorAll('input,label').forEach((n) => n.remove()); go.remove();
      say('Your password has been changed. Open Mäka and sign in with your new password.');
    } catch { say('Couldn’t reach Mäka. Check your connection and try again.'); go.disabled = false; }
  });
})();
