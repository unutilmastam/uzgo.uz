import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ApiError } from '@uzgo/contracts';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

const CODE_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
};

/** Errors thrown with an explicit API code, e.g. new AppException(409, 'OUT_OF_STOCK', '...'). */
export class AppException extends HttpException {
  constructor(
    status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message, status);
  }
}

/** Express/body-parser errors carry a numeric status (e.g. 413, 400 for bad JSON). */
function isHttpLikeError(error: unknown): error is { status: number; expose?: boolean } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    error.status >= 400 &&
    error.status < 500
  );
}

/**
 * Converts every error into { error: { code, message, details?, requestId } }.
 * 5xx responses never expose internals; the real error is logged instead.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(HttpExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: unknown }>();
    const res = ctx.getResponse<Response>();
    const requestId = typeof req.id === 'string' ? req.id : 'unknown';

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = CODE_BY_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR');
      if (status < 500) message = exception.message;
    } else if (isHttpLikeError(exception)) {
      status = exception.status;
      code = CODE_BY_STATUS[status] ?? 'BAD_REQUEST';
      message = status === 413 ? 'Request body is too large' : 'Malformed request';
    }

    if (status >= 500) {
      this.logger.error({ err: exception, requestId }, 'Unhandled error');
    }

    const body: ApiError = {
      error: { code, message, ...(details === undefined ? {} : { details }), requestId },
    };
    res.status(status).json(body);
  }
}
