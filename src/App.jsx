const NAV = [
  { id: 'overview',   label: 'Overview',       active: true },
  { id: 'uploads',    label: 'Uploads' },
  { id: 'holdings',   label: 'Holdings' },
  { id: 'benchmarks', label: 'Benchmarks' },
  { id: 'analytics',  label: 'Deep Analytics', premium: true },
]

const METRICS = [
  { label: 'Portfolio CAGR',       value: '14.2%',  change: '+3.8pp vs S&P 500',     positive: true },
  { label: 'Time-Weighted Return', value: '12.8%',  change: '+6.0pp vs FTSE 100',    positive: true },
  { label: 'Portfolio Value',      value: '£18,410', change: '+£2,140 since Jan 2026', positive: true },
]

const HOLDINGS = [
  { ticker: 'AAPL', name: 'Apple Inc.',           qty: 42,  value: '£5,340', weight: 29.0, change: '+2.4%', up: true  },
  { ticker: 'VUSA', name: 'Vanguard S&P 500 ETF', qty: 120, value: '£8,950', weight: 48.6, change: '+1.1%', up: true  },
  { ticker: 'HSBA', name: 'HSBC Holdings',         qty: 260, value: '£4,120', weight: 22.4, change: '−0.3%', up: false },
]

const BENCHMARKS = [
  { label: 'Your Portfolio', value: 14.2, color: '#C4A96A' },
  { label: 'S&P 500',        value: 10.4, color: '#78A896' },
  { label: 'MSCI World',     value: 9.1,  color: '#8896A8' },
  { label: 'FTSE 100',       value: 6.8,  color: '#A89688' },
]

const TRANSACTIONS = [
  { date: '16 May 2026', ticker: 'AAPL', action: 'BUY',  qty: 10, price: '£155.32', total: '£1,553.20' },
  { date: '14 May 2026', ticker: 'VUSA', action: 'BUY',  qty: 5,  price: '£34.21',  total: '£171.05'   },
  { date: '12 May 2026', ticker: 'HSBA', action: 'BUY',  qty: 20, price: '£15.70',  total: '£314.00'   },
  { date: '08 May 2026', ticker: 'AAPL', action: 'BUY',  qty: 32, price: '£142.10', total: '£4,547.20' },
]

const BROKERS = 'Freetrade · Trading 212 · IBKR · Hargreaves Lansdown · Vanguard'

/* ── Telescope logo ──────────────────────────────────────
   Old refractor: tapered barrel, eyepiece cup, objective
   housing, two decorative rings, focus knob. Thin strokes.
──────────────────────────────────────────────────────── */
function TelescopeIcon({ className = '' }) {
  return (
    <svg
      className={`telescope-icon${className ? ` ${className}` : ''}`}
      viewBox="0 0 44 44"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Barrel — tapered tube, wider at objective (left), narrower at eyepiece (right) */}
      <path d="M7 12 L38 16 L38 20 L7 18 Z" />

      {/* Objective lens — large circle at left end, wider than barrel opening */}
      <circle cx="7" cy="15" r="5" />

      {/* Eyepiece cup — small flange at right end */}
      <path d="M38 16 L40 15 L40 21 L38 20" />

      {/* Circular pivot mount — connects barrel to tripod */}
      <circle cx="23" cy="21.5" r="2.5" />

      {/* Short post down to tripod head */}
      <line x1="23" y1="24" x2="23" y2="27" />

      {/* Three tripod legs */}
      <line x1="23" y1="27" x2="9"  y2="41" />
      <line x1="23" y1="27" x2="23" y2="41" />
      <line x1="23" y1="27" x2="37" y2="41" />

      {/* Cross-brace at two-thirds down the legs */}
      <line x1="14" y1="36" x2="32" y2="36" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg
      className="upload-icon"
      width="44" height="44"
      viewBox="0 0 44 44"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 10.5A2.5 2.5 0 0111.5 8H27l8 8v17.5A2.5 2.5 0 0132.5 36h-21A2.5 2.5 0 019 33.5V10.5z" />
      <path d="M27 8v8h8" />
      <path d="M22 29v-9M18 24l4-4 4 4" />
    </svg>
  )
}

