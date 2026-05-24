'use strict';

const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DAYS_PER_YEAR = 365.25;

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

async function analysePortfolio(transactions) {
  const today = new Date().toISOString().slice(0, 10);

  // ── 1. Sort dates ────────────────────────────────────────
  const sortedDates = [...transactions].map(t => t.date).sort();
  const firstTradeDate = sortedDates[0];
  const lastTradeDate  = sortedDates[sortedDates.length - 1];

  // ── 2. Aggregate net holdings and cost basis ─────────────
  const holdingsMap = {}; // ticker → { shares, costBasisGbp, currency, currencySymbol }
  let totalCostGbp = 0;

  for (const tx of transactions) {
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
      h.costBasisGbp += tx.total; // total is already in GBP (HL prices in GBP)
      totalCostGbp   += tx.total;
    } else {
      h.shares       -= tx.shares;
      h.costBasisGbp -= tx.total;
      totalCostGbp   -= tx.total;
    }
  }

  const currentHoldings = Object.values(holdingsMap).filter(h => h.shares > 0.0001);

  // ── 3. Fetch historical FX rates (GBPUSD, GBPEUR) ────────
  const hasUsd = transactions.some(t => t.currency === 'USD');
  const hasEur = transactions.some(t => t.currency === 'EUR');

  const [gbpUsdHistory, gbpEurHistory, currentGbpUsd, currentGbpEur] = await Promise.all([
    hasUsd ? fetchFxHistory('GBPUSD=X', firstTradeDate, today) : Promise.resolve({}),
    hasEur ? fetchFxHistory('GBPEUR=X', firstTradeDate, today) : Promise.resolve({}),
    safeQuote('GBPUSD=X'),
    safeQuote('GBPEUR=X'),
  ]);

  const liveGbpUsd = currentGbpUsd?.regularMarketPrice ?? 1.27;
  const liveGbpEur = currentGbpEur?.regularMarketPrice ?? 1.17;

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
      enrichedHoldings.push({ ...holding, currentPriceGbp: null, currentValueGbp: null, name: holding.ticker });
      continue;
    }

    // Convert to GBP
    let currentPriceGbp;
    const cur = quote.currency;
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

  // ── 6. Portfolio CAGR ────────────────────────────────────
  const years = (new Date(today) - new Date(firstTradeDate)) / (MS_PER_DAY * DAYS_PER_YEAR);
  let portfolioCagr = null, portfolioCagrPct = null;

  if (totalCostGbp > 0 && totalCurrentValueGbp > 0 && years > 0) {
    const raw = Math.pow(totalCurrentValueGbp / totalCostGbp, 1 / years) - 1;
    portfolioCagr    = parseFloat(raw.toFixed(4));
    portfolioCagrPct = `${(portfolioCagr * 100).toFixed(2)}%`;
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
  if (portfolioCagr !== null) {
    benchmarks.unshift({
      label: 'Your Portfolio',
      cagr: portfolioCagr,
      cagrPct: portfolioCagrPct,
      value: parseFloat((portfolioCagr * 100).toFixed(2)),
      color: '#C4A96A',
    });
  }

  return {
    holdings: enrichedHoldings,
    enrichedTransactions,
    metrics: {
      totalValueGbp: parseFloat(totalCurrentValueGbp.toFixed(2)),
      totalCostGbp:  parseFloat(totalCostGbp.toFixed(2)),
      gainLossGbp:   parseFloat((totalCurrentValueGbp - totalCostGbp).toFixed(2)),
      gainLossPct:   totalCostGbp > 0
        ? parseFloat(((totalCurrentValueGbp - totalCostGbp) / totalCostGbp * 100).toFixed(2))
        : 0,
      portfolioCagr,
      portfolioCagrPct,
      years: parseFloat(years.toFixed(2)),
      firstTradeDate,
      asOf: today,
    },
    benchmarks,
  };
}

module.exports = { analysePortfolio };
