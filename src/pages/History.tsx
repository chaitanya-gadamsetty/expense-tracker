import { useMemo, useState } from 'react'
import { ExpenseRow } from '../components/ExpenseRow'
import { monthLabel, todayISO } from '../lib/dates'
import { draftFromExpense, type ExpenseDraft } from '../lib/entry'
import { formatINR } from '../lib/format'
import { RANGES, RANGE_LABEL, rangeBounds, type Range } from '../lib/stats'
import type { AppData } from '../lib/useData'
import { PEOPLE, SPEND_TYPES, SPEND_TYPE_LABEL, type Expense } from '../types'

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function History({ data, onOpenForm, initial }: { data: AppData; onOpenForm: (d: ExpenseDraft) => void; initial: URLSearchParams }) {
  const today = todayISO()
  const [q, setQ] = useState('')
  const [range, setRange] = useState<Range>((initial.get('range') as Range) || 'month')
  const [custom, setCustom] = useState({ from: '', to: today })
  const [cat, setCat] = useState(initial.get('category') ?? '')
  const [type, setType] = useState(initial.get('type') ?? '')
  const [who, setWho] = useState(initial.get('who') ?? '')
  const [merchant, setMerchant] = useState(initial.get('merchant') ?? '')
  const { catById, settings } = data

  const merchants = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of data.expenses) if (e.merchant) m.set(e.merchant.toLowerCase(), e.merchant)
    return [...m.values()].sort((a, b) => a.localeCompare(b))
  }, [data.expenses])

  const filtered = useMemo(() => {
    const { from, to } = rangeBounds(range, today, custom)
    const nq = norm(q)
    return data.expenses.filter((e) => {
      if (e.date < from || e.date > to) return false
      if (cat && e.categoryId !== cat) return false
      if (type && e.spendType !== type) return false
      if (who && e.paidBy !== who) return false
      if (merchant && e.merchant.toLowerCase() !== merchant.toLowerCase()) return false
      if (nq && !norm(`${e.merchant} ${e.note} ${e.amount} ${e.account} ${e.method} ${catById.get(e.categoryId)?.name ?? ''}`).includes(nq)) return false
      return true
    })
  }, [data.expenses, q, range, custom, cat, type, who, merchant, today, catById])

  const total = filtered.reduce((s, e) => s + e.amount, 0)
  const groups = useMemo(() => {
    const m = new Map<string, Expense[]>()
    for (const e of filtered) {
      const k = e.date.slice(0, 7)
      m.set(k, [...(m.get(k) ?? []), e])
    }
    return [...m.entries()]
  }, [filtered])

  const select = (value: string, set: (v: string) => void, all: string, opts: Array<[string, string]>, label: string) => (
    <select className="input" aria-label={label} style={{ width: 'auto', maxWidth: '100%', minHeight: 40, padding: '4px 8px' }} value={value} onChange={(e) => set(e.target.value)}>
      <option value="">{all}</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )

  return (
    <div className="stack">
      <div className="page-head">
        <h1>History</h1>
        <span className="small muted num">{filtered.length} · {formatINR(total)}</span>
      </div>
      <input className="input" type="search" placeholder="Search merchant, note, amount…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="row">
        <select className="input" aria-label="Date range" style={{ width: 'auto', minHeight: 40, padding: '4px 8px' }} value={range} onChange={(e) => setRange(e.target.value as Range)}>
          {RANGES.map((r) => <option key={r} value={r}>{RANGE_LABEL[r]}</option>)}
        </select>
        {select(cat, setCat, 'All categories', data.categories.map((c) => [c.id, `${c.icon} ${c.name}`]), 'Category')}
        {select(type, setType, 'Any spend type', SPEND_TYPES.map((t) => [t, SPEND_TYPE_LABEL[t]]), 'Spend type')}
        {select(who, setWho, 'Household', PEOPLE.map((p) => [p, settings.names[p]]), 'Paid by')}
        {select(merchant, setMerchant, 'All merchants', merchants.map((m) => [m, m]), 'Merchant')}
      </div>
      {range === 'custom' && (
        <div className="grid-2">
          <label className="field">From<input className="input" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
          <label className="field">To<input className="input" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
        </div>
      )}

      <div className="card" style={{ padding: '4px 12px' }}>
        {groups.length === 0 && <div className="empty">No expenses match.</div>}
        {groups.map(([month, es]) => (
          <div key={month}>
            <div className="month-label spread">
              <span>{monthLabel(month)}</span>
              <span className="num">{formatINR(es.reduce((s, e) => s + e.amount, 0))}</span>
            </div>
            <div className="list">
              {es.map((e) => <ExpenseRow key={e.id} e={e} cat={catById.get(e.categoryId)} names={settings.names} today={today} onClick={() => onOpenForm(draftFromExpense(e))} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
