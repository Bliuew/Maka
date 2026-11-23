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
// start(check)    -> { redirectUrl }   send user to the provider's hosted flow
// parseResult(req)-> { checkId, outcome: 'verified'|'under_age'|'failed'|'review', personRef }
// A real provider must be one that explicitly supports a 19+ threshold.

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

export function getProvider() {
  if (config.ageProvider === 'test') {
    if (config.env === 'production') return unconfigured;
    return testProvider;
  }
  // Real provider adapters (e.g. Yoti, Persona, Veriff, IDnow) plug in here
  // once credentials and a 19+ threshold contract are in place.
  return unconfigured;
}
