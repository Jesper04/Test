const menuItems = [
  { label: 'Home', icon: '🏠' },
  { label: 'Analytics', icon: '📊' },
  { label: 'Customers', icon: '👥' },
  { label: 'Settings', icon: '⚙️' }
]

const tiles = [
  { title: 'Sales', value: '$12.4K', subtitle: 'Monthly revenue' },
  { title: 'Active Users', value: '1,280', subtitle: 'Last 24 hours' },
  { title: 'Tasks', value: '23', subtitle: 'Due this week' }
]

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Dashboard</div>
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
            <h1>Welcome back</h1>
            <p>Here is a quick overview of your dashboard.</p>
          </div>
        </header>

        <section className="tiles-grid">
          {tiles.map((tile) => (
            <article key={tile.title} className="tile">
              <div className="tile-title">{tile.title}</div>
              <div className="tile-value">{tile.value}</div>
              <div className="tile-subtitle">{tile.subtitle}</div>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}
