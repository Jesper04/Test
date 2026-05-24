'use strict';

const express = require('express');
const { validateInput } = require('../lib/validateInput');
const { calculateCagr } = require('../lib/calculateCagr');

const router = express.Router();

router.post('/', (req, res) => {
  const { errors, startDate, endDate } = validateInput(req.body);

  if (errors.length > 0) {
    const { field, message } = errors[0];
    return res.status(400).json({ valid: false, error: message, field });
  }

  const result = calculateCagr(
    req.body.startValue,
    req.body.endValue,
    startDate,
    endDate,
  );

  return res.status(200).json(result);
});

module.exports = router;
