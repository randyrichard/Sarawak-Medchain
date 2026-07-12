import { config } from './config.js';
import { createApp } from './app.js';
import { seedDemo } from './lib/seedDemo.js';

if (process.env.SEED_DEMO === 'true') {
  // Idempotent — safe on every boot; used on platforms without shell access
  await seedDemo().catch((e) => console.error('[seed] failed:', e));
}

const app = createApp();
app.listen(config.port, () => {
  console.log(
    `[emc-api] listening on :${config.port} (chain anchoring: ${
      config.chain.enabled ? 'ENABLED' : 'disabled'
    })`
  );
});
