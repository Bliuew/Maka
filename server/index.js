import { execFileSync } from 'node:child_process';
import { config, assertProductionSafe } from './config.js';

// Preflight: clear messages instead of cryptic crashes on a new host.
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 5)) { console.error(`Mäka needs Node.js 22.5 or newer (this is ${process.versions.node}).`); process.exit(1); }
for (const bin of ['ffmpeg', 'ffprobe']) {
  try { execFileSync(bin, ['-version'], { stdio: 'ignore' }); }
  catch { console.error(`Mäka needs ${bin} installed (video processing). On Replit it comes from replit.nix.`); process.exit(1); }
}
import { createApp } from './app.js';
import { seed } from './seed.js';

assertProductionSafe();
const app = createApp();
// Listen first so hosting health checks (e.g. Replit's 5-second check) pass,
// then load development sample data in the background.
app.server.listen(config.port, '0.0.0.0', () => {
  console.log(`Mäka API + app on ${config.publicOrigin} (${config.env})`);
  if (config.ageProvider === 'test') console.log('⚠ Age verification is the TEST SIMULATOR. Not usable in production.');
  if (config.seedSamples && config.env !== 'production') {
    seed(app, { adminPassword: process.env.SEED_ADMIN_PASSWORD })
      .then((r) => { if (!r.skipped) console.log(`Seeded sample data. Moderator: ${r.admin} / ${process.env.SEED_ADMIN_PASSWORD ? '(SEED_ADMIN_PASSWORD)' : 'dev-admin-password'}`); })
      .catch((e) => console.error('Sample data seeding failed:', e.message));
  }
});
