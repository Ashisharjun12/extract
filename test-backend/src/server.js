import './instrument.js';
import app from './app.js';
import connectDB from './config/db.js';
import { _config } from './config/config.js';
import { getPortalInfo } from './config/version.js';

async function start() {
  await connectDB();

  app.listen(_config.PORT, () => {
    console.log(`\ntest-backend v${getPortalInfo().version} on http://localhost:${_config.PORT}`);
    console.log(`  Health           : GET  http://localhost:${_config.PORT}/health`);
    console.log(`  Admin (proxy)    : GET  http://localhost:${_config.PORT}/api/v1/admin/health`);
    console.log(`  Auth             : POST http://localhost:${_config.PORT}/api/v1/auth/login`);
    console.log(`  Extractions      : DEL  http://localhost:${_config.PORT}/api/v1/extractions/:id`);
    console.log(`  aimodule target  : ${_config.AIMODULE_URL}\n`);
  });
}

start().catch((err) => {
  console.error('[startup] Failed:', err);
  process.exit(1);
});
