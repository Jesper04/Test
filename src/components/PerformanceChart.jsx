import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'

const PERIODS = ['1W', '1M', '6M', 'YTD', '1Y', '3Y', '5Y', '10Y', 'ALL']

const COLORS = {
  portfolio: '#C4A96A',
  sp500:     '#78A896',
  ftse100:   '#8896A8',
}

const SERIES_LABELS = {
  portfolio: 'Your Portfolio',
  sp500:     'S&P 500',
  ftse100:   'FTSE 100',
}

function formatDate(dateStr, period) {
  const d = new Date(dateStr + 'T00:00:00Z')
  if (['1W', '1M'].includes(period)) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }
  if (['6M', 'YTD', '1Y'].includes(period)) {
    return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
  }
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function fmtGbp(v) {
  return '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtPct(v) {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

function ReturnTooltip({ active, payload, label, period }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-date">{label ? formatDate(label, period) : ''}</p>
      {payload.map(entry => (
        <p key={entry.dataKey} className="chart-tooltip-row" style={{ color: entry.color }}>
          <span>{SERIES_LABELS[entry.dataKey]}</span>
          <span className={entry.value >= 0 ? 'positive' : 'negative'}>{fmtPct(entry.value)}</span>
        </p>
      ))}
    </div>
  )
}

function ValueTooltip({ active, payload, label, period }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-date">{label ? formatDate(label, period) : ''}</p>
      <p className="chart-tooltip-row" style={{ color: COLORS.portfolio }}>
        <span>Portfolio value</span>
        <span>{fmtGbp(payload[0].value)}</span>
      </p>
    </div>
  )
}

function AnnualTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-date">{label}</p>
      {payload.map(entry => entry.value != null && (
        <p key={entry.dataKey} className="chart-tooltip-row" style={{ color: entry.fill }}>
          <span>{SERIES_LABELS[entry.dataKey]}</span>
          <span className={entry.value >= 0 ? 'positive' : 'negative'}>{fmtPct(entry.value)}</span>
        </p>
      ))}
    </div>
  )
}

