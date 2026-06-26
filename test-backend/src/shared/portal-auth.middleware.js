import jwt from 'jsonwebtoken';
import { _config } from '../config/config.js';
import { ApiError } from './apiError.js';

const COOKIE_NAME = 'portal_session';
const SESSION_TTL = '7d';

export function getSessionCookieName() {
  return COOKIE_NAME;
}

export function signPortalSession() {
  return jwt.sign({ sub: '', role: 'Admin' }, _config.SESSION_SECRET, {
    expiresIn: SESSION_TTL,
  });
}

export function verifyPortalSession(token) {
  try {
    return jwt.verify(token, _config.SESSION_SECRET);
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: _config.isProduction,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: _config.isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

function extractPortalToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return req.cookies?.[COOKIE_NAME] ?? null;
}

export function portalAuth(req, _res, next) {
  const token = extractPortalToken(req);
  if (!token) {
    return next(ApiError.unauthorized('Not authenticated. Please sign in.'));
  }
  const payload = verifyPortalSession(token);
  if (!payload) {
    return next(ApiError.unauthorized('Session expired. Please sign in again.'));
  }
  req.portalUser = payload;
  return next();
}

export function validatePortalPassword(password) {
  if (!_config.PORTAL_PASSWORD) {
    throw ApiError.badRequest('Portal login is not configured (PORTAL_PASSWORD missing).');
  }
  return password === _config.PORTAL_PASSWORD;
}
