import { skipRecurring } from '../db'
import { formatDate } from '../lib/dates'
import { newDraft, withCategory, type ExpenseDraft } from '../lib/entry'
import { formatINR } from '../lib/format'
import { CADENCE_LABEL, describeDue, dueItems } from '../lib/recurring'
import type { AppData } from '../lib/useData'

/** Recurring bills due within 5 days or overdue. Logging the expense clears the alert. */
export function DueAlerts({ data, today, onOpenForm }: { data: AppData; today: string; onOpenForm: (d: ExpenseDraft) => void }) {
  const items = dueItems(data.recurring, today)
  if (!items.length) return null
  return (
    <div className="card stack" style={{ borderColor: items.some((i) => i.status === 'overdue') ? 'var(--warn)' : undefined }}>
      <h2>Bills due</h2>
      <div className="list">
        {items.map(({ item: r, status, daysLeft }) => {
          const cat = data.catById.get(r.categoryId)
          return (
            <div key={r.id} className="list-item" style={{ cursor: 'default' }}>
              <span className="cat-ico" aria-hidden="true">{cat?.icon ?? '🔁'}</span>
              <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                <span className="ellipsis" style={{ fontWeight: 500 }}>{r.name}</span>
                <span className="tiny muted">
                  {formatINR(r.amount)} · {CADENCE_LABEL[r.cadence]} · {formatDate(r.nextDueDate)} ·{' '}
                  <span style={{ color: status === 'overdue' ? 'var(--warn)' : undefined, fontWeight: 600 }}>{describeDue({ item: r, status, daysLeft })}</span>
                </span>
              </div>
              <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                <button className="btn sm ghost" onClick={() => confirm(`Skip ${r.name} this time and move it to the next due date?`) && skipRecurring(r.id)}>Skip</button>
                <button
                  className="btn sm primary"
                  onClick={() =>
                    onOpenForm(withCategory(newDraft({ amount: String(r.amount), merchant: r.merchant, note: r.name, paidBy: data.owner, source: 'recurring', forRecurringId: r.id, date: today }), r.categoryId, data.categories))
                  }
                >
                  Mark paid
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
