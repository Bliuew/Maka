// Transactional email (password resets). Off until a provider and key exist.
// MAIL_PROVIDER=resend|postmark, MAIL_API_KEY, MAIL_FROM="Mäka <no-reply@your-domain>".
// Outside production, with no provider, emails are kept in an in-memory outbox and
// logged so developers can follow links; production refuses to start without one.
const PROVIDERS = {
  async resend({ key, base, from }, m) {
    return post(`${base || 'https://api.resend.com'}/emails`, { authorization: `Bearer ${key}` },
      { from, to: [m.to], subject: m.subject, text: m.text, html: m.html });
  },
  async postmark({ key, base, from }, m) {
    return post(`${base || 'https://api.postmarkapp.com'}/email`, { 'x-postmark-server-token': key, accept: 'application/json' },
      { From: from, To: m.to, Subject: m.subject, TextBody: m.text, HtmlBody: m.html, MessageStream: 'outbound' });
  },
};

async function post(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  if (!res.ok) throw Object.assign(new Error(`mail provider responded ${res.status}`), { code: 'mail_failed' });
}

export function createMailer(env = process.env) {
  const provider = env.MAIL_PROVIDER || null;
  const opts = { key: env.MAIL_API_KEY, base: env.MAIL_API_BASE, from: env.MAIL_FROM || 'Mäka <no-reply@localhost>' };
  const outbox = [];
  return {
    provider,
    outbox,
    async send(m) {
      if (!provider) {
        if ((env.NODE_ENV || 'development') === 'production') throw Object.assign(new Error('Email is not configured.'), { code: 'mail_not_configured' });
        outbox.push(m); if (outbox.length > 50) outbox.shift();
        if (env.NODE_ENV !== 'test') console.log(`✉ (not sent: no MAIL_PROVIDER) to ${m.to}: ${m.subject}\n${m.text}`);
        return;
      }
      const fn = PROVIDERS[provider];
      if (!fn) throw Object.assign(new Error(`No mail adapter for "${provider}".`), { code: 'mail_adapter_missing' });
      await fn(opts, m);
    },
  };
}
