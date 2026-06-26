import {
  clearSessionCookie,
  signPortalSession,
  validatePortalPassword,
} from '../../shared/portal-auth.middleware.js';
import { ApiError } from '../../shared/apiError.js';

export class AuthService {
  login(password) {
    if (!password) {
      throw ApiError.badRequest('Password is required.');
    }
    if (!validatePortalPassword(password)) {
      throw ApiError.unauthorized('Invalid password.');
    }
    return signPortalSession();
  }

  logout(res) {
    clearSessionCookie(res);
  }
}
