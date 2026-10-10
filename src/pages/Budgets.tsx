import { useState } from 'react'
import { saveSettings } from '../db'
import { CategoryLabel } from '../components/ui'
import { monthLabel, todayISO } from '../lib/dates'
import { parseAmount } from '../lib/entry'
import { formatINR } from '../lib/format'
import { budgetLevel, monthOf, monthStats } from '../lib/stats'
import type { AppData } from '../lib/useData'

function Bar({ spent, budget }: { spent: number; budget: number }) {
  const pct = budget ? Math.round((spent / budget) * 100) : 0
  const level = budgetLevel(spent, budget)
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className={`progress ${level}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <div className="spread tiny muted num">
        <span>{formatINR(spent)} of {formatINR(budget)} · {pct}%</span>
        <span style={{ color: level === 'over' ? 'var(--danger)' : level === 'warn' ? 'var(--warn)' : undefined, fontWeight: level === 'ok' ? 400 : 600 }}>
          {spent <= budget ? `${formatINR(budget - spent)} left` : `${formatINR(spent - budget)} over`}
        </span>
      </div>
    </div>
  )
}

export function Budgets({ data }: { data: AppData }) {
  const today = todayISO()
  const month = monthOf(today)
  const s = monthStats(data.expenses, month, today)
  const { settings } = data
  const [editing, setEditing] = useState(false)
  const [overall, setOverall] = useState('')
  const [perCat, setPerCat] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState('')

  const startEdit = () => {
    setOverall(String(settings.monthlyBudget))
    setPerCat(Object.fromEntries(Object.entries(settings.categoryBudgets).map(([k, v]) => [k, String(v)])))
    setMsg('')
    setEditing(true)
  }
  const save = async () => {
    const o = parseAmount(overall)
    if (!o || o <= 0) return setMsg('Enter an overall monthly budget.')
    const categoryBudgets: Record<string, number> = {}
    for (const [k, v] of Object.entries(perCat)) {
      const n = parseAmount(v)
      if (v.trim() && n > 0) categoryBudgets[k] = n
    }
    await saveSettings({ monthlyBudget: o, categoryBudgets })
    setEditing(false)
  }

  const allocated = Object.values(settings.categoryBudgets).reduce((a, b) => a + b, 0)
  const withBudget = data.activeCategories.filter((c) => settings.categoryBudgets[c.id])
  const without = data.activeCategories.filter((c) => !settings.categoryBudgets[c.id] && (s.byCategory.get(c.id) ?? 0) > 0)

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <h1>Budgets</h1>
        {!editing && <button className="btn" onClick={startEdit}>Edit budgets</button>}
      </div>
      <div className="small muted">{monthLabel(month)} · warnings at 80% and 100%</div>

      {editing ? (
        <div className="card stack">
          <label className="field">
            Overall monthly budget (₹)
            <input className="input num" inputMode="numeric" value={overall} onChange={(e) => setOverall(e.target.value)} />
          </label>
          <div className="small muted">Category budgets are optional. Leave blank for none.</div>
          {data.activeCategories.map((c) => (
            <div key={c.id} className="spread" style={{ flexWrap: 'nowrap' }}>
              <CategoryLabel c={c} />
              <input
                className="input num"
                style={{ width: 130, flex: 'none' }}
                inputMode="numeric"
                placeholder="No budget"
                aria-label={`${c.name} monthly budget`}
                value={perCat[c.id] ?? ''}
                onChange={(e) => setPerCat({ ...perCat, [c.id]: e.target.value })}
              />
            </div>
          ))}
          {msg && <div className="alert danger">{msg}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn primary" onClick={save}>Save budgets</button>
          </div>
        </div>
      ) : (
        <>
          <div className="card stack">
            <div className="spread"><h2>Household</h2><span className="num" style={{ fontWeight: 600 }}>{formatINR(settings.monthlyBudget)}</span></div>
            <Bar spent={s.total} budget={settings.monthlyBudget} />
            {allocated > 0 && <div className="tiny muted">Category budgets add up to {formatINR(allocated)}.</div>}
          </div>
          <div className="card stack">
            <h2>Categories</h2>
            {withBudget.length === 0 && <div className="small muted">No category budgets yet. Tap “Edit budgets” to add some.</div>}
            {withBudget.map((c) => (
              <div key={c.id} className="stack" style={{ gap: 4 }}>
                <CategoryLabel c={c} />
                <Bar spent={s.byCategory.get(c.id) ?? 0} budget={settings.categoryBudgets[c.id]} />
              </div>
            ))}
          </div>
          {without.length > 0 && (
            <div className="card stack" style={{ gap: 6 }}>
              <h2>No budget set</h2>
              {without.map((c) => (
                <div key={c.id} className="spread">
                  <CategoryLabel c={c} />
                  <span className="num small">{formatINR(s.byCategory.get(c.id) ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
