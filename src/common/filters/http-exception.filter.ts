import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { STATUS_CODES } from 'http';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    // Nest fills in `error` ("Unauthorized", …) only for string payloads; an
    // object payload (the ones carrying a `code`) leaves it out. Falling back
    // to the status' reason phrase keeps the envelope identical either way —
    // `exception.name` alone would silently turn it into "UnauthorizedException".
    const error =
      exception instanceof HttpException
        ? ((exception.getResponse() as { error?: string }).error ??
          STATUS_CODES[status] ??
          exception.name)
        : 'InternalServerError';

    // Only present on exceptions thrown with an explicit code — it lets the
    // client localize the message instead of rendering the English fallback.
    const code =
      exception instanceof HttpException
        ? (exception.getResponse() as { code?: string }).code
        : undefined;

    response
      .status(status)
      .json({ statusCode: status, message, error, ...(code ? { code } : {}) });
  }
}
