'use strict';

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

/**
 * Fetch the closing price for a ticker on or just after a given date.
 * Returns { price, date, currency }.
 */
async function fetchPriceOnDate(ticker, targetDate) {
  const from = new Date(targetDate);
  // Look ahead up to 7 days to skip weekends/holidays
  const to = new Date(from);
  to.setDate(to.getDate() + 7);

  const results = await yahooFinance.historical(ticker, {
    period1: from.toISOString().slice(0, 10),
    period2: to.toISOString().slice(0, 10),
    interval: '1d',
  });

  if (!results || results.length === 0) {
    throw new Error(`No price data found for ${ticker} around ${targetDate}`);
  }

  const row = results[0];
  return {
    price: row.close,
    date: row.date.toISOString().slice(0, 10),
    currency: row.currency || null,
  };
}

async function fetchTickerPrices(ticker, startDate, endDate) {
  const [start, end] = await Promise.all([
    fetchPriceOnDate(ticker, startDate),
    fetchPriceOnDate(ticker, endDate),
  ]);
  return { start, end };
}

module.exports = { fetchTickerPrices };
