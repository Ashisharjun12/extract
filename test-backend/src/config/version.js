export const PORTAL_VERSION = '2.0.0';

export const PORTAL_FEATURES = [
  'auth-token',
  'upload-r2',
  'extractions',
  'admin-proxy',
  'webhook',
];

export function getPortalInfo() {
  return {
    name: 'test-backend',
    version: PORTAL_VERSION,
    features: PORTAL_FEATURES,
    authRoute: '/api/v1/auth/login',
  };
}
