import { relativeDay } from '../lib/dates'
import { formatINR } from '../lib/format'
import type { Category, Expense, Person } from '../types'
import { SpendTypeChip } from './ui'

export function ExpenseRow({ e, cat, names, today, onClick }: {
  e: Expense
  cat?: Category
  names: Record<Person, string>
  today: string
  onClick: () => void
}) {
  const title = e.merchant && e.merchant !== 'UPI' ? e.merchant : e.note || e.merchant || cat?.name || 'Expense'
  const sub = [relativeDay(e.date, today), cat?.name, e.note && title !== e.note ? e.note : '', e.account || e.method, names[e.paidBy]].filter(Boolean).join(' · ')
  return (
    <button className="list-item" onClick={onClick}>
      <span className="cat-ico" aria-hidden="true">{cat?.icon ?? '❔'}</span>
      <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="ellipsis" style={{ fontWeight: 500 }}>{title}</span>
        <span className="tiny muted ellipsis">{sub}</span>
      </div>
      <div className="stack" style={{ gap: 2, alignItems: 'flex-end', flex: 'none' }}>
        <span className="num" style={{ fontWeight: 600 }}>{formatINR(e.amount)}</span>
        {e.spendType === 'waste' && <SpendTypeChip value="waste" />}
      </div>
    </button>
  )
}
