import { useRef, useState, useEffect } from 'react'
import PerformanceChart from './components/PerformanceChart'

const NAV = [
  { id: 'overview',   label: 'Overview',       active: true },
  { id: 'uploads',    label: 'Uploads' },
  { id: 'holdings',   label: 'Holdings' },
  { id: 'benchmarks', label: 'Benchmarks' },
  { id: 'analytics',  label: 'Deep Analytics', premium: true },
]

const BROKERS = 'Freetrade · Trading 212 · IBKR · Hargreaves Lansdown · Vanguard'

const DEMO_TRANSACTIONS = [
  { date: '16 May 2026', ticker: 'AAPL', action: 'BUY',  qty: 10,  price: '£155.32', total: '£1,553.20' },
  { date: '14 May 2026', ticker: 'VUSA', action: 'BUY',  qty: 5,   price: '£34.21',  total: '£171.05'   },
  { date: '12 May 2026', ticker: 'HSBA', action: 'BUY',  qty: 20,  price: '£15.70',  total: '£314.00'   },
  { date: '08 May 2026', ticker: 'AAPL', action: 'BUY',  qty: 32,  price: '£142.10', total: '£4,547.20' },
]

const DEMO_METRICS = [
  { label: 'MWRR',              value: '—',  change: 'Upload a CSV to calculate',  positive: true },
  { label: 'Portfolio Value',   value: '—',  change: 'Upload a CSV to calculate',  positive: true },
  { label: 'Total Gain / Loss', value: '—',  change: 'Upload a CSV to calculate',  positive: true },
]

const DEMO_HOLDINGS = [
  { ticker: 'AAPL', name: 'Apple Inc.',           qty: 42,  value: '—', weight: 29.0, change: '—', up: true  },
  { ticker: 'VUSA', name: 'Vanguard S&P 500 ETF', qty: 120, value: '—', weight: 48.6, change: '—', up: true  },
  { ticker: 'HSBA', name: 'HSBC Holdings',         qty: 260, value: '—', weight: 22.4, change: '—', up: false },
]

const DEMO_BENCHMARKS = [
  { label: 'Your Portfolio', value: 0, color: '#C4A96A' },
  { label: 'S&P 500',        value: 0, color: '#78A896' },
  { label: 'FTSE 100',       value: 0, color: '#8896A8' },
]