export default function App() {
  const maxVal = Math.max(...BENCHMARKS.map(b => b.value))

  return (
    <div className="shell">

      {/* ── Top navigation ────────────────────────────── */}
      <nav className="topnav" role="navigation" aria-label="Main">
        <div className="nav-brand">
          <TelescopeIcon />
          <span className="nav-brand-name">Reodor</span>
        </div>

        <div className="nav-sep" aria-hidden="true" />

        <div className="nav-links">
          {NAV.map(item => (
            <button
              key={item.id}
              className={`nav-link${item.active ? ' nav-link--active' : ''}`}
              aria-current={item.active ? 'page' : undefined}
            >
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

      {/* ── Main content ──────────────────────────────── */}
      <main className="main">

        <header className="page-header">
          <h1 className="page-title">Portfolio Intelligence</h1>
          <p className="page-sub">
            Upload any broker statement. The AI handles the rest.
          </p>
        </header>

        <label className="upload-zone" htmlFor="csv-upload">
          <input id="csv-upload" type="file" accept=".csv" style={{ display: 'none' }} />
          <TelescopeIcon className="upload-bg-icon" />
          <UploadIcon />
          <h2 className="upload-heading">Drop your broker CSV here</h2>
          <p className="upload-sub">
            No formatting required. The model reads any export and identifies tickers,
            prices, quantities and dates — automatically.
          </p>
          <p className="broker-list">{BROKERS}</p>
          <div className="upload-cta">
            <button className="btn btn--primary" onClick={e => e.preventDefault()}>Choose file</button>
            <button className="btn btn--ghost"   onClick={e => e.preventDefault()}>Load demo</button>
          </div>
        </label>

        <div className="section-divider">
          <span className="section-divider-label">Sample output</span>
          <span className="section-divider-hint">Upload a statement to see your real returns</span>
        </div>

        <section className="metrics-row" aria-label="Key metrics">
          {METRICS.map(m => (
            <article key={m.label} className="metric-tile">
              <p className="metric-label">{m.label}</p>
              <p className="metric-value">{m.value}</p>
              <p className={`metric-change ${m.positive ? 'positive' : 'negative'}`}>{m.change}</p>
            </article>
          ))}
        </section>

        <div className="two-col">
          <article className="card">
            <div className="card-header">
              <h2 className="card-title">Holdings</h2>
              <span className="card-meta">live prices</span>
            </div>
            <div className="holdings-table">
              <div className="holdings-thead" aria-hidden="true">
                <span>Ticker</span><span>Qty</span><span>Value</span>
                <span>Weight</span><span>Day</span>
              </div>
              {HOLDINGS.map(h => (
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
                    <span className="weight-pct">{h.weight}%</span>
                  </div>
                  <span className={`change ${h.up ? 'positive' : 'negative'}`}>{h.change}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="card">
            <div className="card-header">
              <h2 className="card-title">Benchmark comparison</h2>
              <span className="card-meta">1-year CAGR</span>
            </div>
            <div className="benchmark-list">
              {BENCHMARKS.map((b, i) => (
                <div
                  key={b.label}
                  className="benchmark-item"
                  style={{ '--delay': `${i * 0.14}s`, '--bar-w': `${(b.value / maxVal) * 100}%`, '--bar-color': b.color }}
                >
                  <div className="benchmark-meta">
                    <span className="benchmark-label">{b.label}</span>
                    <span className="benchmark-value">{b.value}%</span>
                  </div>
                  <div className="benchmark-track">
                    <div className="benchmark-fill" />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        <article className="card">
          <div className="card-header">
            <h2 className="card-title">Parsed transactions</h2>
            <span className="card-meta">extracted from CSV</span>
          </div>
          <div className="tx-table">
            <div className="tx-thead" aria-hidden="true">
              <span>Date</span><span>Ticker</span><span>Action</span>
              <span>Qty</span><span>Price</span>
              <span className="text-right">Total</span>
            </div>
            {TRANSACTIONS.map((tx, i) => (
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
