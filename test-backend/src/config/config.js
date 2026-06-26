import { config } from 'dotenv';

config();

const {
  PORT,
  port,
  NODE_ENV,
  DATABASE_URI,
  JWT_SECRET,
  WEBHOOK_SECRET,
  AIMODULE_URL,
  AIMODULE_ADMIN_API_KEY,
  ADMIN_API_KEY,
  PORTAL_PASSWORD,
  SESSION_SECRET,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY,
  R2_SECRET_KEY,
  R2_PUBLIC_URL,
  R2_BUCKET,
} = process.env;

export const _config = {
  PORT: PORT ?? port ?? 3001,
  NODE_ENV: NODE_ENV ?? 'development',
  DATABASE_URI,
  JWT_SECRET,
  WEBHOOK_SECRET: WEBHOOK_SECRET ?? '',
  AIMODULE_URL: AIMODULE_URL ?? 'http://localhost:3000',
  AIMODULE_ADMIN_API_KEY: AIMODULE_ADMIN_API_KEY ?? ADMIN_API_KEY ?? '',
  PORTAL_PASSWORD: PORTAL_PASSWORD ?? '',
  SESSION_SECRET: SESSION_SECRET ?? JWT_SECRET ?? 'change-me-in-production',
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY,
  R2_SECRET_KEY,
  R2_PUBLIC_URL,
  R2_BUCKET,
  isProduction: (NODE_ENV ?? 'development') === 'production',
};
