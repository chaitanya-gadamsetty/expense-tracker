import { useEffect, useState } from 'react'
import { ExpenseForm } from './components/ExpenseForm'
import { Icon } from './components/ui'
import type { ExpenseDraft } from './lib/entry'
import { useData } from './lib/useData'
import { Budgets } from './pages/Budgets'
import { History } from './pages/History'
import { Home } from './pages/Home'
import { Settings } from './pages/Settings'
import { Stats } from './pages/Stats'

const PAGES = [
  { id: 'home', label: 'Home', icon: Icon.home },
  { id: 'history', label: 'History', icon: Icon.list },
  { id: 'stats', label: 'Stats', icon: Icon.chart },
  { id: 'budgets', label: 'Budgets', icon: Icon.wallet },
  { id: 'settings', label: 'Settings', icon: Icon.gear },
] as const

function readHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?')
  const [page, sub] = path.split('/')
  return { page: PAGES.some((p) => p.id === page) ? page : 'home', sub, params: new URLSearchParams(query) }
}

export default function App() {
  const data = useData()
  const [route, setRoute] = useState(readHash)
  const [form, setForm] = useState<{ draft: ExpenseDraft; notice?: string; key: number } | null>(null)

  useEffect(() => {
    const on = () => setRoute(readHash())
    window.addEventListener('hashchange', on)
    // Ask the browser not to evict our data under storage pressure (important on iOS).
    navigator.storage?.persist?.().catch(() => {})
    return () => window.removeEventListener('hashchange', on)
  }, [])

  const goTo = (page: string) => {
    location.hash = '/' + page
    window.scrollTo(0, 0)
  }
  const openForm = (draft: ExpenseDraft, notice?: string) => setForm({ draft, notice, key: Date.now() })

  return (
    <div className="app">
      <nav className="nav">
        <div className="brand"><span style={{ width: 22, height: 22, color: 'var(--accent)', display: 'inline-flex' }}>{Icon.receipt}</span>Expenses</div>
        {PAGES.map((p) => (
          <button key={p.id} className={route.page === p.id ? 'active' : ''} onClick={() => goTo(p.id)} aria-current={route.page === p.id ? 'page' : undefined}>
            {p.icon}
            <span>{p.label}</span>
          </button>
        ))}
      </nav>
      <main className="main">
        {data.ready && (
          <>
            {route.page === 'home' && <Home data={data} onOpenForm={openForm} goTo={goTo} />}
            {route.page === 'history' && <History key={location.hash} data={data} onOpenForm={openForm} initial={route.params} />}
            {route.page === 'stats' && <Stats data={data} goTo={goTo} />}
            {route.page === 'budgets' && <Budgets data={data} />}
            {route.page === 'settings' && <Settings data={data} sub={route.sub} goTo={goTo} />}
          </>
        )}
      </main>
      {form && <ExpenseForm key={form.key} initial={form.draft} notice={form.notice} data={data} onClose={() => setForm(null)} />}
    </div>
  )
}
