import { useMemo, useState } from 'react'
import { deleteExpense } from '../db'
import { commitDraft, validateDraft, withCategory, type ExpenseDraft } from '../lib/entry'
import type { AppData } from '../lib/useData'
import { METHODS, PEOPLE, SPEND_TYPES, SPEND_TYPE_LABEL } from '../types'
import { CategoryPicker } from './CategoryPicker'
import { DraftChecks } from './DraftChecks'
import { Modal, Segmented } from './ui'

export function ExpenseForm({ initial, notice, data, onClose }: {
  initial: ExpenseDraft
  /** Shown at the top, e.g. when a pasted/spoken entry was unclear. */
  notice?: string
  data: AppData
  onClose: () => void
}) {
  const [d, setD] = useState<ExpenseDraft>(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<ExpenseDraft>) => setD((cur) => ({ ...cur, ...patch }))
  const editing = !!d.id

  // Archived categories stay pickable only for an expense already using one.
  const categories = data.categories.filter((c) => !c.archived || c.id === d.categoryId)
  const merchants = useMemo(() => {
    const seen = new Map<string, string>()
    for (const e of data.expenses) if (e.merchant && !seen.has(e.merchant.toLowerCase())) seen.set(e.merchant.toLowerCase(), e.merchant)
    return [...seen.values()].sort((a, b) => a.localeCompare(b))
  }, [data.expenses])

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await commitDraft(d, data.recurring)
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!d.id || !confirm('Delete this expense?')) return
    await deleteExpense(d.id)
    onClose()
  }

  return (
    <Modal title={editing ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save() }}>
        {notice && <div className="alert warn">{notice}</div>}
        <div className="grid-2">
          <label className="field">
            Amount (₹)
            <input className="input num" inputMode="decimal" autoFocus={!editing && !d.amount} value={d.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="e.g. 450" />
          </label>
          <label className="field">
            Date
            <input className="input" type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
        </div>

        <div className="field">
          Category
          <CategoryPicker categories={categories} value={d.categoryId} onChange={(id) => setD((cur) => withCategory(cur, id, data.categories))} />
        </div>

        <div className="grid-2">
          <label className="field">
            Merchant (optional)
            <input className="input" list="merchant-list" value={d.merchant} onChange={(e) => set({ merchant: e.target.value })} placeholder="e.g. Swiggy, DMart, UPI" autoComplete="off" />
            <datalist id="merchant-list">{merchants.map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <label className="field">
            Account (optional)
            <input className="input" value={d.account} onChange={(e) => set({ account: e.target.value })} placeholder="e.g. HDFC Card ••1762" />
          </label>
        </div>

        <div className="field">
          Spend type
          <Segmented options={SPEND_TYPES} labels={SPEND_TYPE_LABEL} value={d.spendType} onChange={(spendType) => set({ spendType, spendTypeSet: true })} />
        </div>
        <div className="field">
          Payment method
          <Segmented options={METHODS} value={d.method} onChange={(method) => set({ method })} />
        </div>
        <div className="field">
          Paid by
          <Segmented options={PEOPLE} labels={data.settings.names} value={d.paidBy} onChange={(paidBy) => set({ paidBy })} />
        </div>

        <label className="field">
          Note (optional)
          <textarea className="input" value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. dinner with team" />
        </label>

        <DraftChecks d={d} data={data} onChange={set} />
        {error && <div className="alert danger">{error}</div>}

        <div className="spread">
          {editing ? <button type="button" className="btn danger" onClick={remove}>Delete</button> : <span />}
          <div className="row">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving || !!validateDraft(d)}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
