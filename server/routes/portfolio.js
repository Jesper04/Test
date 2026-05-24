'use strict';

const express = require('express');
const { analysePortfolio }          = require('../lib/analysePortfolio');
const { getPortfolioPerformance }   = require('../lib/portfolioPerformance');

const router = express.Router();

router.post('/analyse', async (req, res) => {
  const { transactions } = req.body;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ error: 'transactions array is required', field: 'transactions' });
  }

  try {
    const result = await analysePortfolio(transactions);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Portfolio analyse error:', err.message);
    return res.status(500).json({ error: 'Failed to analyse portfolio', detail: err.message });
  }
});

router.post('/performance', async (req, res) => {
  const { transactions, period } = req.body;

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ error: 'transactions array is required', field: 'transactions' });
  }

  const validPeriods = ['1W', '1M', '6M', '1Y', '3Y', '5Y', '10Y', 'YTD', 'ALL'];
  if (!validPeriods.includes(period)) {
    return res.status(400).json({ error: `period must be one of: ${validPeriods.join(', ')}`, field: 'period' });
  }

  try {
    const result = await getPortfolioPerformance(transactions, period);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Portfolio performance error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch performance data', detail: err.message });
  }
});

module.exports = router;
