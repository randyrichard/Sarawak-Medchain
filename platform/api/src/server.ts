import { config } from './config.js';
import { createApp } from './app.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(
    `[emc-api] listening on :${config.port} (chain anchoring: ${
      config.chain.enabled ? 'ENABLED' : 'disabled'
    })`
  );
});
