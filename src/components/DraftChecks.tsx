import { formatDate } from '../lib/dates'
import { parseAmount, recurringFor, type ExpenseDraft } from '../lib/entry'
import { formatINR } from '../lib/format'
import { CADENCE_LABEL, advance } from '../lib/recurring'
import { budgetCrossings, findDuplicate } from '../lib/stats'
import type { AppData } from '../lib/useData'

/** Warnings shown before saving: duplicate, budget thresholds, and which recurring bill this pays. */
export function DraftChecks({ d, data, onChange }: { d: ExpenseDraft; data: AppData; onChange: (patch: Partial<ExpenseDraft>) => void }) {
  const amount = parseAmount(d.amount)
  if (!amount || amount <= 0) return null
  const dup = findDuplicate(data.expenses, { amount, date: d.date, merchant: d.merchant }, d.id)
  const crossings = budgetCrossings(data.expenses, data.settings, { amount, date: d.date, categoryId: d.categoryId }, d.id)
  const pays = recurringFor(d, data.recurring)

  return (
    <>
      {dup && (
        <div className="alert warn">
          <strong>Possible duplicate.</strong> {formatINR(dup.amount)} {dup.merchant ? `at ${dup.merchant} ` : ''}on {formatDate(dup.date)} is already logged
          {dup.note ? ` (“${dup.note}”)` : ''}. Banks often send two SMS for one UPI payment.
        </div>
      )}
      {crossings.map((c) => {
        const name = c.scope === 'overall' ? 'the monthly budget' : `the ${data.catById.get(c.categoryId!)?.name ?? ''} budget`
        const pct = Math.round((c.spentAfter / c.budget) * 100)
        return (
          <div key={c.scope + (c.categoryId ?? '')} className={`alert ${c.level === 'over' ? 'danger' : 'warn'}`}>
            {c.level === 'over' ? 'Goes over' : 'Crosses 80% of'} {name}: {formatINR(c.spentAfter)} of {formatINR(c.budget)} ({pct}%).
          </div>
        )
      })}
      {pays && !d.forRecurringId && (
        <label className="row small" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
          <input type="checkbox" checked={d.payRecurring} onChange={(e) => onChange({ payRecurring: e.target.checked })} />
          <span>
            Counts as <strong>{pays.name}</strong> ({CADENCE_LABEL[pays.cadence].toLowerCase()}, {formatINR(pays.amount)}) due {formatDate(pays.nextDueDate)}.
            <span className="muted"> Clears the alert; next due {formatDate(advance(pays.nextDueDate, pays.cadence))}.</span>
          </span>
        </label>
      )}
      {pays && d.forRecurringId && (
        <div className="alert info">Pays <strong>{pays.name}</strong> due {formatDate(pays.nextDueDate)}. Next due {formatDate(advance(pays.nextDueDate, pays.cadence))}.</div>
      )}
    </>
  )
}
