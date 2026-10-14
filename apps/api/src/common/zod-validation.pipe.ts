import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppException } from './http-exception.filter.js';

/**
 * Validates untrusted input with a Zod schema from @uzgo/contracts
 * (docs/decisions/0003-zod-contracts.md). Usage: @Body(new ZodValidationPipe(schema)).
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_FAILED',
        'Request validation failed',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
