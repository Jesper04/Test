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
app.use('/api/cagr', cagrRouter);
app.use('/api/cagr/ticker', cagrTickerRouter);
app.use('/api/parse-csv', parseCsvRouter);
app.use('/api/portfolio', portfolioRouter);

module.exports = app;
