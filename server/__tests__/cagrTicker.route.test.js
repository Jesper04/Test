'use strict';

const request = require('supertest');

jest.mock('../lib/fetchTickerPrices', () => ({
  fetchTickerPrices: jest.fn(),
}));

const { fetchTickerPrices } = require('../lib/fetchTickerPrices');
const app = require('../app');

const MOCK_PRICES = {
  start: { price: 100.0, date: '2020-01-02', currency: 'USD' },
  end:   { price: 200.0, date: '2024-01-02', currency: 'USD' },
};

beforeEach(() => jest.resetAllMocks());

describe('POST /api/cagr/ticker', () => {
  // ── Happy path ───────────────────────────────────────────
  test('200 with CAGR result for valid ticker and dates', async () => {
    fetchTickerPrices.mockResolvedValue(MOCK_PRICES);

    const res = await request(app)
      .post('/api/cagr/ticker')
      .send({ ticker: 'AAPL', startDate: '2020-01-01', endDate: '2024-01-01' });

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.ticker).toBe('AAPL');
    expect(res.body.startPrice).toBe(100.0);
    expect(res.body.endPrice).toBe(200.0);
    expect(res.body.currency).toBe('USD');
    expect(typeof res.body.cagr).toBe('number');
    expect(typeof res.body.cagrPercent).toBe('string');
  });

  test('200 normalises ticker to uppercase', async () => {
    fetchTickerPrices.mockResolvedValue(MOCK_PRICES);

    const res = await request(app)
      .post('/api/cagr/ticker')
      .send({ ticker: 'aapl', startDate: '2020-01-01', endDate: '2024-01-01' });

    expect(res.status).toBe(200);
    expect(res.body.ticker).toBe('AAPL');
  });

  test('200 returns actual price dates (may differ from requested dates)', async () => {
    fetchTickerPrices.mockResolvedValue(MOCK_PRICES);

    const res = await request(app)
      .post('/api/cagr/ticker')
      .send({ ticker: 'AAPL', startDate: '2020-01-01', endDate: '2024-01-01' });

    expect(res.body.startPriceDate).toBe('2020-01-02');
    expect(res.body.endPriceDate).toBe('2024-01-02');
  });

  // ── Validation errors ────────────────────────────────────
  test('400 when ticker is missing', async () => {
    const res = await request(app)
      .post('/api/cagr/ticker')
      .send({ startDate: '2020-01-01', endDate: '2024-01-01' });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('ticker');
  });

  test('400 when ticker is empty string', async () => {
    const res = await request(app)
      .post('/api/cagr/ticker')
      .send({ ticker: '   ', startDate: '2020-01-01', endDate: '2024-01-01' });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('ticker');
  });

  test('400 when startDate is missing', async () => {
    const res = await request(app)
      .post('/api/cagr/ticker')
      .send({ ticker: 'AAPL', endDate: '2024-01-01' });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('startDate');
  });

  test('400 when endDate is before startDate', async () => {
    const res = await request(app)
      .post('/api/cagr/ticker')
      .send({ ticker: 'AAPL', startDate: '2024-01-01', endDate: '2020-01-01' });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('endDate');
  });

  // ── Upstream errors ──────────────────────────────────────
  test('404 when ticker does not exist on Yahoo Finance', async () => {
    fetchTickerPrices.mockRejectedValue(new Error('No price data found for FAKE around 2020-01-01'));

    const res = await request(app)
      .post('/api/cagr/ticker')
      .send({ ticker: 'FAKE', startDate: '2020-01-01', endDate: '2024-01-01' });

    expect(res.status).toBe(404);
    expect(res.body.field).toBe('ticker');
  });

  test('502 when Yahoo Finance fetch fails', async () => {
    fetchTickerPrices.mockRejectedValue(new Error('HTTPError: network failure'));

    const res = await request(app)
      .post('/api/cagr/ticker')
      .send({ ticker: 'AAPL', startDate: '2020-01-01', endDate: '2024-01-01' });

    expect(res.status).toBe(502);
  });
});
