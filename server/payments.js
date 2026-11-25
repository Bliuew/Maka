// Payments through Stripe (Connect + hosted Checkout). Off until keys exist.
// PAYMENTS_PROVIDER=stripe, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
// Card details are entered on Stripe's pages and never reach Mäka servers.
// Each business is paid directly into its own Stripe account (destination charges);
// Mäka keeps PLATFORM_FEE_BPS (basis points, default 0) of each order.
import crypto from 'node:crypto';

function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); // arrays become [0],[1]...
    else out.append(key, String(v));
  }
  return out;
}

export function createPayments(env = process.env) {
  const provider = env.PAYMENTS_PROVIDER || null;
  if (!provider) return null;
  if (provider !== 'stripe') return { provider, missing: true };
  const key = env.STRIPE_SECRET_KEY, webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const base = env.STRIPE_API_BASE || 'https://api.stripe.com';
  async function stripe(method, path, params, idempotencyKey) {
    const headers = { authorization: `Bearer ${key}`, 'stripe-version': '2024-06-20' };
    let body;
    if (params) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = form(params).toString(); }
    if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
    const res = await fetch(base + path, { method, headers, body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error?.message || `Stripe responded ${res.status}`), { code: 'payment_provider_error', status: 502 });
    return data;
  }
  return {
    provider,
    feeBps: Math.max(0, Math.min(5000, Number(env.PLATFORM_FEE_BPS || 0) | 0)),
    shipCountries: String(env.SHIP_COUNTRIES || 'CA,US').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
    automaticTax: env.STRIPE_AUTOMATIC_TAX === '1',
    createAccount: ({ email, businessId, country }) => stripe('POST', '/v1/accounts', {
      type: 'express', email, country: country || undefined, metadata: { business_id: businessId },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    }, 'acct-' + businessId),
    accountLink: ({ account, refreshUrl, returnUrl }) => stripe('POST', '/v1/account_links', { account, refresh_url: refreshUrl, return_url: returnUrl, type: 'account_onboarding' }),
    refund: (paymentIntent) => stripe('POST', '/v1/refunds', { payment_intent: paymentIntent, reverse_transfer: true, refund_application_fee: true }, 'rf-' + paymentIntent),
    getAccount: (id) => stripe('GET', `/v1/accounts/${encodeURIComponent(id)}`),
    createCheckout: (p) => stripe('POST', '/v1/checkout/sessions', p, 'cs-' + p.client_reference_id),
    expireCheckout: (id) => stripe('POST', `/v1/checkout/sessions/${encodeURIComponent(id)}/expire`).catch((e) => {
      // Already completed or expired: the webhook decides the final state.
      if (!/expire|complete/i.test(e.message)) throw e;
    }),
    // Stripe-Signature: t=<unix>,v1=<hex hmac-sha256 of "t.payload">. Rejects stale or forged events.
    verifyWebhook(raw, header, toleranceSec = 300) {
      if (!webhookSecret) throw Object.assign(new Error('Webhook secret is not set.'), { code: 'webhook_not_configured', status: 503 });
      const parts = Object.fromEntries(String(header || '').split(',').map((kv) => kv.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim()]).filter(([k]) => k !== 'v1'));
      const sigs = String(header || '').split(',').map((kv) => kv.trim()).filter((kv) => kv.startsWith('v1=')).map((kv) => kv.slice(3));
      const t = Number(parts.t);
      if (!t || !sigs.length) return null;
      if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return null;
      const expected = crypto.createHmac('sha256', webhookSecret).update(`${t}.${raw.toString('utf8')}`).digest('hex');
      const ok = sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
      return ok ? JSON.parse(raw.toString('utf8')) : null;
    },
  };
}
