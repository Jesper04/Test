'use strict';

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_YEAR = 365.25;

function xirr(cashflows) {
  if (cashflows.length < 2) return null;
  const t0 = cashflows[0].date.getTime();
  const yrs = cf => (cf.date.getTime() - t0) / (365.25 * 86400000);
  let rate = 0.1;
  for (let i = 0; i < 300; i++) {
    let f = 0, df = 0;
    for (const cf of cashflows) {
      const t  = yrs(cf);
      const pv = Math.pow(1 + rate, t);
      f  += cf.amount / pv;
      df -= t * cf.amount / (pv * (1 + rate));
    }
    if (Math.abs(df) < 1e-10) break;
    const step = f / df;
    rate -= step;
    if (rate <= -1) { rate = -0.9999; break; }
    if (Math.abs(step) < 1e-8) break;
  }
  let check = 0;
  for (const cf of cashflows) {
    check += cf.amount / Math.pow(1 + rate, yrs(cf));
  }
  const totalInvested = cashflows.reduce((s, cf) => s + Math.abs(cf.amount), 0);
  return Math.abs(check) < totalInvested * 0.001 ? rate : null;
}

async function safeQuote(ticker) {
  try {
    const q = await yahooFinance.quote(
      ticker,
      { fields: ['regularMarketPrice', 'currency', 'longName', 'shortName'] },
      { validateResult: false },
    );
    return q?.regularMarketPrice != null ? q : null;
  } catch {
    return null;
  }
}

async function fetchTickerDividends(ticker, fromStr, toStr) {
  try {
    const result = await yahooFinance.chart(
      ticker,
      { period1: fromStr, period2: toStr, events: 'dividends' },
      { validateResult: false },
    );
    return result?.events?.dividends || [];
  } catch {
    return [];
  }
}

async function safePriceOnDate(ticker, dateStr) {
  try {
    const from = new Date(dateStr);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    const rows = await yahooFinance.historical(ticker, {
      period1: from.toISOString().slice(0, 10),
      period2: to.toISOString().slice(0, 10),
      interval: '1d',
    });
    return rows?.[0]?.close ?? null;
  } catch {
    return null;
  }
}

// Fetch a date-indexed map of FX rates for a currency pair over a range
async function fetchFxHistory(fxTicker, fromDate, toDate) {
  try {
    const from = new Date(fromDate);
    const to = new Date(toDate);
    to.setDate(to.getDate() + 7); // safety buffer
    const rows = await yahooFinance.historical(fxTicker, {
      period1: from.toISOString().slice(0, 10),
      period2: to.toISOString().slice(0, 10),
      interval: '1d',
    });
    const map = {};
    for (const row of rows) {
      map[row.date.toISOString().slice(0, 10)] = row.close;
    }
    return map;
  } catch {
    return {};
  }
}

function closestFxRate(fxMap, dateStr) {
  if (fxMap[dateStr]) return fxMap[dateStr];
  // Look ahead up to 5 days (weekend/holiday)
  const d = new Date(dateStr);
  for (let i = 1; i <= 5; i++) {
    d.setDate(d.getDate() + 1);
    const key = d.toISOString().slice(0, 10);
    if (fxMap[key]) return fxMap[key];
  }
  return null;
}

