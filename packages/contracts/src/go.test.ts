import { describe, expect, it } from 'vitest';
import { driverApplicationSchema, driverReviewSchema, plateNumberSchema } from './go.js';

describe('UZGO Go contracts', () => {
  it('normalises plate numbers and rejects odd ones', () => {
    expect(plateNumberSchema.parse('01 a 123 bc')).toBe('01A123BC');
    expect(plateNumberSchema.parse('10-123-ABC')).toBe('10123ABC');
    expect(plateNumberSchema.safeParse('A123BC').success).toBe(false);
  });

  it('needs the driver terms accepted', () => {
    const base = {
      firstName: 'Bobur',
      lastName: 'Karimov',
      licenceNumber: 'AF1234567',
      carMake: 'Chevrolet',
      carModel: 'Cobalt',
      carColor: 'Oq',
      carYear: 2021,
      plateNumber: '01A123BC',
    };
    expect(driverApplicationSchema.safeParse(base).success).toBe(false);
    expect(driverApplicationSchema.parse({ ...base, acceptTerms: true }).rideClass).toBe('ECONOMY');
  });

  it('asks staff for a note when rejecting', () => {
    expect(driverReviewSchema.safeParse({ decision: 'REJECT' }).success).toBe(false);
    expect(driverReviewSchema.safeParse({ decision: 'REJECT', note: 'Hujjat' }).success).toBe(true);
    expect(driverReviewSchema.safeParse({ decision: 'APPROVE' }).success).toBe(true);
  });
});
