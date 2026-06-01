'use strict';

const express = require('express');
const multer = require('multer');
const { parseCsvWithAI, extractDeposits } = require('../lib/parseCsvWithAI');
const store = require('../lib/portfolioStore');

const router = express.Router();

const MAX_CHARS = 300_000; // ~75K tokens — safe for 1M context window

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB — ample for any real portfolio CSV
  fileFilter: (_req, file, cb) => {
    const isCsv =
      file.originalname.toLowerCase().endsWith('.csv') ||
      ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'].includes(
        file.mimetype,
      );
    isCsv ? cb(null, true) : cb(new Error('Only CSV files are accepted'));
  },
});

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded', field: 'file' });
  }

  const csvContent = req.file.buffer.toString('utf-8').trim();

  if (!csvContent) {
    return res.status(400).json({ error: 'CSV file is empty', field: 'file' });
  }

  if (csvContent.length > MAX_CHARS) {
    return res.status(400).json({
      error: `CSV is too large for AI parsing (${csvContent.length} chars; max ${MAX_CHARS})`,
      field: 'file',
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'AI parsing service not configured — set ANTHROPIC_API_KEY',
    });
  }

  try {
    const result = await parseCsvWithAI(csvContent);
    if (!result.deposits || result.deposits.length === 0) {
      result.deposits = extractDeposits(csvContent);
    }
    store.save({ transactions: result.transactions, dividends: result.dividends, deposits: result.deposits, currency: result.currency });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error('[CSV PARSE ERROR]', err.stack || err);
    return res.status(500).json({ error: 'Failed to parse CSV', detail: err.message });
  }
});

// Multer error handler
router.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large (max 2MB)', field: 'file' });
  }
  return res.status(400).json({ error: err.message, field: 'file' });
});

module.exports = router;
