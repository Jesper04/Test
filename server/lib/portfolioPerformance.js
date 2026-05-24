'use strict';

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const PERIOD_LABELS = ['1W', '1M', '6M', '1Y', '3Y', '5Y', '10Y', 'YTD', 'ALL'];

function periodStartDate(period, firstTradeDateStr) {
  const now = new Date();
  switch (period) {
    case '1W':  { const d = new Date(now); d.setDate(d.getDate() - 7);          return d; }
    case '1M':  { const d = new Date(now); d.setMonth(d.getMonth() - 1);        return d; }
    case '6M':  { const d = new Date(now); d.setMonth(d.getMonth() - 6);        return d; }
    case '1Y':  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1);  return d; }
    case '3Y':  { const d = new Date(now); d.setFullYear(d.getFullYear() - 3);  return d; }
    case '5Y':  { const d = new Date(now); d.setFullYear(d.getFullYear() - 5);  return d; }
    case '10Y': { const d = new Date(now); d.setFullYear(d.getFullYear() - 10); return d; }
    case 'YTD': return new Date(now.getFullYear(), 0, 1);
    case 'ALL': return new Date(firstTradeDateStr);
    default:    { const d = new Date(now); d.setFullYear(d.getFullYear() - 1);  return d; }
  }
}

async function fetchHistory(ticker, fromStr, toStr, interval) {
  try {
    const rows = await yahooFinance.historical(
      ticker,
      { period1: fromStr, period2: toStr, interval },
      { validateResult: false },
    );
    return rows || [];
  } catch {
    return [];
  }
}

function toDateMap(rows) {
  const m = {};
  for (const r of rows) {
    if (r.close != null) m[r.date.toISOString().slice(0, 10)] = r.close;
  }
  return m;
}

// Fill gaps using the last seen value
function forwardFill(sortedDates, map) {
  const filled = {};
  let last = null;
  for (const d of sortedDates) {
    if (map[d] != null) last = map[d];
    if (last != null) filled[d] = last;
  }
  return filled;
}

// Build holdings at a given date from sorted transactions
function holdingsAt(sortedTx, dateStr) {
  const h = {};
  for (const tx of sortedTx) {
    if (tx.date > dateStr) break;
    h[tx.ticker] = (h[tx.ticker] || 0) + (tx.action === 'BUY' ? tx.shares : -tx.shares);
  }
  return h;
}

