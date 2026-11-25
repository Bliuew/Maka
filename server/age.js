// 19+ age assurance. Users pick ONE suitable method; we keep only the outcome
// (verified over-19 token + a keyed hash of the provider's person reference
// for ban-evasion checks). We never receive or store ID images or selfies.
import crypto from 'node:crypto';
import { config } from './config.js';

export const AGE_METHODS = [
  { id: 'government_id', label: 'Government photo ID', note: 'Scan a passport, driver’s licence or national ID.' },
  { id: 'id_selfie', label: 'ID + live selfie', note: 'Adds a liveness check when the ID alone is not enough.' },
  { id: 'digital_credential', label: 'Digital ID credential', note: 'Use a validated digital ID wallet where available.' },
  { id: 'bank', label: 'Bank-linked age confirmation', note: 'Your bank confirms you are over 19. Supported in some countries.' },
  { id: 'manual_review', label: 'Manual review', note: 'Fallback when other methods do not work for you.' },
];

export function personRefHash(ref) {
  return crypto.createHmac('sha256', config.secret).update('person:' + ref).digest('hex');
}

// --- Provider interface ---------------------------------------------------
// methods                  -> ids from AGE_METHODS this provider supports
// start(check)             -> { redirectUrl, providerRef }   the provider's hosted flow
// parseWebhook(raw, headers)-> { checkId, providerRef, outcome: 'verified'|'under_age'|'failed'|'review', personRef } | null
//                             (throws on a bad signature)
// Built: Veriff (AGE_PROVIDER=veriff, AGE_PROVIDER_API_KEY, AGE_PROVIDER_SECRET).

// Whole years between a YYYY-MM-DD birth date and today (UTC). Used once, never stored.
export function ageOn(dob, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ''));
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = today.getUTCFullYear() - y;
  if (today.getUTCMonth() + 1 < mo || (today.getUTCMonth() + 1 === mo && today.getUTCDate() < d)) age--;
  return age;
}

export function createVeriff(env = process.env, minimumAge = config.minimumAge) {
  const key = env.AGE_PROVIDER_API_KEY, secret = env.AGE_PROVIDER_SECRET;
  const base = env.AGE_PROVIDER_API_BASE || 'https://stationapi.veriff.com';
  const sign = (buf) => crypto.createHmac('sha256', secret || '').update(buf).digest('hex');
  return {
    name: 'veriff',
    isTest: false,
    methods: ['government_id', 'id_selfie'],
    async start(check) {
      const body = JSON.stringify({ verification: { callback: `${config.publicOrigin}/age-done.html`, vendorData: check.id } });
      const res = await fetch(`${base}/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-auth-client': key, 'x-hmac-signature': sign(body) }, body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.verification?.url) throw Object.assign(new Error('The age-check service is unavailable. Try again in a few minutes.'), { code: 'age_provider_error' });
      return { redirectUrl: data.verification.url, providerRef: data.verification.id };
    },
    // Decision webhook: X-HMAC-SIGNATURE is the hex HMAC-SHA256 of the raw body.
    parseWebhook(raw, headers) {
      if (!secret) throw Object.assign(new Error('not configured'), { code: 'age_provider_not_configured', status: 503 });
      const got = String(headers['x-hmac-signature'] || '').toLowerCase(), expected = sign(raw);
      if (got.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected))) throw Object.assign(new Error('invalid signature'), { code: 'invalid_signature', status: 401 });
      const ev = JSON.parse(raw.toString('utf8'));
      const v = ev.verification;
      if (!v?.vendorData) return null; // not a decision (e.g. an event webhook)
      const doc = v.document || {}, person = v.person || {};
      const personRef = doc.number ? `veriff-doc:${doc.country || ''}:${doc.type || ''}:${doc.number}` : person.idNumber ? `veriff-id:${person.idNumber}` : null;
      let outcome;
      if (v.status === 'approved') {
        const age = ageOn(person.dateOfBirth);
        outcome = age === null ? 'review' : age >= minimumAge ? 'verified' : 'under_age';
      } else if (v.status === 'review') outcome = 'review';
      else outcome = 'failed'; // declined, resubmission_requested, expired, abandoned
      return { checkId: v.vendorData, providerRef: v.id, outcome, personRef };
    },
  };
}

const testProvider = {
  name: 'test-simulator',
  isTest: true,
  start(check) {
    return { redirectUrl: `/#/age-test/${check.id}` };
  },
};

const unconfigured = {
  name: 'unconfigured',
  isTest: false,
  start() {
    const e = new Error('No age-assurance provider is configured. Set AGE_PROVIDER and AGE_PROVIDER_API_KEY.');
    e.code = 'age_provider_not_configured';
    throw e;
  },
};

let veriff = null;
let override = null;
export function setAgeProvider(p) { override = p; } // tests

export function getProvider() {
  if (override) return override;
  if (config.ageProvider === 'test') {
    if (config.env === 'production') return unconfigured;
    return testProvider;
  }
  if (config.ageProvider === 'veriff' && config.ageProviderKey) return veriff || (veriff = createVeriff());
  return unconfigured;
}
