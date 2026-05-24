'use strict';

const request = require('supertest');

// Mock parseCsvWithAI before requiring app so the route gets the mock
jest.mock('../lib/parseCsvWithAI', () => ({
  parseCsvWithAI: jest.fn(),
}));

const { parseCsvWithAI } = require('../lib/parseCsvWithAI');
const app = require('../app');

const MOCK_RESULT = {
  currency: 'GBP',
  currencySymbol: '£',
  currencyConfidence: 'high',
  transactions: [
    {
      ticker: 'AAPL',
      date: '2024-01-15',
      shares: 10,
      pricePerShare: 150.0,
      total: 1500.0,
      action: 'BUY',
      currency: 'USD',
      currencySymbol: '$',
    },
  ],
  parseWarnings: [],
};

const SAMPLE_CSV = `Date,Ticker,Shares,Price
2024-01-15,AAPL,10,150.00`;

beforeEach(() => {
  jest.resetAllMocks();
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
});

afterAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe('POST /api/parse-csv', () => {
  // ── Happy path ───────────────────────────────────────────
  test('200 with parsed transactions on valid CSV', async () => {
    parseCsvWithAI.mockResolvedValue(MOCK_RESULT);

    const res = await request(app)
      .post('/api/parse-csv')
      .attach('file', Buffer.from(SAMPLE_CSV), { filename: 'trades.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.currency).toBe('GBP');
    expect(res.body.currencySymbol).toBe('£');
    expect(res.body.currencyConfidence).toBe('high');
    expect(Array.isArray(res.body.transactions)).toBe(true);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.transactions[0].ticker).toBe('AAPL');
  });

  test('200 returns USD result for US-style CSV', async () => {
    parseCsvWithAI.mockResolvedValue({
      ...MOCK_RESULT,
      currency: 'USD',
      currencySymbol: '$',
    });

    const res = await request(app)
      .post('/api/parse-csv')
      .attach('file', Buffer.from(SAMPLE_CSV), { filename: 'trades.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.currency).toBe('USD');
  });

  test('200 includes parseWarnings when column mapping was ambiguous', async () => {
    parseCsvWithAI.mockResolvedValue({
      ...MOCK_RESULT,
      parseWarnings: ['Could not determine if "Amount" is shares or total — assumed shares'],
    });

    const res = await request(app)
      .post('/api/parse-csv')
      .attach('file', Buffer.from(SAMPLE_CSV), { filename: 'trades.csv', contentType: 'text/csv' });

    expect(res.status).toBe(200);
    expect(res.body.parseWarnings).toHaveLength(1);
  });

  // ── Missing / empty file ─────────────────────────────────
  test('400 when no file is attached', async () => {
    const res = await request(app).post('/api/parse-csv');

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('file');
  });

  test('400 when CSV file is empty', async () => {
    const res = await request(app)
      .post('/api/parse-csv')
      .attach('file', Buffer.from('   '), { filename: 'empty.csv', contentType: 'text/csv' });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('file');
  });

  test('400 when file is not a CSV', async () => {
    const res = await request(app)
      .post('/api/parse-csv')
      .attach('file', Buffer.from('<html></html>'), {
        filename: 'page.html',
        contentType: 'text/html',
      });

    expect(res.status).toBe(400);
    expect(res.body.field).toBe('file');
  });

  // ── API key not configured ───────────────────────────────
  test('503 when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const res = await request(app)
      .post('/api/parse-csv')
      .attach('file', Buffer.from(SAMPLE_CSV), { filename: 'trades.csv', contentType: 'text/csv' });

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  // ── Upstream AI error ────────────────────────────────────
  test('500 when AI parsing throws', async () => {
    parseCsvWithAI.mockRejectedValue(new Error('Claude API timeout'));

    const res = await request(app)
      .post('/api/parse-csv')
      .attach('file', Buffer.from(SAMPLE_CSV), { filename: 'trades.csv', contentType: 'text/csv' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to parse CSV');
  });

  // ── parseCsvWithAI receives the raw CSV text ─────────────
  test('passes CSV content to parseCsvWithAI', async () => {
    parseCsvWithAI.mockResolvedValue(MOCK_RESULT);

    await request(app)
      .post('/api/parse-csv')
      .attach('file', Buffer.from(SAMPLE_CSV), { filename: 'trades.csv', contentType: 'text/csv' });

    expect(parseCsvWithAI).toHaveBeenCalledWith(SAMPLE_CSV);
  });
});
