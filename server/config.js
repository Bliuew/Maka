// Mäka server configuration. Every external integration is OFF until real
// credentials are supplied; nothing silently pretends to be live.
import path from 'node:path';
import crypto from 'node:crypto';

const env = process.env;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

export const config = {
  root,
  env: env.NODE_ENV || 'development',
  port: Number(env.PORT || 8080),
  dataDir: path.resolve(env.MAKA_DATA_DIR || path.join(root, 'data')),
  publicOrigin: env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${env.PORT || 8080}`),
  // Signing secret for media URLs and webhooks. Must be set in production.
  secret: env.MAKA_SECRET || crypto.createHash('sha256').update('maka-dev-only-secret').digest('hex'),
  sessionDays: 30,
  minimumAge: 19, // founder decision: strictly 19+, worldwide, no exceptions

  // Age assurance. 'test' = clearly-labelled simulator, refused in production.
  ageProvider: env.AGE_PROVIDER || 'test',
  ageProviderKey: env.AGE_PROVIDER_API_KEY || null,

  // Payments (Stripe Connect or equivalent). Off until keys exist.
  paymentsProvider: env.PAYMENTS_PROVIDER || null,
  // Push notifications (APNs / FCM). Off until keys exist.
  pushProvider: env.PUSH_PROVIDER || null,
  // Automated media/text classifiers & malware scanning. Off until configured.
  mediaScanner: env.MEDIA_SCANNER || null,

  // Viewer territory for film rights. Production must derive this from a
  // trusted geo-IP service at the edge, not from the client.
  defaultTerritory: env.DEFAULT_TERRITORY || 'CA',

  uploads: {
    chunkSize: 1024 * 1024,
    maxVideoBytes: 500 * 1024 * 1024,
    maxImageBytes: 15 * 1024 * 1024,
    maxVideoSeconds: 600,
  },
  seedSamples: env.SEED_SAMPLES !== '0',
  // Private test servers: sign-up requires this invite code when set.
  inviteCode: env.INVITE_CODE || null,
};

export function assertProductionSafe() {
  if (config.env !== 'production') return;
  const problems = [];
  if (!process.env.MAKA_SECRET) problems.push('MAKA_SECRET is not set');
  if (config.ageProvider === 'test') problems.push('AGE_PROVIDER=test (simulator) cannot run in production');
  if (!config.ageProviderKey) problems.push('AGE_PROVIDER_API_KEY missing');
  if (config.seedSamples) problems.push('SEED_SAMPLES must be 0 in production');
  if (problems.length) {
    throw new Error('Refusing to start in production:\n - ' + problems.join('\n - '));
  }
}
