import { ErrorRequestHandler } from "express";
import { logger } from "../../utils/logger.js";
import { ApiError, QueueOverloadedError } from "./apiError.js";

//error handling middleware
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    logger.error({ err, method: req.method, path: req.path, requestId: req.id })

    // Handle Opossum Circuit Breaker Open Error
    if (ApiError.isCircuitBreakerOpen(err)) {
        // P2 Fix #10: Retry-After header — tells upstream to wait 30s before retrying.
        // Circuit breaker resetTimeout is 30s, so this aligns exactly.
        res.set('Retry-After', '30');
        return res.status(503).json({
            success: false,
            message: "Service temporarily unavailable due to high load. Please try again later.",
            errors: []
        });
    }

    // Handle Quota Errors
    if (ApiError.isQuotaError(err)) {
        return res.status(429).json({
            success: false,
            message: "AI Provider Quota Exceeded. Please try again later.",
            errors: []
        });
    }

    if (err instanceof ApiError && err.isOperational) {
        // P2 Fix #10: For QueueOverloadedError (503), emit Retry-After header so
        // upstream services know exactly how long to back off.
        if (err instanceof QueueOverloadedError) {
            res.set('Retry-After', String(err.retryAfterSeconds));
        }
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            errors: err.errors
        })
    }

    //unexpectd crash
    res.status(500).json({
        success: false,
        message: "Internal Server Error",
        errors: []
    })
}