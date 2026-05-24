'use strict';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(str) {
  // Force UTC midnight so timezone offsets don't shift the day
  return new Date(`${str}T00:00:00Z`);
}

/**
 * Validates the CAGR request body.
 * Returns { errors: Array<{field, message}>, startDate, endDate }
 */
function validateInput(body) {
  const errors = [];
  let startDate = null;
  let endDate = null;

  // ── startValue ────────────────────────────────────────────
  if (body.startValue === null || body.startValue === undefined) {
    errors.push({ field: 'startValue', message: 'startValue is required' });
  } else if (typeof body.startValue !== 'number' || !isFinite(body.startValue)) {
    errors.push({ field: 'startValue', message: 'startValue must be a finite number' });
  } else if (body.startValue <= 0) {
    errors.push({ field: 'startValue', message: 'startValue must be greater than zero' });
  }

  // ── endValue ──────────────────────────────────────────────
  if (body.endValue === null || body.endValue === undefined) {
    errors.push({ field: 'endValue', message: 'endValue is required' });
  } else if (typeof body.endValue !== 'number' || !isFinite(body.endValue)) {
    errors.push({ field: 'endValue', message: 'endValue must be a finite number' });
  } else if (body.endValue < 0) {
    errors.push({ field: 'endValue', message: 'endValue cannot be negative' });
  }

  // ── startDate ─────────────────────────────────────────────
  if (!body.startDate) {
    errors.push({ field: 'startDate', message: 'startDate is required' });
  } else if (!DATE_RE.test(body.startDate)) {
    errors.push({ field: 'startDate', message: 'startDate must be in YYYY-MM-DD format' });
  } else {
    startDate = parseDate(body.startDate);
    if (isNaN(startDate.getTime())) {
      errors.push({ field: 'startDate', message: 'startDate is not a valid calendar date' });
      startDate = null;
    } else {
      const today = new Date();
      today.setUTCHours(23, 59, 59, 999);
      if (startDate > today) {
        errors.push({ field: 'startDate', message: 'startDate cannot be in the future' });
      }
    }
  }

  // ── endDate ───────────────────────────────────────────────
  if (!body.endDate) {
    errors.push({ field: 'endDate', message: 'endDate is required' });
  } else if (!DATE_RE.test(body.endDate)) {
    errors.push({ field: 'endDate', message: 'endDate must be in YYYY-MM-DD format' });
  } else {
    endDate = parseDate(body.endDate);
    if (isNaN(endDate.getTime())) {
      errors.push({ field: 'endDate', message: 'endDate is not a valid calendar date' });
      endDate = null;
    } else if (startDate && endDate <= startDate) {
      errors.push({ field: 'endDate', message: 'endDate must be after startDate' });
    }
  }

  return { errors, startDate, endDate };
}

module.exports = { validateInput };
