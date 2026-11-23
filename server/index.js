import { config, assertProductionSafe } from './config.js';
import { createApp } from './app.js';
import { seed } from './seed.js';

assertProductionSafe();
const app = createApp();
if (config.seedSamples && config.env !== 'production') {
  const r = await seed(app, { adminPassword: process.env.SEED_ADMIN_PASSWORD });
  if (!r.skipped) console.log(`Seeded sample data. Dev moderator: ${r.admin} / ${process.env.SEED_ADMIN_PASSWORD || 'dev-admin-password'}`);
}
app.server.listen(config.port, () => {
  console.log(`Mäka API + app on ${config.publicOrigin} (${config.env})`);
  if (config.ageProvider === 'test') console.log('⚠ Age verification is the TEST SIMULATOR. Not usable in production.');
});
