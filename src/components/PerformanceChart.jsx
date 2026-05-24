import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
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

function CustomTooltip({ active, payload, label, period }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-date">{label ? formatDate(label, period) : ''}</p>
      {payload.map(entry => (
        <p key={entry.dataKey} className="chart-tooltip-row" style={{ color: entry.color }}>
          <span>{SERIES_LABELS[entry.dataKey]}</span>
          <span className={entry.value >= 0 ? 'positive' : 'negative'}>
            {entry.value >= 0 ? '+' : ''}{entry.value?.toFixed(2)}%
          </span>
        </p>
      ))}
    </div>
  )
}

export default function PerformanceChart({ transactions }) {
  const [period, setPeriod]     = useState('1Y')
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  const loadPerformance = useCallback(async (p) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/portfolio/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions, period: p }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [transactions])

  useEffect(() => {
    if (transactions?.length) loadPerformance(period)
  }, [transactions, period, loadPerformance])

  const series = data?.series ?? []

  // Find x-axis tick interval to avoid crowding
  const tickCount = series.length
  const tickEvery = tickCount <= 30 ? 1
    : tickCount <= 90  ? 7
    : tickCount <= 200 ? 4
    : tickCount <= 500 ? 8
    : 12

  const ticks = series
    .map((p, i) => ({ ...p, i }))
    .filter(({ i }) => i % tickEvery === 0)
    .map(p => p.date)

  return (
    <article className="card chart-card">
      <div className="card-header">
        <h2 className="card-title">Performance vs benchmarks</h2>
        <div className="period-tabs">
          {PERIODS.map(p => (
            <button
              key={p}
              className={`period-tab${period === p ? ' period-tab--active' : ''}`}
              onClick={() => setPeriod(p)}
              disabled={loading}
            >
              {p}
            </button>
          ))}
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

        {!loading && !error && series.length === 0 && (
          <div className="chart-overlay">
            <span className="chart-overlay-text">No data available for this period</span>
          </div>
        )}

        {!loading && series.length > 0 && (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="date"
                ticks={ticks}
                tickFormatter={d => formatDate(d, period)}
                tick={{ fill: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={v => `${v >= 0 ? '+' : ''}${v}%`}
                tick={{ fill: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}
                axisLine={false}
                tickLine={false}
                width={58}
              />
              <ReferenceLine y={0} stroke="var(--border-mid)" strokeDasharray="3 3" />
              <Tooltip content={<CustomTooltip period={period} />} />
              <Legend
                formatter={key => (
                  <span style={{ color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
                    {SERIES_LABELS[key]}
                  </span>
                )}
              />
              <Line
                type="monotone" dataKey="portfolio"
                stroke={COLORS.portfolio} strokeWidth={1.8}
                dot={false} connectNulls
              />
              <Line
                type="monotone" dataKey="sp500"
                stroke={COLORS.sp500} strokeWidth={1.2}
                dot={false} connectNulls strokeDasharray="4 2"
              />
              <Line
                type="monotone" dataKey="ftse100"
                stroke={COLORS.ftse100} strokeWidth={1.2}
                dot={false} connectNulls strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </article>
  )
}