export default function PerformanceChart({ transactions, deposits = [] }) {
  const [period, setPeriod]       = useState('ALL')
  const [view, setView]           = useState('annual')
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState(null)
  const [selectedYear, setSelectedYear] = useState(null)

  const loadPerformance = useCallback(async (p) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/portfolio/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions, period: p, deposits }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [transactions, deposits])

  useEffect(() => {
    if (transactions?.length) loadPerformance(period)
  }, [transactions, period, loadPerformance])

  const returnSeries  = data?.series ?? []
  const valueSeries   = data?.valueSeries ?? []
  const annualReturns = (data?.annualReturns ?? []).map(r => ({
    ...r,
    label: r.partial ? `${r.year}*` : `${r.year}`,
  }))

  const activeSeries = view === 'value' ? valueSeries : returnSeries

  const tickCount = activeSeries.length
  const tickEvery = tickCount <= 30 ? 1 : tickCount <= 90 ? 7 : tickCount <= 200 ? 4 : tickCount <= 500 ? 8 : 12
  const ticks = activeSeries
    .map((p, i) => ({ ...p, i }))
    .filter(({ i }) => i % tickEvery === 0)
    .map(p => p.date)

  const hasAnnual = annualReturns.length >= 2

  return (
    <article className="card chart-card">
      <div className="card-header">
        <h2 className="card-title">Performance</h2>
        <div className="chart-controls">
          <div className="view-tabs">
            <button className={`view-tab${view === 'annual' ? ' view-tab--active' : ''}`} onClick={() => setView('annual')}>By Year</button>
            <button className={`view-tab${view === 'return' ? ' view-tab--active' : ''}`} onClick={() => setView('return')}>% Return</button>
            <button className={`view-tab${view === 'value'  ? ' view-tab--active' : ''}`} onClick={() => setView('value')}>£ Value</button>
          </div>
          <div className="period-tabs">
            {PERIODS.map(p => (
              <button key={p} className={`period-tab${period === p ? ' period-tab--active' : ''}`}
                onClick={() => setPeriod(p)} disabled={loading}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-wrap">
        {loading && (
          <div className="chart-overlay">
            <svg className="spinner" width="32" height="32" viewBox="0 0 44 44" fill="none">
              <circle cx="22" cy="22" r="16" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.15" />
              <path d="M22 6 A16 16 0 0 1 38 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="chart-overlay-text">Loading {period} data…</span>
          </div>
        )}

        {error && !loading && (
          <div className="chart-overlay">
            <span className="chart-overlay-text upload-error">{error}</span>
          </div>
        )}

        {!loading && !error && view === 'annual' && !hasAnnual && (
          <div className="chart-overlay">
            <span className="chart-overlay-text">Select a longer period to see annual returns</span>
          </div>
        )}

        {!loading && !error && view !== 'annual' && activeSeries.length === 0 && (
          <div className="chart-overlay">
            <span className="chart-overlay-text">No data available for this period</span>
          </div>
        )}

        {/* By Year — grouped bar chart */}
        {!loading && view === 'annual' && hasAnnual && (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={annualReturns} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} barCategoryGap="28%"
              style={{ cursor: 'pointer' }}
              onClick={e => {
                const yr = e?.activePayload?.[0]?.payload
                if (yr) setSelectedYear(prev => prev?.year === yr.year ? null : yr)
              }}>
              <XAxis dataKey="label"
                tick={{ fill: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis tickFormatter={v => `${v >= 0 ? '+' : ''}${v}%`}
                tick={{ fill: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                axisLine={false} tickLine={false} width={58} />
              <ReferenceLine y={0} stroke="var(--border-mid)" />
              <Tooltip content={<AnnualTooltip />} />
              <Legend formatter={key => (
                <span style={{ color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  {SERIES_LABELS[key]}
                </span>
              )} />
              <Bar dataKey="portfolio" fill={COLORS.portfolio} radius={[2, 2, 0, 0]} maxBarSize={28} />
              <Bar dataKey="sp500"     fill={COLORS.sp500}     radius={[2, 2, 0, 0]} maxBarSize={28} />
              <Bar dataKey="ftse100"   fill={COLORS.ftse100}   radius={[2, 2, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* % Return — line chart vs benchmarks */}
        {!loading && view === 'return' && returnSeries.length > 0 && (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={returnSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" ticks={ticks} tickFormatter={d => formatDate(d, period)}
                tick={{ fill: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis tickFormatter={v => `${v >= 0 ? '+' : ''}${v}%`}
                tick={{ fill: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                axisLine={false} tickLine={false} width={58} />
              <ReferenceLine y={0} stroke="var(--border-mid)" strokeDasharray="3 3" />
              <Tooltip content={<ReturnTooltip period={period} />} />
              <Legend formatter={key => (
                <span style={{ color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                  {SERIES_LABELS[key]}
                </span>
              )} />
              <Line type="monotone" dataKey="portfolio" stroke={COLORS.portfolio} strokeWidth={1.8} dot={false} connectNulls />
              <Line type="monotone" dataKey="sp500"     stroke={COLORS.sp500}     strokeWidth={1.2} dot={false} connectNulls strokeDasharray="4 2" />
              <Line type="monotone" dataKey="ftse100"   stroke={COLORS.ftse100}   strokeWidth={1.2} dot={false} connectNulls strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* £ Value — single line chart */}
        {!loading && view === 'value' && valueSeries.length > 0 && (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={valueSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" ticks={ticks} tickFormatter={d => formatDate(d, period)}
                tick={{ fill: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis tickFormatter={v => fmtGbp(v)}
                tick={{ fill: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                axisLine={false} tickLine={false} width={72} />
              <Tooltip content={<ValueTooltip period={period} />} />
              <Line type="monotone" dataKey="value" stroke={COLORS.portfolio} strokeWidth={1.8} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footnote for partial years */}
      {view === 'annual' && hasAnnual && annualReturns.some(r => r.partial) && (
        <p className="chart-footnote">* Partial year — return measured from first/last available data point</p>
      )}

      {view === 'annual' && selectedYear && (
        <div className="year-detail">
          <div className="year-detail-header">
            <span className="year-detail-title">{selectedYear.year}{selectedYear.partial ? '*' : ''} breakdown</span>
            <button className="year-detail-close" onClick={() => setSelectedYear(null)}>✕</button>
          </div>
          <div className="year-detail-cols">
            {selectedYear.topHoldings?.length > 0 && (
              <div className="year-detail-group">
                <p className="year-detail-label">Best performers</p>
                {selectedYear.topHoldings.map(h => (
                  <div key={h.ticker} className="year-detail-row">
                    <span className="ticker">{h.ticker}</span>
                    <span className={h.return >= 0 ? 'positive' : 'negative'}>
                      {h.return >= 0 ? '+' : ''}{h.return}%
                    </span>
                  </div>
                ))}
              </div>
            )}
            {selectedYear.bottomHoldings?.length > 0 && (
              <div className="year-detail-group">
                <p className="year-detail-label">Worst performers</p>
                {selectedYear.bottomHoldings.map(h => (
                  <div key={h.ticker} className="year-detail-row">
                    <span className="ticker">{h.ticker}</span>
                    <span className={h.return >= 0 ? 'positive' : 'negative'}>
                      {h.return >= 0 ? '+' : ''}{h.return}%
                    </span>
                  </div>
                ))}
              </div>
            )}
            {!selectedYear.topHoldings?.length && !selectedYear.bottomHoldings?.length && (
              <p className="year-detail-empty">No price data available for this year</p>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
