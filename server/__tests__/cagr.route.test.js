'use strict';

const request = require('supertest');
const app = require('../app');

const VALID_BODY = {
  startValue: 10000,
  endValue: 16105.1,
  startDate: '2019-01-01',
  endDate: '2024-01-01',
};

describe('POST /api/cagr', () => {
  // ── Happy path ───────────────────────────────────────────
  test('200 with correct shape for normal growth', async () => {
    const res = await request(app).post('/api/cagr').send(VALID_BODY);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(typeof res.body.cagr).toBe('number');
    expect(typeof res.body.cagrRaw).toBe('number');
    expect(res.body.cagrPercent).toMatch(/%$/);
    expect(typeof res.body.years).toBe('number');
    expect(res.body.cagr).toBeCloseTo(0.1, 2);
  });

  test('200 with negative CAGR when endValue < startValue', async () => {
    const res = await request(app).post('/api/cagr').send({
      ...VALID_BODY,
      startValue: 10000,
      endValue: 8000,
      startDate: '2022-01-01',
      endDate: '2024-01-01',
    });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.cagr).toBeLessThan(0);
    expect(res.body.cagrPercent).toMatch(/^-/);
  });

  test('200 with cagr = 0 when start and end values are equal', async () => {
    const res = await request(app).post('/api/cagr').send({
      ...VALID_BODY,
      startValue: 10000,
      endValue: 10000,
    });
    expect(res.status).toBe(200);
    expect(res.body.cagr).toBe(0);
  });

  // ── startValue errors ────────────────────────────────────
  test('400 field=startValue when startValue is 0', async () => {
    const res = await request(app).post('/api/cagr').send({ ...VALID_BODY, startValue: 0 });
    expect(res.status).toBe(400);
    expect(res.body.valid).toBe(false);
    expect(res.body.field).toBe('startValue');
    expect(res.body.error).toMatch(/greater than zero/i);
  });

  test('400 field=startValue when startValue is negative', async () => {
    const res = await request(app).post('/api/cagr').send({ ...VALID_BODY, startValue: -500 });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('startValue');
  });

  test('400 field=startValue when startValue is null', async () => {
    const res = await request(app).post('/api/cagr').send({ ...VALID_BODY, startValue: null });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('startValue');
  });

  test('400 field=startValue when startValue is a string', async () => {
    const res = await request(app).post('/api/cagr').send({ ...VALID_BODY, startValue: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('startValue');
  });

  test('400 field=startValue when startValue is Infinity', async () => {
    const res = await request(app)
      .post('/api/cagr')
      .set('Content-Type', 'application/json')
      // JSON.stringify drops Infinity → undefined, so send raw NaN sentinel via string
      .send(JSON.stringify({ ...VALID_BODY, startValue: 'Infinity' }));
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('startValue');
  });

  // ── endValue errors ──────────────────────────────────────
  test('400 field=endValue when endValue is negative', async () => {
    const res = await request(app).post('/api/cagr').send({ ...VALID_BODY, endValue: -100 });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('endValue');
  });

  test('400 field=endValue when endValue is missing', async () => {
    const { endValue: _, ...body } = VALID_BODY;
    const res = await request(app).post('/api/cagr').send(body);
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('endValue');
  });

  // ── startDate errors ─────────────────────────────────────
  test('400 field=startDate when startDate is in the future', async () => {
    const res = await request(app).post('/api/cagr').send({
      ...VALID_BODY,
      startDate: '2099-01-01',
      endDate: '2099-06-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('startDate');
  });

  test('400 field=startDate when startDate is invalid format', async () => {
    const res = await request(app).post('/api/cagr').send({ ...VALID_BODY, startDate: '01/01/2020' });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('startDate');
  });

  test('400 field=startDate when startDate is not a real date', async () => {
    const res = await request(app).post('/api/cagr').send({ ...VALID_BODY, startDate: '2023-13-01' });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('startDate');
  });

  // ── endDate errors ───────────────────────────────────────
  test('400 field=endDate when endDate is before startDate', async () => {
    const res = await request(app).post('/api/cagr').send({
      ...VALID_BODY,
      startDate: '2022-01-01',
      endDate: '2020-01-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('endDate');
    expect(res.body.error).toMatch(/after startDate/i);
  });

  test('400 field=endDate when endDate equals startDate', async () => {
    const res = await request(app).post('/api/cagr').send({
      ...VALID_BODY,
      startDate: '2022-06-01',
      endDate: '2022-06-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('endDate');
  });

  test('400 field=endDate when endDate is missing', async () => {
    const { endDate: _, ...body } = VALID_BODY;
    const res = await request(app).post('/api/cagr').send(body);
    expect(res.status).toBe(400);
    expect(res.body.field).toBe('endDate');
  });

  // ── Health check ─────────────────────────────────────────
  test('GET /health returns 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