async function getPortfolioPerformance(transactions, period) {
  const today    = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const sortedTx    = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const firstTrade  = sortedTx[0].date;

  const benchStart  = periodStartDate(period, firstTrade);
  const benchStartStr = benchStart.toISOString().slice(0, 10);

  // Portfolio can't go before first trade
  const portStart = new Date(Math.max(benchStart.getTime(), new Date(firstTrade).getTime()));
  const portStartStr = portStart.toISOString().slice(0, 10);

  const interval = ['1W', '1M'].includes(period) ? '1d' : '1wk';

  const tickers = [...new Set(sortedTx.map(t => t.ticker))];

  // Map ticker → currency from transactions
  const txCurrency = {};
  for (const tx of sortedTx) {
    if (!txCurrency[tx.ticker]) txCurrency[tx.ticker] = tx.currency || 'GBP';
  }

  // Fetch everything in parallel
  const [gbpUsdRows, gbpEurRows, sp500Rows, ftseRows, ...tickerHistories] = await Promise.all([
    fetchHistory('GBPUSD=X', benchStartStr, todayStr, interval),
    fetchHistory('GBPEUR=X', benchStartStr, todayStr, interval),
    fetchHistory('^GSPC',    benchStartStr, todayStr, interval),
    fetchHistory('^FTSE',    benchStartStr, todayStr, interval),
    ...tickers.map(t => fetchHistory(t, portStartStr, todayStr, interval)),
  ]);

  // Build price maps
  const gbpUsdMap = toDateMap(gbpUsdRows);
  const gbpEurMap = toDateMap(gbpEurRows);
  const sp500Map  = toDateMap(sp500Rows);
  const ftseMap   = toDateMap(ftseRows);

  const tickerMap = {};
  tickers.forEach((t, i) => { tickerMap[t] = toDateMap(tickerHistories[i]); });

  // Gather all chart dates from benchmark data
  const dateSet = new Set([
    ...sp500Rows.map(r => r.date.toISOString().slice(0, 10)),
    ...ftseRows.map(r => r.date.toISOString().slice(0, 10)),
  ]);
  const chartDates = [...dateSet].filter(d => d >= benchStartStr && d <= todayStr).sort();

  if (chartDates.length === 0) return { series: [], period };

  // Forward-fill everything
  const gbpUsd = forwardFill(chartDates, gbpUsdMap);
  const gbpEur = forwardFill(chartDates, gbpEurMap);
  const sp500  = forwardFill(chartDates, sp500Map);
  const ftse   = forwardFill(chartDates, ftseMap);
  const tFilled = {};
  for (const t of tickers) tFilled[t] = forwardFill(chartDates, tickerMap[t]);

  // Helper: convert a native Yahoo Finance price to GBP
  function toGbp(nativePrice, ticker, cur, d) {
    if (ticker.endsWith('.L') || (cur === 'GBP' && nativePrice > 500)) {
      return nativePrice / 100; // GBp (pence) → GBP
    }
    if (cur === 'USD') return nativePrice / (gbpUsd[d] || 1.27);
    if (cur === 'EUR') return nativePrice / (gbpEur[d] || 1.17);
    return nativePrice;
  }

  // Absolute portfolio value: evolving holdings including cash deposits
  // (used for the £ Value chart)
  const portValues = {};
  for (const d of chartDates) {
    if (d < portStartStr) continue;
    const hld = holdingsAt(sortedTx, d);
    let val = 0;
    for (const [ticker, shares] of Object.entries(hld)) {
      if (shares <= 0.0001) continue;
      const nativePrice = tFilled[ticker]?.[d];
      if (nativePrice == null) continue;
      val += shares * toGbp(nativePrice, ticker, txCurrency[ticker] || 'GBP', d);
    }
    if (val > 0) portValues[d] = val;
  }

  // Return series: CURRENT holdings at fixed share counts, cash-flow neutral
  // (used for the % Return chart — comparable to benchmark indices)
  const currentHoldings = holdingsAt(sortedTx, todayStr);

  // First pass — rough values to locate the anchor date
  const roughValues = {};
  for (const d of chartDates) {
    let val = 0;
    for (const [ticker, shares] of Object.entries(currentHoldings)) {
      if (shares <= 0.0001) continue;
      const nativePrice = tFilled[ticker]?.[d];
      if (nativePrice == null) continue;
      val += shares * toGbp(nativePrice, ticker, txCurrency[ticker] || 'GBP', d);
    }
    if (val > 0) roughValues[d] = val;
  }

  // Anchor: first date where we have some holdings value + both benchmarks
  const anchor = chartDates.find(d => roughValues[d] != null && sp500[d] != null && ftse[d] != null);
  if (!anchor) return { series: [], valueSeries: [], period };

  // Stable basket: only holdings that had prices on the anchor date.
  // This prevents artificial jumps when stocks IPO'd mid-period (e.g. UMG.AS in Sep 2021).
  const anchorBasket = Object.fromEntries(
    Object.entries(currentHoldings).filter(
      ([ticker, shares]) => shares > 0.0001 && tFilled[ticker]?.[anchor] != null,
    ),
  );

  // Second pass — recompute using only the stable basket
  const holdingsValues = {};
  for (const d of chartDates) {
    let val = 0;
    for (const [ticker, shares] of Object.entries(anchorBasket)) {
      const nativePrice = tFilled[ticker]?.[d];
      if (nativePrice == null) continue;
      val += shares * toGbp(nativePrice, ticker, txCurrency[ticker] || 'GBP', d);
    }
    if (val > 0) holdingsValues[d] = val;
  }

  const baseHoldings = holdingsValues[anchor];
  const baseSp500    = sp500[anchor];
  const baseFtse     = ftse[anchor];

  const series = chartDates
    .filter(d => d >= anchor)
    .map(d => ({
      date:      d,
      portfolio: holdingsValues[d] != null ? parseFloat(((holdingsValues[d] / baseHoldings - 1) * 100).toFixed(2)) : null,
      sp500:     sp500[d] != null          ? parseFloat(((sp500[d]    / baseSp500 - 1) * 100).toFixed(2)) : null,
      ftse100:   ftse[d]  != null          ? parseFloat(((ftse[d]     / baseFtse  - 1) * 100).toFixed(2)) : null,
    }))
    .filter(p => p.portfolio != null || p.sp500 != null);

  // Absolute GBP value series for the £ Value chart
  const valueSeries = chartDates
    .filter(d => d >= portStartStr && portValues[d] != null)
    .map(d => ({ date: d, value: parseFloat(portValues[d].toFixed(2)) }));

  // Annual returns — year-by-year breakdown using the stable basket
  const annualReturns = [];
  const anchorYear = parseInt(anchor.slice(0, 4));
  const todayYear  = parseInt(todayStr.slice(0, 4));

  for (let year = anchorYear; year <= todayYear; year++) {
    // Start: anchor date for the first year, else first available date in Jan
    const winStart = year === anchorYear
      ? anchor
      : chartDates.find(d => d >= `${year}-01-01` && holdingsValues[d] != null);

    // End: last available date within this year
    const winEnd = chartDates
      .filter(d => d <= `${Math.min(year, todayYear)}-12-31` && d.startsWith(`${year}-`) && holdingsValues[d] != null)
      .pop();

    if (!winStart || !winEnd || winStart >= winEnd) continue;

    annualReturns.push({
      year,
      partial: year === anchorYear || year === todayYear,
      portfolio: parseFloat(((holdingsValues[winEnd] / holdingsValues[winStart] - 1) * 100).toFixed(2)),
      sp500:     sp500[winEnd] && sp500[winStart]
        ? parseFloat(((sp500[winEnd]  / sp500[winStart]  - 1) * 100).toFixed(2)) : null,
      ftse100:   ftse[winEnd] && ftse[winStart]
        ? parseFloat(((ftse[winEnd]   / ftse[winStart]   - 1) * 100).toFixed(2)) : null,
    });
  }

  return { series, valueSeries, annualReturns, period, startDate: anchor, endDate: todayStr };
}

module.exports = { getPortfolioPerformance, PERIOD_LABELS };
