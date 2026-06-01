'use strict';

const express = require('express');
const cors = require('cors');
const cagrRouter = require('./routes/cagr');
const cagrTickerRouter = require('./routes/cagrTicker');
const parseCsvRouter = require('./routes/parseCsv');
const portfolioRouter = require('./routes/portfolio');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/portfolio/stored', (_req, res) => {
  const data = require('./lib/portfolioStore').load();
  if (!data) return res.status(404).json({ error: 'No stored portfolio' });
  res.json(data);
});
app.use('/api/cagr', cagrRouter);
app.use('/api/cagr/ticker', cagrTickerRouter);
app.use('/api/parse-csv', parseCsvRouter);
app.use('/api/portfolio', portfolioRouter);

// Express error middleware — catches errors passed via next(err)
app.use((err, _req, res, _next) => {
  console.error('[EXPRESS ERROR]', err.stack || err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// Process-level safety nets — catch anything that escapes route handlers
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason?.stack || reason);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.stack || err);
});

module.exports = app;
