import { useRef, useState } from 'react'
import { deleteExpense } from '../db'
import { formatDate, todayISO } from '../lib/dates'
import { commitDraft, newDraft, parseEntry, validateDraft, withCategory, type ExpenseDraft, type ParsedEntry } from '../lib/entry'
import { formatINR } from '../lib/format'
import type { AppData } from '../lib/useData'
import { useSpeech } from '../lib/useSpeech'
import { PEOPLE, SPEND_TYPES, SPEND_TYPE_LABEL } from '../types'
import { CategoryPicker } from './CategoryPicker'
import { DraftChecks } from './DraftChecks'
import { CategoryLabel, Icon, Segmented } from './ui'

/** Paste an SMS (plus your own words), speak, or type — then confirm on a card before anything is saved. */
export function EntryBox({ data, onOpenForm }: { data: AppData; onOpenForm: (d: ExpenseDraft, notice?: string) => void }) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState<ParsedEntry | null>(null)
  const [pickCategory, setPickCategory] = useState(false)
  const [saved, setSaved] = useState<{ id: string; text: string } | null>(null)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const boxRef = useRef<HTMLTextAreaElement>(null)

  const handle = (input: string) => {
    const t = input.trim()
    if (!t) return
    setSaved(null)
    setError('')
    setHint('')
    const parsed = parseEntry(t, { today: todayISO(), owner: data.owner, categories: data.categories, expenses: data.expenses })
    setText('')
    if (!parsed.isCredit && parsed.missingAmount) {
      onOpenForm(parsed.draft, `Couldn't find the amount in “${t.length > 80 ? t.slice(0, 80) + '…' : t}”. Please fill it in.`)
      return
    }
    setPending(parsed)
    setPickCategory(!parsed.draft.categoryId)
  }

  const speech = useSpeech(handle)

  // Reading the clipboard needs the browser's permission. iPhone shows a small "Paste" bubble that must be
  // tapped; if it's dismissed, or the browser doesn't allow it, fall back to the normal long-press → Paste.
  const pasteFromClipboard = async () => {
    setError('')
    setHint('')
    if (!navigator.clipboard?.readText) {
      boxRef.current?.focus()
      setHint('This browser can’t paste with a button. Long-press the box above and choose Paste.')
      return
    }
    try {
      const clip = (await navigator.clipboard.readText()).trim()
      if (!clip) {
        setHint('The clipboard is empty. Copy the SMS first (long-press the message → Copy).')
        return
      }
      setText((cur) => (cur.trim() ? `${clip}\n${cur.trim()}` : `${clip}\n`))
      // Put the cursor after the SMS so you can type a few words about it.
      requestAnimationFrame(() => {
        const box = boxRef.current
        if (box) {
          box.focus()
          box.setSelectionRange(box.value.length, box.value.length)
        }
      })
    } catch {
      boxRef.current?.focus()
      setHint(/iPhone|iPad/.test(navigator.userAgent)
        ? 'iPhone asks before pasting: tap the small “Paste” bubble that pops up. Or long-press the box above and choose Paste.'
        : 'The browser didn’t allow pasting. Long-press (or right-click) the box above and choose Paste.')
    }
  }

  const setDraft = (patch: Partial<ExpenseDraft>) => setPending((p) => (p ? { ...p, draft: { ...p.draft, ...patch } } : p))

  const confirm = async () => {
    if (!pending) return
    try {
      const e = await commitDraft(pending.draft, data.recurring)
      const cat = data.catById.get(e.categoryId)
      setSaved({ id: e.id, text: `Saved ${formatINR(e.amount)} · ${cat?.icon ?? ''} ${cat?.name ?? ''}${e.merchant ? ` · ${e.merchant}` : ''}` })
      setPending(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const d = pending?.draft
  const cat = d && data.catById.get(d.categoryId)

  return (
    <div className="card stack">
      <div className="spread">
        <h2>Add an expense</h2>
        <button className="btn sm" onClick={() => onOpenForm(newDraft({ paidBy: data.owner }))}>{Icon.plus} Quick add</button>
      </div>
      <form className="voice" onSubmit={(e) => { e.preventDefault(); handle(text) }}>
        {speech.supported && (
          <button
            type="button"
            className={`mic ${speech.listening ? 'listening' : ''}`}
            onClick={speech.listening ? speech.stop : speech.start}
            aria-label={speech.listening ? 'Stop listening' : 'Speak an expense'}
          >
            {speech.listening ? Icon.stop : Icon.mic}
          </button>
        )}
        <textarea
          ref={boxRef}
          className="input grow entry-box"
          value={speech.listening ? speech.interim : text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !text.includes('\n')) {
              e.preventDefault()
              handle(text)
            }
          }}
          placeholder={speech.listening ? 'Listening…' : 'Paste a bank/UPI SMS and add a few words, or type “450 vegetables today”'}
          readOnly={speech.listening}
          rows={3}
          aria-label="Paste an SMS or describe the expense"
        />
      </form>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn sm" onClick={pasteFromClipboard}>{Icon.clipboard} Paste SMS</button>
        <button type="button" className="btn primary" disabled={!text.trim() || speech.listening} onClick={() => handle(text)}>Read it</button>
      </div>
      {speech.error && <div className="alert warn">{speech.error}</div>}
      {hint && <div className="alert info">{hint}</div>}
      {error && !pending && <div className="alert danger">{error}</div>}
      {saved && (
        <div className="alert ok spread">
          <span>{saved.text}</span>
          <button className="btn sm ghost" style={{ color: 'inherit' }} onClick={async () => { await deleteExpense(saved.id); setSaved(null) }}>Undo</button>
        </div>
      )}

      {pending && d && (
        <div className="card stack" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
          <div className="tiny muted ellipsis">{pending.isSms ? 'From SMS' : 'Heard'}: “{pending.raw.replace(/\s+/g, ' ')}”</div>

          {pending.isCredit ? (
            <>
              <div className="alert info">This looks like money coming in (a refund or credit), not an expense. Nothing was saved.</div>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => onOpenForm({ ...d, categoryId: d.categoryId })}>Log as expense anyway</button>
                <button className="btn primary" onClick={() => setPending(null)}>OK</button>
              </div>
            </>
          ) : (
            <>
              {pending.investment && (
                <div className="alert warn">
                  <strong>Looks like an investment, not an expense</strong> (SIP / RD / FD / mutual fund / auto-debit). Investments belong in the Savings app.
                </div>
              )}
              <dl className="parsed">
                <dt>Amount</dt>
                <dd className="num">{formatINR(Number(d.amount))}</dd>
                <dt>Date</dt>
                <dd>{formatDate(d.date)}{pending.dateAssumed && <span className="muted small"> (today, not mentioned)</span>}</dd>
                <dt>Merchant</dt>
                <dd>{d.merchant || <span className="muted">—</span>}</dd>
                <dt>Paid with</dt>
                <dd>{d.account || d.method}{pending.methodAssumed && <span className="muted small"> (default)</span>}</dd>
                {d.note && (
                  <>
                    <dt>Note</dt>
                    <dd>{d.note}</dd>
                  </>
                )}
                <dt>Category</dt>
                <dd>
                  {cat && !pickCategory ? (
                    <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                      <CategoryLabel c={cat} />
                      {pending.categoryFrom === 'memory' && <span className="tiny muted">(last time)</span>}
                      <button className="btn sm ghost" onClick={() => setPickCategory(true)}>Change</button>
                    </span>
                  ) : (
                    <span className="small muted">Pick one below</span>
                  )}
                </dd>
              </dl>
              {pickCategory && (
                <CategoryPicker
                  categories={data.activeCategories}
                  value={d.categoryId}
                  onChange={(id) => {
                    setPending((p) => (p ? { ...p, draft: withCategory(p.draft, id, data.categories), categoryFrom: undefined } : p))
                    setPickCategory(false)
                  }}
                />
              )}
              <div className="field">
                Spend type
                <Segmented options={SPEND_TYPES} labels={SPEND_TYPE_LABEL} value={d.spendType} onChange={(spendType) => setDraft({ spendType, spendTypeSet: true })} />
              </div>
              <div className="field">
                Paid by
                <Segmented options={PEOPLE} labels={data.settings.names} value={d.paidBy} onChange={(paidBy) => setDraft({ paidBy })} />
              </div>

              <DraftChecks d={d} data={data} onChange={setDraft} />
              {error && <div className="alert danger">{error}</div>}

              <div className="actions">
                {pending.investment ? (
                  <>
                    <button className="btn" onClick={confirm} disabled={!!validateDraft(d)}>Save anyway</button>
                    <button className="btn primary" onClick={() => setPending(null)}>Discard</button>
                  </>
                ) : (
                  <>
                    <button className="btn ghost" onClick={() => setPending(null)}>Discard</button>
                    <button className="btn" onClick={() => { onOpenForm(d); setPending(null) }}>Edit details</button>
                    <button className="btn primary" onClick={confirm} disabled={!!validateDraft(d)}>Save</button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
