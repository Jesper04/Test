'use strict';

const { calculateCagr } = require('../lib/calculateCagr');

function d(str) {
  return new Date(`${str}T00:00:00Z`);
}

describe('calculateCagr — pure math', () => {
  test('normal growth: £10k → £16,105 over 5 years ≈ 10% CAGR', () => {
    const r = calculateCagr(10000, 16105.1, d('2019-01-01'), d('2024-01-01'));
    expect(r.valid).toBe(true);
    expect(r.cagr).toBeCloseTo(0.1, 2);
    expect(r.cagrPercent).toMatch(/^[\d.]+%$/);
    expect(r.years).toBeCloseTo(5, 1);
  });

  test('decline: £10k → £8k over 2 years → negative CAGR', () => {
    const r = calculateCagr(10000, 8000, d('2022-01-01'), d('2024-01-01'));
    expect(r.valid).toBe(true);
    expect(r.cagr).toBeLessThan(0);
    expect(r.cagrRaw).toBeLessThan(0);
    expect(r.cagrPercent).toMatch(/^-/);
  });

  test('less than 1 year: 184-day period', () => {
    // 2023-07-01 → 2024-01-01 = 184 days
    const r = calculateCagr(10000, 10500, d('2023-07-01'), d('2024-01-01'));
    expect(r.valid).toBe(true);
    expect(r.years).toBeLessThan(1);
    // Annualised return should be higher than simple 5% because period < 1 year
    expect(r.cagr).toBeGreaterThan(0.05);
  });

  test('approximately 1 year: 365 days → CAGR ≈ simple return', () => {
    // 2023-01-01 → 2024-01-01 = 365 days (non-leap year)
    const r = calculateCagr(10000, 11000, d('2023-01-01'), d('2024-01-01'));
    expect(r.valid).toBe(true);
    // ~0.9993 years, so CAGR slightly above 10%
    expect(r.cagr).toBeCloseTo(0.1, 2);
    expect(r.years).toBeCloseTo(1, 1);
  });

  test('equal start and end values → CAGR exactly 0%', () => {
    const r = calculateCagr(10000, 10000, d('2020-01-01'), d('2024-01-01'));
    expect(r.valid).toBe(true);
    expect(r.cagr).toBe(0);
    expect(r.cagrRaw).toBe(0);
    expect(r.cagrPercent).toBe('0.00%');
  });

  test('endValue of 0 → CAGR = -100%', () => {
    const r = calculateCagr(10000, 0, d('2020-01-01'), d('2024-01-01'));
    expect(r.valid).toBe(true);
    expect(r.cagr).toBe(-1);
    expect(r.cagrPercent).toBe('-100.00%');
  });

  test('precision: cagr has at most 4 decimal places', () => {
    const r = calculateCagr(1000, 1500, d('2020-01-01'), d('2023-01-01'));
    const decimals = r.cagr.toString().split('.')[1] ?? '';
    expect(decimals.length).toBeLessThanOrEqual(4);
  });

  test('partial period: leap-year range uses 365.25 divisor', () => {
    // 2020-01-01 → 2021-01-01 spans the Feb 29 leap day = 366 days
    const r = calculateCagr(10000, 11000, d('2020-01-01'), d('2021-01-01'));
    const expectedYears = 366 / 365.25;
    expect(r.years).toBeCloseTo(expectedYears, 3);
  });

  test('cagrRaw is the unrounded float used for programmatic work', () => {
    const r = calculateCagr(10000, 16105.1, d('2019-01-01'), d('2024-01-01'));
    // cagrRaw should be equal to or more precise than cagr
    expect(Math.abs(r.cagrRaw - r.cagr)).toBeLessThan(0.00005);
  });
});
