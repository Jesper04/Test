'use strict';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_YEAR = 365.25; // accounts for leap years

/**
 * Computes CAGR from validated inputs.
 * Caller must ensure startValue > 0, endValue >= 0, and endDate > startDate.
 *
 * @param {number} startValue
 * @param {number} endValue
 * @param {Date}   startDate
 * @param {Date}   endDate
 * @returns {{ cagr, cagrRaw, cagrPercent, years, valid }}
 */
function calculateCagr(startValue, endValue, startDate, endDate) {
  const days = (endDate - startDate) / MS_PER_DAY;
  const years = days / DAYS_PER_YEAR;

  const ratio = endValue / startValue;

  // ratio === 1 guard avoids floating-point drift producing −0 or tiny non-zero
  const cagrRaw = ratio === 1 ? 0 : Math.pow(ratio, 1 / years) - 1;

  const cagr = parseFloat(cagrRaw.toFixed(4));
  const cagrPercent = `${(cagr * 100).toFixed(2)}%`;

  return {
    cagr,
    cagrRaw,
    cagrPercent,
    years: parseFloat(years.toFixed(4)),
    valid: true,
  };
}

module.exports = { calculateCagr };
