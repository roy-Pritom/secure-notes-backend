import { HttpStatus } from '@nestjs/common';
import { Error as MongooseError, mongo } from 'mongoose';

const DUPLICATE_KEY = 11000;

export interface MappedError {
  status: number;
  message: string | string[];
  error: string;
}

/**
 * Maps driver/ODM errors onto HTTP responses.
 *
 * No message includes the offending value: a duplicate-key error on the email
 * index would otherwise tell an anonymous caller which addresses are taken.
 */
export function mapMongoError(exception: unknown): MappedError | null {
  if (
    exception instanceof mongo.MongoServerError &&
    exception.code === DUPLICATE_KEY
  ) {
    const keyPattern: unknown = exception.keyPattern;
    const fields =
      typeof keyPattern === 'object' && keyPattern !== null
        ? Object.keys(keyPattern)
        : [];
    return {
      status: HttpStatus.CONFLICT,
      message: `A record with this ${fields.join(', ') || 'field'} already exists`,
      error: 'Conflict',
    };
  }

  if (exception instanceof MongooseError.ValidationError) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      message: Object.values<{ message: string }>(
        exception.errors as Record<string, { message: string }>,
      ).map((error) => error.message),
      error: 'Unprocessable Entity',
    };
  }

  if (exception instanceof MongooseError.CastError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      message: `Invalid value for "${exception.path}"`,
      error: 'Bad Request',
    };
  }

  if (exception instanceof MongooseError.StrictModeError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      message: `Unknown field "${exception.path}"`,
      error: 'Bad Request',
    };
  }

  // Connection-level problems are not the client's fault.
  if (
    exception instanceof mongo.MongoNetworkError ||
    exception instanceof mongo.MongoServerSelectionError
  ) {
    return {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      message: 'Database temporarily unavailable',
      error: 'Service Unavailable',
    };
  }

  return null;
}
