import { useMemo, useState } from 'react'
import { HBars, MonthBars } from '../components/Charts'
import { CategoryLabel, Icon, Segmented } from '../components/ui'
import { MONTHS, monthLabel, todayISO } from '../lib/dates'
import { formatINR } from '../lib/format'
import { monthOf, monthStats, shiftMonth, yearStats } from '../lib/stats'
import type { AppData } from '../lib/useData'
import { PEOPLE, SPEND_TYPES, SPEND_TYPE_LABEL, type SpendType } from '../types'
import { swatch } from '../components/ui'

const TYPE_COLOR: Record<SpendType, string> = { essential: 'var(--c0)', need: 'var(--c2)', want: 'var(--c1)', waste: 'var(--danger)' }
const MONTH_NAMES = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1, 3))

function SpendTypeSplit({ by }: { by: Record<SpendType, number> }) {
  const total = SPEND_TYPES.reduce((s, t) => s + by[t], 0)
  if (!total) return <div className="small muted">Nothing yet.</div>
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="split" role="img" aria-label="Spend type split">
        {SPEND_TYPES.filter((t) => by[t] > 0).map((t) => <div key={t} style={{ width: `${(by[t] / total) * 100}%`, background: TYPE_COLOR[t] }} title={`${SPEND_TYPE_LABEL[t]}: ${formatINR(by[t])}`} />)}
      </div>
      <div className="legend">
        {SPEND_TYPES.map((t) => (
          <div className="li" key={t}>
            <span className="swatch" style={{ background: TYPE_COLOR[t] }} />
            <span>{SPEND_TYPE_LABEL[t]}</span>
            <span className="num small">{formatINR(by[t])}</span>
            <span className="num tiny muted" style={{ width: 32, textAlign: 'right' }}>{Math.round((by[t] / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Stats({ data, goTo }: { data: AppData; goTo: (page: string) => void }) {
  const today = todayISO()
  const current = monthOf(today)
  const [view, setView] = useState<'month' | 'year'>('month')
  const [month, setMonth] = useState(current)
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const { catById, settings } = data
  const firstMonth = data.expenses.length ? monthOf(data.expenses[data.expenses.length - 1].date) : current

  const ms = useMemo(() => monthStats(data.expenses, month, today), [data.expenses, month, today])
  const ys = useMemo(() => yearStats(data.expenses, year), [data.expenses, year])

  const catRows = (by: Map<string, number>) =>
    [...by.entries()].sort((a, b) => b[1] - a[1]).map(([id, value]) => {
      const c = catById.get(id)
      return { key: id, label: <CategoryLabel c={c} />, value, color: c ? swatch(c.color) : undefined }
    })

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <h1>Stats</h1>
        <Segmented options={['month', 'year'] as const} labels={{ month: 'Month', year: 'Year' }} value={view} onChange={setView} />
      </div>

      {view === 'month' ? (
        <>
          <div className="spread">
            <button className="btn sm ghost" disabled={month <= firstMonth} onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">{Icon.chevL}</button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600 }}>{monthLabel(month)}</div>
              <div className="big num">{formatINR(ms.total)}</div>
            </div>
            <button className="btn sm ghost" disabled={month >= current} onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month">{Icon.chevR}</button>
          </div>
          <div className="grid-2">
            <div className="card stack" style={{ gap: 4 }}>
              <h2 style={{ marginBottom: 6 }}>By category</h2>
              {ms.byCategory.size ? <HBars rows={catRows(ms.byCategory)} /> : <div className="small muted">Nothing yet.</div>}
            </div>
            <div className="stack">
              <div className="card stack">
                <h2>Essential · Need · Want · Waste</h2>
                <SpendTypeSplit by={ms.bySpendType} />
              </div>
              <div className="card stack" style={{ gap: 4 }}>
                <h2 style={{ marginBottom: 6 }}>By person</h2>
                <HBars rows={PEOPLE.map((p) => ({ key: p, label: settings.names[p], value: ms.byPerson[p] }))} />
              </div>
            </div>
          </div>
          <div className="card stack" style={{ gap: 4 }}>
            <h2 style={{ marginBottom: 6 }}>Top merchants</h2>
            {ms.topMerchants.length ? (
              <div className="list">
                {ms.topMerchants.slice(0, 10).map((m) => (
                  <button key={m.merchant} className="list-item" onClick={() => goTo(`history?merchant=${encodeURIComponent(m.merchant)}&range=all`)}>
                    <span className="grow ellipsis">{m.merchant}</span>
                    <span className="tiny muted">{m.count}×</span>
                    <span className="num" style={{ fontWeight: 600 }}>{formatINR(m.total)}</span>
                  </button>
                ))}
              </div>
            ) : <div className="small muted">No merchants recorded.</div>}
          </div>
        </>
      ) : (
        <>
          <div className="spread">
            <button className="btn sm ghost" disabled={year <= Number(firstMonth.slice(0, 4))} onClick={() => setYear((y) => y - 1)} aria-label="Previous year">{Icon.chevL}</button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600 }}>{year}</div>
              <div className="big num">{formatINR(ys.total)}</div>
            </div>
            <button className="btn sm ghost" disabled={year >= Number(today.slice(0, 4))} onClick={() => setYear((y) => y + 1)} aria-label="Next year">{Icon.chevR}</button>
          </div>
          <div className="card stack">
            <h2>Month by month</h2>
            <MonthBars months={ys.months} labels={MONTH_NAMES} currentIndex={year === Number(today.slice(0, 4)) ? Number(today.slice(5, 7)) - 1 : 11} />
          </div>
          <div className="grid-2">
            <div className="card stack" style={{ gap: 4 }}>
              <h2 style={{ marginBottom: 6 }}>By category</h2>
              {ys.byCategory.size ? <HBars rows={catRows(ys.byCategory)} /> : <div className="small muted">Nothing yet.</div>}
            </div>
            <div className="card stack">
              <h2>Essential · Need · Want · Waste</h2>
              <SpendTypeSplit by={ys.bySpendType} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
