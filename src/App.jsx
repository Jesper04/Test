const menuItems = [
  { label: 'Overview', icon: '🏠' },
  { label: 'Uploads', icon: '📤' },
  { label: 'Holdings', icon: '💼' },
  { label: 'Benchmarks', icon: '📈' },
  { label: 'Premium', icon: '⭐' }
]

const metrics = [
  { title: 'CAGR', value: '14.2%', subtitle: 'Annual growth rate' },
  { title: 'TWR', value: '12.8%', subtitle: 'Time-weighted return' },
  { title: 'IRR', value: '13.6%', subtitle: 'Internal rate of return' }
]

const holdings = [
  { ticker: 'AAPL', quantity: '42', value: '£5,340' },
  { ticker: 'VUSA', quantity: '120', value: '£8,950' },
  { ticker: 'HSBA', quantity: '260', value: '£4,120' }
]

const benchmarks = [
  { label: 'S&P 500', value: '+10.4%' },
  { label: 'FTSE 100', value: '+6.8%' },
  { label: 'Portfolio', value: '+12.8%' }
]

const parsedRows = [
  { date: '2026-05-16', ticker: 'AAPL', qty: '10', price: '£155.32' },
  { date: '2026-05-14', ticker: 'VUSA', qty: '5', price: '£34.21' },
  { date: '2026-05-12', ticker: 'HSBA', qty: '20', price: '£15.70' }
]

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Portfolio AI</div>
        <nav className="menu">
          {menuItems.map((item) => (
            <button key={item.label} className="menu-item">
              <span className="menu-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <h1>UK portfolio intelligence</h1>
            <p>
              Upload messy broker CSVs, let the LLM parse trades automatically, and
              see live holdings, performance metrics and benchmark comparisons.
            </p>
          </div>
        </header>

        <section className="hero-grid">
          <article className="card upload-card">
            <div className="card-title-row">
              <div>
                <p className="eyebrow">Automatic parser</p>
                <h2>Upload broker CSV exports</h2>
              </div>
              <span className="status-chip">No format needed</span>
            </div>
            <p className="card-copy">
              Drop exports from Hargreaves Lansdown, Trading 212, Freetrade and more.
              The app extracts tickers, dates, quantities and prices without manual cleaning.
            </p>
            <div className="upload-actions">
              <button className="primary-button">Choose CSV</button>
              <button className="secondary-button">Use demo file</button>
            </div>
          </article>

          <div className="metric-cards">
            {metrics.map((metric) => (
              <article key={metric.title} className="tile card">
                <div className="tile-title">{metric.title}</div>
                <div className="tile-value">{metric.value}</div>
                <div className="tile-subtitle">{metric.subtitle}</div>
              </article>
            ))}
          </div>
        </section>

        <section className="section-grid">
          <article className="card holdings-card">
            <div className="section-header">
              <h2>Current holdings</h2>
              <span>Live market prices via API</span>
            </div>
            <div className="holdings-list">
              {holdings.map((holding) => (
                <div key={holding.ticker} className="holding-row">
                  <span className="holding-ticker">{holding.ticker}</span>
                  <span>{holding.quantity} shares</span>
                  <strong>{holding.value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="card benchmark-card">
            <div className="section-header">
              <h2>Benchmark comparison</h2>
              <span>See how your portfolio stacks up</span>
            </div>
            <div className="benchmark-list">
              {benchmarks.map((benchmark) => (
                <div key={benchmark.label} className="benchmark-row">
                  <span>{benchmark.label}</span>
                  <strong>{benchmark.value}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>

        <article className="card transactions-card">
          <div className="section-header">
            <h2>Parsed transactions</h2>
            <span>Sample rows extracted from messy CSV exports</span>
          </div>
          <div className="transaction-table">
            <div className="transaction-row header">
              <span>Date</span>
              <span>Ticker</span>
              <span>Qty</span>
              <span>Price</span>
            </div>
            {parsedRows.map((row) => (
              <div key={`${row.date}-${row.ticker}`} className="transaction-row">
                <span>{row.date}</span>
                <span>{row.ticker}</span>
                <span>{row.qty}</span>
                <span>{row.price}</span>
              </div>
            ))}
          </div>
        </article>
      </main>
    </div>
  )
}
