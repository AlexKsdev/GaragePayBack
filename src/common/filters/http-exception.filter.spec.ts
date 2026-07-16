import {
  ArgumentsHost,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AUTH_ERROR_CODES, authError } from '../../config/error-codes.config';
import { HttpExceptionFilter } from './http-exception.filter';

interface CapturedResponse {
  statusCode: number;
  message: string;
  error: string;
  code?: string;
}

function buildHost(): { host: ArgumentsHost; body: () => CapturedResponse } {
  let captured: CapturedResponse;
  const response = {
    status: () => response,
    json: (payload: CapturedResponse) => {
      captured = payload;
    },
  };
  return {
    host: {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost,
    body: () => captured,
  };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('passes a code through when the exception carries one', () => {
    const { host, body } = buildHost();

    filter.catch(
      new UnauthorizedException(
        authError(AUTH_ERROR_CODES.invalidCode, 'Invalid code'),
      ),
      host,
    );

    expect(body().code).toBe(AUTH_ERROR_CODES.invalidCode);
    expect(body().message).toBe('Invalid code');
    expect(body().statusCode).toBe(401);
  });

  it('omits code entirely for exceptions thrown without one', () => {
    const { host, body } = buildHost();

    filter.catch(new UnauthorizedException('Invalid credentials'), host);

    expect('code' in body()).toBe(false);
  });

  // Nest only fills in `error` for string payloads, so an object payload could
  // silently downgrade it to the class name for every localized error.
  it('keeps the same error phrase whether or not a code is attached', () => {
    const withCode = buildHost();
    const withoutCode = buildHost();

    filter.catch(
      new UnauthorizedException(
        authError(AUTH_ERROR_CODES.invalidCode, 'Invalid code'),
      ),
      withCode.host,
    );
    filter.catch(new UnauthorizedException('Invalid code'), withoutCode.host);

    expect(withCode.body().error).toBe('Unauthorized');
    expect(withCode.body().error).toBe(withoutCode.body().error);
  });

  it('uses the reason phrase of the actual status, not a fixed one', () => {
    const { host, body } = buildHost();

    filter.catch(
      new BadRequestException(
        authError(AUTH_ERROR_CODES.resetTokenInvalid, 'Invalid token'),
      ),
      host,
    );

    expect(body().statusCode).toBe(400);
    expect(body().error).toBe('Bad Request');
  });

  it('reports an unknown throwable as a 500 without leaking its detail', () => {
    const { host, body } = buildHost();

    filter.catch(new Error('connection string with a password in it'), host);

    expect(body().statusCode).toBe(500);
    expect(body().message).toBe('Internal server error');
    expect(body().error).toBe('InternalServerError');
  });
});
