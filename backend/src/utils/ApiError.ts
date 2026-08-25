import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Application-level error carrying an HTTP status code and a stable,
 * machine-readable error code. Throw this anywhere in the request lifecycle;
 * the centralized `onError` handler translates it into the consistent JSON
 * error envelope.
 */
export class ApiError extends Error {
  public readonly statusCode: ContentfulStatusCode;
  public readonly code: string;
  public readonly details?: unknown;
  /** Distinguishes expected/handled errors from unexpected crashes. */
  public readonly isOperational: boolean;

  constructor(
    statusCode: ContentfulStatusCode,
    message: string,
    code = 'ERROR',
    details?: unknown,
    isOperational = true,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
  }

  static badRequest(message = 'Bad request', code = 'BAD_REQUEST', details?: unknown): ApiError {
    return new ApiError(400, message, code, details);
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED'): ApiError {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN'): ApiError {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND'): ApiError {
    return new ApiError(404, message, code);
  }

  static conflict(message = 'Conflict', code = 'CONFLICT', details?: unknown): ApiError {
    return new ApiError(409, message, code, details);
  }

  static validation(message = 'Validation failed', details?: unknown): ApiError {
    return new ApiError(422, message, 'VALIDATION_ERROR', details);
  }

  static internal(message = 'Internal server error', details?: unknown): ApiError {
    return new ApiError(500, message, 'INTERNAL_SERVER_ERROR', details, false);
  }
}
