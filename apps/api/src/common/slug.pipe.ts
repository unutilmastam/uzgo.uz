import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import { AppException } from './http-exception.filter.js';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Validates URL slugs (lowercase latin, digits, single dashes; max 120). */
@Injectable()
export class SlugPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (value.length > 120 || !SLUG.test(value)) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Invalid slug');
    }
    return value;
  }
}
