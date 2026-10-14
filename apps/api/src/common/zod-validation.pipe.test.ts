import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppException } from './http-exception.filter.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ quantity: z.number().int().positive() }));

  it('returns parsed data for valid input', () => {
    expect(pipe.transform({ quantity: 2 })).toEqual({ quantity: 2 });
  });

  it('throws VALIDATION_FAILED with issue details for invalid input', () => {
    try {
      pipe.transform({ quantity: -1 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      const appError = error as AppException;
      expect(appError.getStatus()).toBe(400);
      expect(appError.code).toBe('VALIDATION_FAILED');
      expect(appError.details).toMatchObject([{ path: 'quantity' }]);
    }
  });
});
