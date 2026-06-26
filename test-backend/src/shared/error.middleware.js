import { ApiError } from './apiError.js';

export function notFoundMiddleware(_req, _res, next) {
  next(ApiError.notFound('Route not found'));
}

export function errorMiddleware(err, _req, res, _next) {
  const statusCode = err.statusCode ?? 500;
  res.status(statusCode).json({
    success: false,
    message: err.message ?? 'Internal server error',
  });
}