function TelescopeIcon({ className = '' }) {
  return (
    <svg className={`telescope-icon${className ? ` ${className}` : ''}`} viewBox="0 0 44 44"
      fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 12 L38 16 L38 20 L7 18 Z" />
      <circle cx="7" cy="15" r="5" />
      <path d="M38 16 L40 15 L40 21 L38 20" />
      <circle cx="23" cy="21.5" r="2.5" />
      <line x1="23" y1="24" x2="23" y2="27" />
      <line x1="23" y1="27" x2="9"  y2="41" />
      <line x1="23" y1="27" x2="23" y2="41" />
      <line x1="23" y1="27" x2="37" y2="41" />
      <line x1="14" y1="36" x2="32" y2="36" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg className="upload-icon" width="44" height="44" viewBox="0 0 44 44"
      fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 10.5A2.5 2.5 0 0111.5 8H27l8 8v17.5A2.5 2.5 0 0132.5 36h-21A2.5 2.5 0 019 33.5V10.5z" />
      <path d="M27 8v8h8" />
      <path d="M22 29v-9M18 24l4-4 4 4" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="spinner" width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <circle cx="22" cy="22" r="16" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.15" />
      <path d="M22 6 A16 16 0 0 1 38 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function fmt(n, symbol = '£', decimals = 2) {
  return `${symbol}${Number(n).toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

function fmtDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function App() {
  const fileInputRef = useRef(null)

  const [dragActive, setDragActive] = useState(false)
  const [status, setStatus]         = useState('idle') // idle | parsing | analysing | done | error
  const [parseData, setParseData]   = useState(null)
  const [analysis, setAnalysis]     = useState(null)
  const [errorMsg, setErrorMsg]     = useState('')

  useEffect(() => {
    fetch('/api/portfolio/stored')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.transactions?.length) return
        setParseData(data)
        setStatus('analysing')
        fetch('/api/portfolio/analyse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transactions: data.transactions, dividends: data.dividends || [] }),
        })
          .then(r => r.json())
          .then(a => { setAnalysis(a); setStatus('done') })
          .catch(() => setStatus('done'))
      })
      .catch(() => {})
  }, [])

  async function parseJsonResponse(res) {
    const text = await res.text()
    if (!text) return null

    try {
      return JSON.parse(text)
    } catch (err) {
      throw new Error(`Invalid server response: ${text}`)
    }
  }

  async function uploadFile(file) {
    if (!file || !file.name.toLowerCase().endsWith('.csv')) {
      setErrorMsg('Please upload a CSV file.')
      setStatus('error')
      return
    }

    setStatus('parsing')
    setErrorMsg('')

    // Step 1: Parse CSV with AI
    let parsed
    try {
      const form = new FormData()
      form.append('file', file)
      const res  = await fetch('/api/parse-csv', { method: 'POST', body: form })
      const data = await parseJsonResponse(res)
      if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`)
      if (!data) throw new Error('Server returned empty response for CSV parsing')
      parsed = data
      setParseData(data)
    } catch (err) {
      setErrorMsg(err.message || 'CSV parsing failed')
      setStatus('error')
      return
    }

    // Step 2: Analyse portfolio (prices, CAGR, benchmarks)
    setStatus('analysing')
    try {
      const res  = await fetch('/api/portfolio/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: parsed.transactions, dividends: parsed.dividends || [] }),
      })
      const data = await parseJsonResponse(res)
      if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`)
      setAnalysis(data)
      setStatus('done')
    } catch (err) {
      // Analysis failed but parse succeeded — still show transactions
      setStatus('done')
    }
  }

  function handleInputChange(e) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  function handleDragOver(e)  { e.preventDefault(); setDragActive(true) }
  function handleDragLeave(e) { if (!e.currentTarget.contains(e.relatedTarget)) setDragActive(false) }
  function handleDrop(e)      { e.preventDefault(); setDragActive(false); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f) }

  function reset() { setStatus('idle'); setParseData(null); setAnalysis(null); setErrorMsg('') }

  const loading   = status === 'parsing' || status === 'analysing'
  const isDone    = status === 'done'
  const isError   = status === 'error'

  // ── Derived display data ───────────────────────────────
  const transactions = parseData
    ? (analysis?.enrichedTransactions ?? parseData.transactions).map(tx => ({
        date:        fmtDate(tx.date),
        ticker:      tx.ticker,
        action:      tx.action,
        qty:         tx.shares,
        price:       tx.priceNative != null
          ? fmt(tx.priceNative, tx.currencySymbol || '£')
          : fmt(tx.pricePerShare, '£'),
        total:       fmt(tx.total, '£'),
        currency:    tx.currency || 'GBP',
      }))
    : DEMO_TRANSACTIONS

  const holdings = analysis?.holdings?.length
    ? analysis.holdings.slice(0, 8).map(h => ({
        ticker: h.ticker,
        name:   h.name,
        qty:    h.shares % 1 === 0 ? h.shares : h.shares.toFixed(4),
        value:  h.currentValueGbp != null ? fmt(h.currentValueGbp) : '—',
        weight: h.weight ?? 0,
        change: h.gainLossPct != null ? `${h.gainLossPct >= 0 ? '+' : ''}${h.gainLossPct.toFixed(2)}%` : '—',
        up:     (h.gainLossPct ?? 0) >= 0,
      }))
    : DEMO_HOLDINGS

  const metrics = analysis?.metrics
    ? [
        {
          label:    'MWRR',
          value:    analysis.metrics.portfolioMwrrPct ?? '—',
          change:   `Over ${analysis.metrics.years} years`,
          positive: (analysis.metrics.portfolioMwrr ?? 0) >= 0,
        },
        {
          label:    'Portfolio Value',
          value:    fmt(analysis.metrics.totalValueGbp),
          change:   `Cost basis ${fmt(analysis.metrics.totalCostGbp)}`,
          positive: true,
        },
        {
          label:    'Total Gain / Loss',
          value:    fmt(analysis.metrics.gainLossGbp),
          change:   `${analysis.metrics.gainLossPct >= 0 ? '+' : ''}${analysis.metrics.gainLossPct.toFixed(2)}% · ${analysis.metrics.realizedGainLossGbp >= 0 ? '+' : ''}${fmt(analysis.metrics.realizedGainLossGbp)} realized`,
          positive: analysis.metrics.gainLossGbp >= 0,
        },
      ]
    : DEMO_METRICS

  const benchmarks = analysis?.benchmarks?.length ? analysis.benchmarks : DEMO_BENCHMARKS
  const maxBenchVal = Math.max(...benchmarks.map(b => Math.abs(b.value ?? 0)), 1)

  return (
    <div className="shell">

      {/* ── Top navigation ─────────────────────────────── */}
      <nav className="topnav" role="navigation" aria-label="Main">
        <div className="nav-brand">
          <TelescopeIcon />
          <span className="nav-brand-name">Reodor</span>
        </div>
        <div className="nav-sep" aria-hidden="true" />
        <div className="nav-links">
          {NAV.map(item => (
            <button key={item.id} className={`nav-link${item.active ? ' nav-link--active' : ''}`}
              aria-current={item.active ? 'page' : undefined}>
              {item.label}
              {item.premium && <span className="nav-badge">PRO</span>}
            </button>
          ))}
        </div>
        <div className="nav-actions">
          <button className="nav-pro-btn">Join Pro</button>
          <div className="avatar" aria-label="Account">J</div>
        </div>
      </nav>

      {/* ── Main content ───────────────────────────────── */}
      <main className="main">

        <header className="page-header">
          <h1 className="page-title">Portfolio Intelligence</h1>
          <p className="page-sub">Upload any broker statement. The AI handles the rest.</p>
        </header>

        {/* ── Upload zone ─────────────────────────────── */}
        <div
          className={`upload-zone${dragActive ? ' upload-zone--drag' : ''}${loading ? ' upload-zone--loading' : ''}`}
          onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          onClick={() => !loading && fileInputRef.current?.click()}
          role="button" tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && !loading && fileInputRef.current?.click()}
          aria-label="Upload CSV file"
        >
          <input ref={fileInputRef} id="csv-upload" type="file" accept=".csv"
            style={{ display: 'none' }} onChange={handleInputChange} />
          <TelescopeIcon className="upload-bg-icon" />

          {status === 'parsing' && (
            <><Spinner />
              <h2 className="upload-heading">Reading your CSV…</h2>
              <p className="upload-sub">The AI is mapping columns and detecting currency.</p></>
          )}

          {status === 'analysing' && (
            <><Spinner />
              <h2 className="upload-heading">Fetching live prices…</h2>
              <p className="upload-sub">Calculating CAGR and pulling benchmark data from Yahoo Finance.</p></>
          )}

          {isDone && (
            <><UploadIcon />
              <h2 className="upload-heading">
                {parseData.transactions.length} transactions parsed
                {parseData.currency && parseData.currency !== 'UNKNOWN' ? ` · ${parseData.currency}` : ''}
                {analysis ? ` · ${fmt(analysis.metrics.totalValueGbp)} portfolio` : ''}
              </h2>
              {parseData.parseWarnings?.length > 0 && (
                <p className="upload-sub upload-warnings">{parseData.parseWarnings.join(' · ')}</p>
              )}
              <div className="upload-cta">
                <button className="btn btn--ghost" onClick={e => { e.stopPropagation(); reset() }}>Upload another</button>
              </div></>
          )}

          {isError && (
            <><UploadIcon />
              <h2 className="upload-heading">Upload failed</h2>
              <p className="upload-sub upload-error">{errorMsg}</p>
              <div className="upload-cta">
                <button className="btn btn--primary" onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>Try again</button>
                <button className="btn btn--ghost"   onClick={e => { e.stopPropagation(); reset() }}>Dismiss</button>
              </div></>
          )}

          {status === 'idle' && (
            <><UploadIcon />
              <h2 className="upload-heading">Drop your broker CSV here</h2>
              <p className="upload-sub">
                No formatting required. The model reads any export and identifies tickers,
                prices, quantities and dates — automatically.
              </p>
              <p className="broker-list">{BROKERS}</p>
              <div className="upload-cta">
                <button className="btn btn--primary" onClick={e => { e.stopPropagation(); fileInputRef.current?.click() }}>Choose file</button>
                <button className="btn btn--ghost"   onClick={e => e.stopPropagation()}>Load demo</button>
              </div></>
          )}
        </div>

        <div className="section-divider">
          <span className="section-divider-label">{isDone ? 'Your portfolio' : 'Sample output'}</span>
          <span className="section-divider-hint">
            {isDone
              ? `As of today · first trade ${analysis?.metrics?.firstTradeDate ? fmtDate(analysis.metrics.firstTradeDate) : ''}`
              : 'Upload a statement to see your real returns'}
          </span>
        </div>

        {/* ── Performance chart ───────────────────────── */}
        {isDone && parseData?.transactions?.length > 0 && (
          <PerformanceChart transactions={parseData.transactions} deposits={parseData.deposits || []} />
        )}

        {/* ── Metrics ─────────────────────────────────── */}
        <section className="metrics-row" aria-label="Key metrics">
          {metrics.map(m => (
            <article key={m.label} className="metric-tile">
              <p className="metric-label">{m.label}</p>
              <p className="metric-value">{m.value}</p>
              <p className={`metric-change ${m.positive ? 'positive' : 'negative'}`}>{m.change}</p>
            </article>
          ))}
        </section>

        <div className="two-col">
          {/* ── Holdings ──────────────────────────────── */}
          <article className="card">
            <div className="card-header">
              <h2 className="card-title">Holdings</h2>
              <span className="card-meta">{isDone ? 'live prices' : 'demo'}</span>
            </div>
            <div className="holdings-table">
              <div className="holdings-thead" aria-hidden="true">
                <span>Ticker</span><span>Qty</span><span>Value</span><span>Weight</span><span>P&amp;L</span>
              </div>
              {holdings.map(h => (
                <div key={h.ticker} className="holdings-row">
                  <div>
                    <span className="ticker">{h.ticker}</span>
                    <span className="holding-name">{h.name}</span>
                  </div>
                  <span className="tabnum">{h.qty}</span>
                  <span className="tabnum">{h.value}</span>
                  <div className="weight-cell">
                    <div className="weight-bar-bg">
                      <div className="weight-bar-fill" style={{ width: `${h.weight}%` }} />
                    </div>
                    <span className="weight-pct">{h.weight.toFixed(1)}%</span>
                  </div>
                  <span className={`change ${h.up ? 'positive' : 'negative'}`}>{h.change}</span>
                </div>
              ))}
            </div>
          </article>

          {/* ── Benchmarks ────────────────────────────── */}
          <article className="card">
            <div className="card-header">
              <h2 className="card-title">Benchmark comparison</h2>
              <span className="card-meta">
                {isDone && analysis?.metrics ? `${analysis.metrics.years}yr CAGR` : 'CAGR'}
              </span>
            </div>
            <div className="benchmark-list">
              {benchmarks.map((b, i) => (
                <div key={b.label} className="benchmark-item"
                  style={{ '--delay': `${i * 0.14}s`, '--bar-w': `${(Math.abs(b.value ?? 0) / maxBenchVal) * 100}%`, '--bar-color': b.color }}>
                  <div className="benchmark-meta">
                    <span className="benchmark-label">{b.label}</span>
                    <span className="benchmark-value">{b.value != null ? `${b.value}%` : '—'}</span>
                  </div>
                  <div className="benchmark-track">
                    <div className="benchmark-fill" />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        {/* ── Transactions ──────────────────────────────── */}
        <article className="card">
          <div className="card-header">
            <h2 className="card-title">Parsed transactions</h2>
            <span className="card-meta">{isDone ? `${transactions.length} rows` : 'demo'}</span>
          </div>
          <div className="tx-table">
            <div className="tx-thead" aria-hidden="true">
              <span>Date</span><span>Ticker</span><span>Action</span>
              <span>Qty</span><span>Price</span><span className="text-right">Total (GBP)</span>
            </div>
            {transactions.map((tx, i) => (
              <div key={i} className="tx-row">
                <span className="tx-date">{tx.date}</span>
                <span className="ticker">{tx.ticker}</span>
                <span className={`tx-action ${tx.action.toLowerCase()}`}>{tx.action}</span>
                <span className="tabnum">{tx.qty}</span>
                <span className="tabnum">{tx.price}</span>
                <span className="tabnum text-right">{tx.total}</span>
              </div>
            ))}
          </div>
        </article>

      </main>
    </div>
  )
}