async function analysePortfolio(transactions, dividends = []) {
  const today = new Date().toISOString().slice(0, 10);

  // ── 1. Sort dates ────────────────────────────────────────
  const sortedDates = [...transactions].map(t => t.date).sort();
  const firstTradeDate = sortedDates[0];
  const lastTradeDate  = sortedDates[sortedDates.length - 1];

  // ── 2. Aggregate net holdings and cost basis ─────────────
  const holdingsMap = {}; // ticker → { shares, costBasisGbp, currency, currencySymbol }
  let totalBuyGbp          = 0; // total cash ever invested
  let totalSaleProceedsGbp = 0; // total cash received from sells
  let realizedGainLossGbp  = 0; // realized P&L from closed positions

  const sortedTransactions = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

  for (const tx of sortedTransactions) {
    if (!holdingsMap[tx.ticker]) {
      holdingsMap[tx.ticker] = {
        ticker: tx.ticker,
        currency: tx.currency || 'GBP',
        currencySymbol: tx.currencySymbol || '£',
        shares: 0,
        costBasisGbp: 0,
      };
    }
    const h = holdingsMap[tx.ticker];
    if (tx.action === 'BUY') {
      h.shares       += tx.shares;
      h.costBasisGbp += tx.total;
      totalBuyGbp    += tx.total;
    } else {
      const costPerShare     = h.shares > 0 ? h.costBasisGbp / h.shares : 0;
      const costOfSoldShares = costPerShare * tx.shares;
      h.shares             -= tx.shares;
      h.costBasisGbp       -= costOfSoldShares;
      totalSaleProceedsGbp += tx.total;
      realizedGainLossGbp  += (tx.total - costOfSoldShares);
    }
  }

  const currentHoldings = Object.values(holdingsMap).filter(h => h.shares > 0.0001);

  // ── 3. Fetch historical FX rates (GBPUSD, GBPEUR) ────────
  const hasUsd = transactions.some(t => t.currency === 'USD');
  const hasEur = transactions.some(t => t.currency === 'EUR');
  const hasChf = transactions.some(t => t.currency === 'CHF');

  const [gbpUsdHistory, gbpEurHistory, gbpChfHistory, currentGbpUsd, currentGbpEur] = await Promise.all([
    hasUsd ? fetchFxHistory('GBPUSD=X', firstTradeDate, today) : Promise.resolve({}),
    hasEur ? fetchFxHistory('GBPEUR=X', firstTradeDate, today) : Promise.resolve({}),
    hasChf ? fetchFxHistory('GBPCHF=X', firstTradeDate, today) : Promise.resolve({}),
    safeQuote('GBPUSD=X'),
    safeQuote('GBPEUR=X'),
  ]);

  const liveGbpUsd = currentGbpUsd?.regularMarketPrice ?? 1.27;
  const liveGbpEur = currentGbpEur?.regularMarketPrice ?? 1.17;

  // ── 3b. Fetch dividend history for all tickers ───────────
  const allTickers = [...new Set(sortedTransactions.map(t => t.ticker))];
  const tickerCurrency = {};
  for (const tx of sortedTransactions) {
    if (!tickerCurrency[tx.ticker]) tickerCurrency[tx.ticker] = tx.currency || 'GBP';
  }

  const divResults = await Promise.all(
    allTickers.map(ticker => fetchTickerDividends(ticker, firstTradeDate, today))
  );

  const tickerDivMap = {};
  allTickers.forEach((ticker, i) => { tickerDivMap[ticker] = divResults[i]; });

  // Build dividend cash flows in GBP
  let totalDividendsGbp = 0;
  const dividendCashflows = [];

  for (const ticker of allTickers) {
    const divs = tickerDivMap[ticker];
    if (!divs.length) continue;
    const cur = tickerCurrency[ticker];

    for (const div of divs) {
      const divDate = div.date.toISOString().slice(0, 10);

      // Shares held on this ex-div date
      let sharesHeld = 0;
      for (const tx of sortedTransactions) {
        if (tx.ticker === ticker && tx.date <= divDate)
          sharesHeld += tx.action === 'BUY' ? tx.shares : -tx.shares;
      }
      if (sharesHeld <= 0.0001) continue;

      // Convert dividend per share → GBP
      let divGbp;
      if (ticker.endsWith('.L')) {
        divGbp = (div.amount / 100) * sharesHeld;           // GBp → GBP
      } else if (cur === 'USD') {
        const rate = closestFxRate(gbpUsdHistory, divDate) || liveGbpUsd;
        divGbp = (div.amount / rate) * sharesHeld;
      } else if (cur === 'EUR') {
        const rate = closestFxRate(gbpEurHistory, divDate) || liveGbpEur;
        divGbp = (div.amount / rate) * sharesHeld;
      } else if (cur === 'CHF') {
        const rate = closestFxRate(gbpChfHistory, divDate) || 1.12;
        divGbp = (div.amount / rate) * sharesHeld;
      } else {
        divGbp = div.amount * sharesHeld;
      }

      totalDividendsGbp += divGbp;
      dividendCashflows.push({ amount: divGbp, date: new Date(divDate + 'T00:00:00Z') });
    }
  }

  // ── 4. Enrich transactions with native (USD/EUR) price ───
  const enrichedTransactions = transactions.map(tx => {
    if (tx.currency === 'USD') {
      const rate = closestFxRate(gbpUsdHistory, tx.date);
      const nativePrice = rate ? parseFloat((tx.pricePerShare * rate).toFixed(4)) : null;
      return { ...tx, priceNative: nativePrice, fxRate: rate };
    }
    if (tx.currency === 'EUR') {
      const rate = closestFxRate(gbpEurHistory, tx.date);
      const nativePrice = rate ? parseFloat((tx.pricePerShare * rate).toFixed(4)) : null;
      return { ...tx, priceNative: nativePrice, fxRate: rate };
    }
    return { ...tx, priceNative: tx.pricePerShare, fxRate: 1 };
  });

  // ── 5. Fetch current prices for all active holdings ──────
  const quoteResults = await Promise.allSettled(
    currentHoldings.map(h => safeQuote(h.ticker))
  );

  let totalCurrentValueGbp = 0;
  const enrichedHoldings = [];

  for (let i = 0; i < currentHoldings.length; i++) {
    const holding = currentHoldings[i];
    const quote = quoteResults[i].status === 'fulfilled' ? quoteResults[i].value : null;

    if (!quote) {
      console.log(`[HOLDING] ${holding.ticker}: no quote returned`);
      enrichedHoldings.push({ ...holding, currentPriceGbp: null, currentValueGbp: null, name: holding.ticker });
      continue;
    }

    // Convert to GBP
    let currentPriceGbp;
    const cur = quote.currency;
    console.log(`[HOLDING] ${holding.ticker}: price=${quote.regularMarketPrice} currency=${cur} shares=${holding.shares} costBasis=${holding.costBasisGbp.toFixed(2)} liveGbpUsd=${liveGbpUsd}`);
    if (cur === 'GBp') {
      currentPriceGbp = quote.regularMarketPrice / 100;
    } else if (cur === 'USD') {
      currentPriceGbp = quote.regularMarketPrice / liveGbpUsd;
    } else if (cur === 'EUR') {
      currentPriceGbp = quote.regularMarketPrice / liveGbpEur;
    } else {
      currentPriceGbp = quote.regularMarketPrice; // assume GBP
    }

    const currentValueGbp = holding.shares * currentPriceGbp;
    totalCurrentValueGbp += currentValueGbp;

    enrichedHoldings.push({
      ticker: holding.ticker,
      name: quote.longName || quote.shortName || holding.ticker,
      shares: holding.shares,
      currency: cur === 'GBp' ? 'GBP' : (cur || holding.currency),
      currentPriceNative: quote.regularMarketPrice,
      currentPriceGbp,
      currentValueGbp,
      costBasisGbp: holding.costBasisGbp,
      gainLossGbp: currentValueGbp - holding.costBasisGbp,
      gainLossPct: holding.costBasisGbp > 0
        ? ((currentValueGbp - holding.costBasisGbp) / holding.costBasisGbp) * 100
        : 0,
    });
  }

  // Add portfolio weight %
  for (const h of enrichedHoldings) {
    h.weight = totalCurrentValueGbp > 0 ? (h.currentValueGbp / totalCurrentValueGbp) * 100 : 0;
  }
  enrichedHoldings.sort((a, b) => (b.currentValueGbp ?? 0) - (a.currentValueGbp ?? 0));

  // ── 6. MWRR via XIRR (accounts for timing and size of every trade + dividends) ──
  const years = (new Date(today) - new Date(firstTradeDate)) / (MS_PER_DAY * DAYS_PER_YEAR);
  let portfolioMwrr = null, portfolioMwrrPct = null;

  const cashflows = [
    ...sortedTransactions.map(tx => ({
      amount: tx.action === 'BUY' ? -tx.total : tx.total,
      date:   new Date(tx.date + 'T00:00:00Z'),
    })),
    ...dividendCashflows,
  ].sort((a, b) => a.date - b.date);

  if (totalCurrentValueGbp > 0) {
    cashflows.push({ amount: totalCurrentValueGbp, date: new Date(today + 'T00:00:00Z') });
  }

  console.log('[XIRR] cashflow count:', cashflows.length,
    '| first:', cashflows[0]?.amount?.toFixed(2), cashflows[0]?.date?.toISOString().slice(0,10),
    '| last:', cashflows[cashflows.length-1]?.amount?.toFixed(2), cashflows[cashflows.length-1]?.date?.toISOString().slice(0,10),
    '| totalCurrentValueGbp:', totalCurrentValueGbp.toFixed(2));

  portfolioMwrr = xirr(cashflows);
  console.log('[XIRR] result:', portfolioMwrr);
  if (portfolioMwrr !== null) {
    portfolioMwrrPct = `${(portfolioMwrr * 100).toFixed(2)}%`;
  }

  // ── 7. Benchmark CAGRs (same period as portfolio) ────────
  const benchmarkDefs = [
    { label: 'S&P 500',   ticker: '^GSPC', color: '#78A896' },
    { label: 'FTSE 100',  ticker: '^FTSE', color: '#8896A8' },
  ];

  const benchmarkResults = await Promise.allSettled(
    benchmarkDefs.map(async (b) => {
      const [startPrice, endPrice] = await Promise.all([
        safePriceOnDate(b.ticker, firstTradeDate),
        safePriceOnDate(b.ticker, today),
      ]);
      if (!startPrice || !endPrice || years <= 0) return { ...b, cagr: null };
      const raw  = Math.pow(endPrice / startPrice, 1 / years) - 1;
      const cagr = parseFloat(raw.toFixed(4));
      return { ...b, cagr, cagrPct: `${(cagr * 100).toFixed(2)}%`, value: parseFloat((cagr * 100).toFixed(2)) };
    })
  );

  const benchmarks = benchmarkResults
    .filter(r => r.status === 'fulfilled' && r.value.cagr !== null)
    .map(r => r.value);

  // Add portfolio to benchmark chart
  if (portfolioMwrr !== null) {
    benchmarks.unshift({
      label: 'Your Portfolio',
      cagr: portfolioMwrr,
      cagrPct: portfolioMwrrPct,
      value: parseFloat((portfolioMwrr * 100).toFixed(2)),
      color: '#C4A96A',
    });
  }

  const totalGainLossGbp = totalCurrentValueGbp + totalSaleProceedsGbp + totalDividendsGbp - totalBuyGbp;

  return {
    holdings: enrichedHoldings,
    enrichedTransactions,
    metrics: {
      totalValueGbp:       parseFloat(totalCurrentValueGbp.toFixed(2)),
      totalCostGbp:        parseFloat(totalBuyGbp.toFixed(2)),
      gainLossGbp:         parseFloat(totalGainLossGbp.toFixed(2)),
      gainLossPct:         totalBuyGbp > 0
        ? parseFloat((totalGainLossGbp / totalBuyGbp * 100).toFixed(2))
        : 0,
      realizedGainLossGbp: parseFloat(realizedGainLossGbp.toFixed(2)),
      totalDividendsGbp:   parseFloat(totalDividendsGbp.toFixed(2)),
      portfolioMwrr,
      portfolioMwrrPct,
      years: parseFloat(years.toFixed(2)),
      firstTradeDate,
      asOf: today,
    },
    benchmarks,
  };
}

module.exports = { analysePortfolio };
