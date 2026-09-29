import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { mapMongoError } from './mongo-error.mapper';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  timestamp: string;
  path: string;
}

/** A Terminus health-check result, which owns its own response shape. */
interface HealthCheckBody {
  status: string;
  info?: Record<string, unknown>;
  error?: Record<string, unknown>;
  details: Record<string, unknown>;
}

type ResponseBody = ErrorBody | HealthCheckBody;

function isHealthCheckPayload(payload: object): payload is HealthCheckBody {
  return 'status' in payload && 'details' in payload && 'info' in payload;
}

/**
 * The single global exception filter. Unknown errors are logged in full
 * server-side and reported as a bare 500 — stack traces and driver internals
 * must never cross the network boundary.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      this.logUnexpected(exception, host.getType());
      return;
    }

    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const path = httpAdapter.getRequestUrl(ctx.getRequest()) as string;

    const body = this.buildBody(exception, path);
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : ((body as ErrorBody).statusCode ?? HttpStatus.INTERNAL_SERVER_ERROR);

    httpAdapter.reply(ctx.getResponse(), body, status);
  }

  private buildBody(exception: unknown, path: string): ResponseBody {
    const base = { timestamp: new Date().toISOString(), path };

    if (exception instanceof HttpException) {
      const response = exception.getResponse();

      if (typeof response === 'string') {
        return {
          statusCode: exception.getStatus(),
          message: response,
          ...base,
        };
      }

      // Terminus reports a failing check by throwing with the full health
      // report as payload; that shape is a contract with orchestrators.
      if (isHealthCheckPayload(response)) {
        return response;
      }

      const payload = response as {
        message?: string | string[];
        error?: string;
      };
      return {
        statusCode: exception.getStatus(),
        message: payload.message ?? exception.message,
        ...(payload.error ? { error: payload.error } : {}),
        ...base,
      };
    }

    const mapped = mapMongoError(exception);
    if (mapped) {
      if (mapped.status >= 500) {
        this.logUnexpected(exception, path);
      }
      return {
        statusCode: mapped.status,
        message: mapped.message,
        error: mapped.error,
        ...base,
      };
    }

    this.logUnexpected(exception, path);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'Internal Server Error',
      ...base,
    };
  }

  private logUnexpected(exception: unknown, where: string): void {
    this.logger.error(
      `Unhandled exception (${where})`,
      exception instanceof Error ? exception.stack : String(exception),
    );
  }
}
