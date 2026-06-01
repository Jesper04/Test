'use strict';

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

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

async function fetchHistory(ticker, fromStr, toStr) {
  try {
    const result = await yahooFinance.chart(
      ticker,
      { period1: fromStr, period2: toStr, interval: '1d' },
      { validateResult: false },
    );
    return { quotes: result?.quotes || [], currency: result?.meta?.currency ?? null };
  } catch {
    return { quotes: [], currency: null };
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

async function getPortfolioPerformance(transactions, period, deposits = []) {
  const today    = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const sortedTx    = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const firstTrade  = sortedTx[0].date;

  const benchStart  = periodStartDate(period, firstTrade);
  const benchStartStr = benchStart.toISOString().slice(0, 10);

  // Portfolio can't go before first trade
  const portStart = new Date(Math.max(benchStart.getTime(), new Date(firstTrade).getTime()));
  const portStartStr = portStart.toISOString().slice(0, 10);

  const tickers = [...new Set(sortedTx.map(t => t.ticker))];

  // Map ticker → currency from transactions
  const txCurrency = {};
  for (const tx of sortedTx) {
    if (!txCurrency[tx.ticker]) txCurrency[tx.ticker] = tx.currency || 'GBP';
  }

  const hasChf = Object.values(txCurrency).some(c => c === 'CHF');

  // Fetch everything in parallel — always daily, thinned server-side below.
  // GBPCAD=X is always fetched because Yahoo Finance may report a ticker in CAD
  // even when the broker stored it as GBP (e.g. CP converted by HL at execution).
  const [gbpUsdRes, gbpEurRes, gbpChfRes, gbpCadRes, sp500Res, ftseRes, ...tickerResults] = await Promise.all([
    fetchHistory('GBPUSD=X', benchStartStr, todayStr),
    fetchHistory('GBPEUR=X', benchStartStr, todayStr),
    hasChf ? fetchHistory('GBPCHF=X', benchStartStr, todayStr) : Promise.resolve({ quotes: [], currency: null }),
    fetchHistory('GBPCAD=X', benchStartStr, todayStr),
    fetchHistory('^GSPC',    benchStartStr, todayStr),
    fetchHistory('^FTSE',    benchStartStr, todayStr),
    ...tickers.map(t => fetchHistory(t, portStartStr, todayStr)),
  ]);

  // Build price maps from quotes
  const gbpUsdMap = toDateMap(gbpUsdRes.quotes);
  const gbpEurMap = toDateMap(gbpEurRes.quotes);
  const gbpChfMap = toDateMap(gbpChfRes.quotes);
  const gbpCadMap = toDateMap(gbpCadRes.quotes);
  const sp500Map  = toDateMap(sp500Res.quotes);
  const ftseMap   = toDateMap(ftseRes.quotes);

  const tickerMap = {};
  tickers.forEach((t, i) => { tickerMap[t] = toDateMap(tickerResults[i].quotes); });

  // Currency map from Yahoo Finance chart metadata — takes priority over the stored
  // transaction currency, which may say GBP when the broker pre-converted the amount
  // (e.g. CP stored as GBP by HL, but Yahoo Finance prices it natively in CAD).
  const chartCurrency = {};
  tickers.forEach((t, i) => { if (tickerResults[i].currency) chartCurrency[t] = tickerResults[i].currency; });

  // Gather all chart dates from benchmark data
  const sp500Quotes = sp500Res.quotes;
  const ftseQuotes  = ftseRes.quotes;
  const dateSet = new Set([
    ...sp500Quotes.map(r => r.date.toISOString().slice(0, 10)),
    ...ftseQuotes.map(r => r.date.toISOString().slice(0, 10)),
  ]);
  const allDates = [...dateSet].filter(d => d >= benchStartStr && d <= todayStr).sort();

  if (allDates.length === 0) return { series: [], period };

  // Thin daily points to avoid sending thousands of entries for long periods.
  // The last point is always kept so the terminal value is never dropped.
  const THIN_EVERY = {
    '1W': 1, '1M': 1,
    '6M': 5, 'YTD': 5, '1Y': 5,
    '3Y': 21, '5Y': 21, '10Y': 21, 'ALL': 21,
  };
  const step = THIN_EVERY[period] ?? 1;
  const chartDates = step === 1
    ? allDates
    : allDates.filter((_, i, arr) => i % step === 0 || i === arr.length - 1);

  // Forward-fill everything
  const gbpUsd = forwardFill(chartDates, gbpUsdMap);
  const gbpEur = forwardFill(chartDates, gbpEurMap);
  const gbpChf = forwardFill(chartDates, gbpChfMap);
  const gbpCad = forwardFill(chartDates, gbpCadMap);
  const sp500  = forwardFill(chartDates, sp500Map);
  const ftse   = forwardFill(chartDates, ftseMap);
  const tFilled = {};
  for (const t of tickers) tFilled[t] = forwardFill(chartDates, tickerMap[t]);

  // Helper: convert a native Yahoo Finance price to GBP.
  // chartCurrency[ticker] is used in preference to the stored transaction currency
  // because Yahoo Finance's chart metadata is authoritative about the native price currency.
  function toGbp(nativePrice, ticker, cur, d) {
    const c = chartCurrency[ticker] || cur;
    if (ticker.endsWith('.L') || c === 'GBp') return nativePrice / 100; // pence → pounds
    if (c === 'USD') return nativePrice / (gbpUsd[d] || 1.27);
    if (c === 'EUR') return nativePrice / (gbpEur[d] || 1.17);
    if (c === 'CHF') return nativePrice / (gbpChf[d] || 1.12);
    if (c === 'CAD') return nativePrice / (gbpCad[d] || 1.78);
    return nativePrice; // GBP, no conversion needed
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

  // Anchor: first date where the actual evolving portfolio has a value + both benchmarks
  const anchor = chartDates.find(d => portValues[d] != null && sp500[d] != null && ftse[d] != null);
  if (!anchor) return { series: [], valueSeries: [], period };

  const baseSp500 = sp500[anchor];
  const baseFtse  = ftse[anchor];

  // Time-weighted return: chain-link Modified Dietz sub-period returns so that cash
  // deposits do not inflate the cumulative line. Each sub-period strips out the net
  // new capital deployed (buys − sells), leaving only price appreciation.
  // Formula per period: factor = (EV − CF/2) / (BV + CF/2)
  // where CF = net new money entering the stock portfolio (buys positive, sells negative).
  const rawSeries = [];
  let cumFactor = 1.0;
  let prevD = null; // last chart date with a non-null portfolio value

  for (const d of chartDates.filter(d => d >= anchor)) {
    if (prevD !== null && portValues[d] != null) {
      const bv = portValues[prevD];
      const ev = portValues[d];

      let cf = 0;
      for (const tx of sortedTx) {
        if (tx.date > prevD && tx.date <= d) {
          cf += tx.action === 'BUY' ? tx.total : -tx.total;
        }
      }

      const denom = bv + cf / 2;
      if (denom > 0) cumFactor *= (ev - cf / 2) / denom;
    }

    if (portValues[d] != null) prevD = d;

    rawSeries.push({
      date:      d,
      portfolio: portValues[d] != null ? parseFloat(((cumFactor - 1) * 100).toFixed(2)) : null,
      sp500:     sp500[d] != null      ? parseFloat(((sp500[d] / baseSp500 - 1) * 100).toFixed(2)) : null,
      ftse100:   ftse[d]  != null      ? parseFloat(((ftse[d]  / baseFtse  - 1) * 100).toFixed(2)) : null,
    });
  }

  const series = rawSeries.filter(p => p.portfolio != null || p.sp500 != null);

  // Absolute GBP value series for the £ Value chart
  const valueSeries = chartDates
    .filter(d => d >= portStartStr && portValues[d] != null)
    .map(d => ({ date: d, value: parseFloat(portValues[d].toFixed(2)) }));

  // Annual returns using Modified Dietz — adjusts for net cash deployed each year
  // so large deposits don't inflate apparent returns
  const annualReturns = [];
  const firstTradeYear = parseInt(sortedTx[0].date.slice(0, 4));
  const todayYear      = parseInt(todayStr.slice(0, 4));

  for (let year = firstTradeYear; year <= todayYear; year++) {
    const winStart = year === firstTradeYear
      ? chartDates.find(d => d >= `${year}-01-01` && portValues[d] != null)
      : chartDates.filter(d => d <= `${year - 1}-12-31` && portValues[d] != null).pop();

    const winEnd = chartDates
      .filter(d => d <= `${year}-12-31` && d.startsWith(`${year}-`) && portValues[d] != null)
      .pop();

    if (!winStart || !winEnd || winStart >= winEnd) continue;

    // Net new money deployed into stocks this year (buys minus sells)
    // This is what actually entered portValues — not raw cash deposits
    let yearBuys = 0, yearSells = 0;
    for (const tx of sortedTx) {
      if (tx.date > winStart && tx.date <= winEnd) {
        if (tx.action === 'BUY') yearBuys += tx.total;
        else yearSells += tx.total;
      }
    }
    const netStockFlow = yearBuys - yearSells;

    const sv = portValues[winStart];
    const ev = portValues[winEnd];
    const denominator = sv + netStockFlow / 2;
    if (!sv || !ev || denominator <= 0) continue;

    if (year === 2024) {
      console.log(`\n[2024 ANNUAL] winStart=${winStart}  winEnd=${winEnd}`);
      console.log(`[2024 ANNUAL] sv=£${sv.toFixed(2)}  ev=£${ev.toFixed(2)}`);
      console.log(`[2024 ANNUAL] yearBuys=£${yearBuys.toFixed(2)}  yearSells=£${yearSells.toFixed(2)}  netStockFlow=£${netStockFlow.toFixed(2)}`);
      console.log(`[2024 ANNUAL] denominator=£${denominator.toFixed(2)}  numerator=£${(ev - sv - netStockFlow).toFixed(2)}`);
      console.log(`[2024 ANNUAL] return=${((ev - sv - netStockFlow) / denominator * 100).toFixed(4)}%`);
      // Per-holding breakdown at both boundaries
      const snap = holdingsAt(sortedTx, winEnd);
      console.log('[2024 ANNUAL] Holdings contributing to portValues:');
      for (const [ticker, shares] of Object.entries(holdingsAt(sortedTx, winStart))) {
        if (shares <= 0.0001) continue;
        const nativeStart = tFilled[ticker]?.[winStart];
        const gbpStart    = nativeStart != null ? toGbp(nativeStart, ticker, txCurrency[ticker] || 'GBP', winStart) : null;
        console.log(`  START  ${ticker.padEnd(10)} shares=${shares.toFixed(4)}  native=${nativeStart?.toFixed(4) ?? 'null'}  gbp=${gbpStart?.toFixed(4) ?? 'null'}  value=£${gbpStart != null ? (shares * gbpStart).toFixed(2) : 'null'}  chartCur=${chartCurrency[ticker] ?? '(none)'}`);
      }
      for (const [ticker, shares] of Object.entries(snap)) {
        if (shares <= 0.0001) continue;
        const nativeEnd = tFilled[ticker]?.[winEnd];
        const gbpEnd    = nativeEnd != null ? toGbp(nativeEnd, ticker, txCurrency[ticker] || 'GBP', winEnd) : null;
        console.log(`  END    ${ticker.padEnd(10)} shares=${shares.toFixed(4)}  native=${nativeEnd?.toFixed(4) ?? 'null'}  gbp=${gbpEnd?.toFixed(4) ?? 'null'}  value=£${gbpEnd != null ? (shares * gbpEnd).toFixed(2) : 'null'}  chartCur=${chartCurrency[ticker] ?? '(none)'}`);
      }
      console.log('');
    }

    // Per-holding breakdown for top/bottom performers this year
    const startHoldings = holdingsAt(sortedTx, winStart);
    const holdingReturns = [];
    for (const [ticker, shares] of Object.entries(startHoldings)) {
      if (shares <= 0.0001) continue;
      const sp = tFilled[ticker]?.[winStart];
      const ep = tFilled[ticker]?.[winEnd];
      if (!sp || !ep) continue;
      holdingReturns.push({ ticker, return: parseFloat(((ep / sp - 1) * 100).toFixed(2)) });
    }
    holdingReturns.sort((a, b) => b.return - a.return);
    const n = holdingReturns.length;
    const topHoldings    = holdingReturns.slice(0, Math.min(3, n));
    const bottomHoldings = n > 3 ? [...holdingReturns].slice(Math.max(n - 3, 3)).reverse() : [];

    annualReturns.push({
      year,
      partial: year === firstTradeYear || year === todayYear,
      portfolio: parseFloat(((ev - sv - netStockFlow) / denominator * 100).toFixed(2)),
      sp500:   sp500[winEnd] && sp500[winStart]
        ? parseFloat(((sp500[winEnd]  / sp500[winStart]  - 1) * 100).toFixed(2)) : null,
      ftse100: ftse[winEnd]  && ftse[winStart]
        ? parseFloat(((ftse[winEnd]   / ftse[winStart]   - 1) * 100).toFixed(2)) : null,
      topHoldings,
      bottomHoldings,
    });
  }

  return { series, valueSeries, annualReturns, period, startDate: anchor, endDate: todayStr };
}

module.exports = { getPortfolioPerformance, PERIOD_LABELS };
