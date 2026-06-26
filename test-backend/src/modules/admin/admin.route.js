import { Router } from 'express';
import proxy from 'express-http-proxy';
import { _config } from '../../config/config.js';
import { ApiError } from '../../shared/apiError.js';

const router = Router();

function validateAdminKey(req, _res, next) {
  const key = req.headers['x-admin-api-key'];
  if (!_config.AIMODULE_ADMIN_API_KEY) {
    return next(ApiError.badRequest('Admin API not configured on this server.'));
  }
  if (!key || key !== _config.AIMODULE_ADMIN_API_KEY) {
    return next(ApiError.unauthorized('Invalid or missing x-admin-api-key.'));
  }
  next();
}

router.get(
  '/health',
  proxy(_config.AIMODULE_URL, {
    proxyReqPathResolver: () => '/health',
  }),
);

router.use(
  validateAdminKey,
  proxy(_config.AIMODULE_URL, {
    proxyReqPathResolver: (req) => `/api/v1/admin${req.url}`,
    proxyReqOptDecorator: (opts) => {
      opts.headers['x-admin-api-key'] = _config.AIMODULE_ADMIN_API_KEY;
      return opts;
    },
  }),
);

export default router;
