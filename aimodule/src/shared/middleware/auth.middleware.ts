import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { _config } from '../../config/config';
import { ApiError } from '../errors/apiError';


export const ROLES = {
    SURVEYOR: 'Surveyor',
    REVIEWER: 'Reviewer',
    ADMIN: 'Admin'
} as const

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: typeof ROLES[keyof typeof ROLES];
  };
}




export function authMiddleware(roles?: (typeof ROLES)[keyof typeof ROLES][]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(ApiError.unauthorized('Token missing'));
    }

    try {
      const decoded = jwt.verify(token, _config.JWT_SECRET!);
      req.user = decoded as any;
      
      if (roles && req.user && !roles.includes(req.user.role)) {
        return next(ApiError.forbidden('You do not have permission to perform this action'));
      }

      next();
    } catch {
      return next(ApiError.unauthorized('Token invalid or expired'));
    }
  };
}