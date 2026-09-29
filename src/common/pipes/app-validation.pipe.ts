import {
  ArgumentMetadata,
  Injectable,
  ValidationPipe,
  type ValidationPipeOptions,
} from '@nestjs/common';
import { Types } from 'mongoose';

/** Types produced by a dedicated pipe, which must not be class-validated. */
const NON_VALIDATABLE_TYPES: unknown[] = [Types.ObjectId, Date, Buffer];

/**
 * The global validation pipe. Global pipes run before parameter-level ones, so
 * without the `toValidate` override a param like `@Param('id', ParseObjectIdPipe)`
 * would be class-validated as an `ObjectId` and fail before that pipe runs.
 */
@Injectable()
export class AppValidationPipe extends ValidationPipe {
  constructor(options?: ValidationPipeOptions) {
    super({
      // Strip unknown properties, then reject payloads that had any — together
      // these stop mass-assignment of fields like `roles` or `passwordHash`.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      forbidUnknownValues: true,
      stopAtFirstError: false,
      ...options,
    });
  }

  protected override toValidate(metadata: ArgumentMetadata): boolean {
    if (
      metadata.metatype &&
      NON_VALIDATABLE_TYPES.includes(metadata.metatype)
    ) {
      return false;
    }
    return super.toValidate(metadata);
  }
}
