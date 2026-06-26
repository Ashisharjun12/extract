import { asyncHandler } from '../../shared/asyncHandler.js';
import { ApiResponse } from '../../shared/apiResponse.js';
import { AuthService } from './auth.service.js';

const authService = new AuthService();

export class AuthController {
  login = asyncHandler(async (req, res) => {
    const { password } = req.body;
    const token = authService.login(password);
    res.status(200).json(
      new ApiResponse(200, { authenticated: true, token }, 'Signed in successfully.'),
    );
  });

  logout = asyncHandler(async (_req, res) => {
    authService.logout(res);
    res.status(200).json(new ApiResponse(200, null, 'Signed out successfully.'));
  });

  me = asyncHandler(async (req, res) => {
    res.status(200).json(
      new ApiResponse(200, { authenticated: true, user: req.portalUser }, 'Session is valid.'),
    );
  });
}
