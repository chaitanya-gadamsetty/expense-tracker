import { useMemo, useState } from 'react'
import { DailyBars, Donut } from '../components/Charts'
import { DueAlerts } from '../components/DueAlerts'
import { EntryBox } from '../components/EntryBox'
import { ExpenseRow } from '../components/ExpenseRow'
import { SetupCard } from '../components/SetupCard'
import { SyncStatus } from '../components/SyncStatus'
import { CategoryLabel, Icon, Segmented } from '../components/ui'
import { monthLabel, todayISO } from '../lib/dates'
import { draftFromExpense, type ExpenseDraft } from '../lib/entry'
import { formatINR } from '../lib/format'
import { budgetLevel, daysElapsed, monthOf, monthStats, shiftMonth, spikes } from '../lib/stats'
import type { AppData } from '../lib/useData'
import type { Expense, Person } from '../types'

type Who = 'all' | Person

export function Home({ data, onOpenForm, goTo }: { data: AppData; onOpenForm: (d: ExpenseDraft, notice?: string) => void; goTo: (page: string) => void }) {
  const today = todayISO()
  const current = monthOf(today)
  const [month, setMonth] = useState(current)
  const [who, setWho] = useState<Who>('all')
  const { settings, catById } = data

  const scoped = useMemo(() => (who === 'all' ? data.expenses : data.expenses.filter((e) => e.paidBy === who)), [data.expenses, who])
  const s = useMemo(() => monthStats(scoped, month, today), [scoped, month, today])
  const spikeList = useMemo(() => spikes(data.expenses, today, settings.spikeMultiplier), [data.expenses, today, settings.spikeMultiplier])
  const recent = useMemo(() => scoped.filter((e) => monthOf(e.date) === month).slice(0, 8), [scoped, month])

  const firstMonth = data.expenses.length ? monthOf(data.expenses[data.expenses.length - 1].date) : current
  const budget = who === 'all' ? settings.monthlyBudget : 0
  const pct = budget ? Math.round((s.total / budget) * 100) : 0
  const level = budgetLevel(s.total, budget)
  const remaining = budget - s.total
  const needsBackup = data.expenses.length > 20 && Date.now() - settings.lastBackupAt > 30 * 86_400_000
  const open = (e: Expense) => onOpenForm(draftFromExpense(e))
  const top = s.topCategory && catById.get(s.topCategory.categoryId)

  if (!data.ready) return null
  return (
    <div className="stack" style={{ gap: 16 }}>
      <SyncStatus goTo={goTo} />
      {(!settings.setupDone || !data.ownerSet) && <SetupCard data={data} goTo={goTo} />}
      <EntryBox data={data} onOpenForm={onOpenForm} />
      <DueAlerts data={data} today={today} onOpenForm={onOpenForm} />

      {(spikeList.length > 0 || needsBackup) && (
        <div className="stack" style={{ gap: 8 }}>
          {spikeList.map((sp) => {
            const c = catById.get(sp.categoryId)
            return (
              <div key={sp.categoryId} className="alert warn">
                <strong>{c?.icon} {c?.name ?? 'A category'} is running high:</strong> {formatINR(sp.spent)} so far this month vs a usual {formatINR(sp.average)} by this date ({sp.ratio.toFixed(1)}×).
              </div>
            )
          })}
          {needsBackup && (
            <button className="alert info" style={{ border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => goTo('settings/backup')}>
              {settings.lastBackupAt ? 'No backup in over 30 days.' : 'You haven’t made a backup yet.'} Export one from Settings →
            </button>
          )}
        </div>
      )}

      <div className="spread">
        <h1>{month === current ? 'This month' : monthLabel(month)}</h1>
        <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
          <button className="btn sm ghost" disabled={month <= firstMonth} onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">{Icon.chevL}</button>
          <span className="small" style={{ minWidth: 92, textAlign: 'center' }}>{monthLabel(month).replace(/(\w{3})\w*/, '$1')}</span>
          <button className="btn sm ghost" disabled={month >= current} onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">{Icon.chevR}</button>
        </div>
      </div>
      <Segmented options={['all', 'p1', 'p2'] as const} labels={{ all: 'Household', ...settings.names }} value={who} onChange={setWho} />

      <div className="kpis">
        <div className="card kpi">
          <div className="label">Total spent</div>
          <div className="value num">{formatINR(s.total)}</div>
          <div className="sub">{s.expenses.length} expense{s.expenses.length === 1 ? '' : 's'}</div>
        </div>
        <div className="card kpi">
          <div className="label">{budget ? (remaining >= 0 ? 'Remaining budget' : 'Over budget') : 'Budget'}</div>
          <div className="value num" style={{ color: level === 'over' ? 'var(--danger)' : level === 'warn' ? 'var(--warn)' : undefined }}>
            {budget ? formatINR(Math.abs(remaining)) : '—'}
          </div>
          <div className="sub">{budget ? `${pct}% of ${formatINR(budget)}` : 'Household view only'}</div>
        </div>
        <div className="card kpi">
          <div className="label">Daily average</div>
          <div className="value num">{formatINR(Math.round(s.dailyAverage))}</div>
          <div className="sub">over {daysElapsed(month, today)} days</div>
        </div>
        <div className="card kpi">
          <div className="label">Top category</div>
          <div className="value" style={{ fontSize: '1.05rem' }}>{top ? <CategoryLabel c={top} /> : '—'}</div>
          <div className="sub num">{s.topCategory ? formatINR(s.topCategory.total) : ''}</div>
        </div>
      </div>

      {budget > 0 && (
        <div className={`progress ${level}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Monthly budget used">
          <div style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}

      {s.expenses.length === 0 ? (
        <div className="card empty">No expenses for {monthLabel(month)} yet.</div>
      ) : (
        <>
          <div className="stack" style={{ gap: 16 }}>
            <div className="card stack">
              <h2>Daily spending</h2>
              <DailyBars daily={s.daily} average={s.dailyAverage} elapsed={daysElapsed(month, today)} label={(d) => `${d} ${monthLabel(month).slice(0, 3)}`} />
            </div>
            <div className="card stack">
              <h2>By category</h2>
              <Donut
                slices={[...s.byCategory.entries()].map(([id, value]) => {
                  const c = catById.get(id)
                  return { key: id, name: c?.name ?? 'Uncategorised', label: <CategoryLabel c={c} />, value, color: c?.color }
                })}
                center={<><div className="tiny muted">Total</div><strong className="num">{formatINR(s.total)}</strong></>}
              />
            </div>
          </div>

          <div className="card" style={{ padding: '8px 12px' }}>
            <div className="spread" style={{ padding: '6px 4px' }}>
              <h2>Recent</h2>
              <button className="btn sm ghost" onClick={() => goTo('history')}>See all →</button>
            </div>
            <div className="list">
              {recent.map((e) => <ExpenseRow key={e.id} e={e} cat={catById.get(e.categoryId)} names={settings.names} today={today} onClick={() => open(e)} />)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
