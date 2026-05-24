'use strict';

const express = require('express');
const { validateInput } = require('../lib/validateInput');
const { calculateCagr } = require('../lib/calculateCagr');
const { fetchTickerPrices } = require('../lib/fetchTickerPrices');

const router = express.Router();

router.post('/', async (req, res) => {
  const { ticker, startDate, endDate } = req.body;

  if (!ticker || typeof ticker !== 'string' || !ticker.trim()) {
    return res.status(400).json({ valid: false, error: 'ticker is required', field: 'ticker' });
  }

  // Reuse date validation from the CAGR lib (pass dummy values for startValue/endValue)
  const validation = validateInput({ startValue: 1, endValue: 1, startDate, endDate });
  if (validation.errors.length > 0) {
    const { field, message } = validation.errors[0];
    return res.status(400).json({ valid: false, error: message, field });
  }

  let prices;
  try {
    prices = await fetchTickerPrices(ticker.trim().toUpperCase(), startDate, endDate);
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('No fundamentals data') || msg.includes('No price data')) {
      return res.status(404).json({ valid: false, error: `Ticker "${ticker}" not found or no data for the given dates`, field: 'ticker' });
    }
    return res.status(502).json({ valid: false, error: 'Failed to fetch price data from Yahoo Finance' });
  }

  const result = calculateCagr(
    prices.start.price,
    prices.end.price,
    validation.startDate,
    validation.endDate,
  );

  return res.status(200).json({
    ...result,
    ticker: ticker.trim().toUpperCase(),
    startPrice: prices.start.price,
    startPriceDate: prices.start.date,
    endPrice: prices.end.price,
    endPriceDate: prices.end.date,
    currency: prices.start.currency,
  });
});

module.exports = router;
