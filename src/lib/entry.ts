// Turns pasted SMS / spoken / typed text into an editable expense draft, and saves drafts.

import { saveExpense } from '../db'
import type { Category, EntrySource, Expense, Method, Person, Recurring, SpendType } from '../types'
import { categoryFromText, cleanMerchant, defaultTypeFor, isOnlyCategoryWords } from './categories'
import { todayISO } from './dates'
import { matchRecurring } from './recurring'
import { looksLikeInvestment, looksLikeSms, parseSms } from './sms'
import { parseSpoken } from './spoken'
import { rememberedCategory } from './stats'

/** Everything the expense form / confirmation card edits, before it is saved. */
export interface ExpenseDraft {
  id?: string
  amount: string
  date: string
  categoryId: string
  merchant: string
  spendType: SpendType
  /** True once the user picks a spend type by hand, so changing category no longer overrides it. */
  spendTypeSet: boolean
  paidBy: Person
  method: Method
  account: string
  note: string
  source: EntrySource
  recurringId: string
  /** Count this expense as paying the matching recurring item (rolls its due date forward). */
  payRecurring: boolean
  /** Set when logging from a due alert: always pays this item. */
  forRecurringId?: string
}

export function newDraft(over: Partial<ExpenseDraft> = {}): ExpenseDraft {
  return {
    amount: '',
    date: todayISO(),
    categoryId: '',
    merchant: '',
    spendType: 'need',
    spendTypeSet: false,
    paidBy: 'p1',
    method: 'UPI',
    account: '',
    note: '',
    source: 'manual',
    recurringId: '',
    payRecurring: true,
    ...over,
  }
}

export function draftFromExpense(e: Expense): ExpenseDraft {
  return newDraft({
    id: e.id,
    amount: String(e.amount),
    date: e.date,
    categoryId: e.categoryId,
    merchant: e.merchant,
    spendType: e.spendType,
    spendTypeSet: true,
    paidBy: e.paidBy,
    method: e.method,
    account: e.account,
    note: e.note,
    source: e.source,
    recurringId: e.recurringId,
  })
}

/** Category change also resets the spend type to the category's default, unless the user set it. */
export function withCategory(d: ExpenseDraft, categoryId: string, categories: Category[]): ExpenseDraft {
  return { ...d, categoryId, spendType: d.spendTypeSet ? d.spendType : defaultTypeFor(categoryId, categories) }
}

export function parseAmount(s: string): number {
  const n = Number(String(s).replace(/[,₹\s]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

export function validateDraft(d: ExpenseDraft): string | null {
  const amt = parseAmount(d.amount)
  if (!amt || amt <= 0) return 'Enter an amount greater than zero.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return 'Choose a date.'
  if (!d.categoryId) return 'Choose a category.'
  return null
}

// ---------- parsing ----------

export interface ParsedEntry {
  raw: string
  draft: ExpenseDraft
  isSms: boolean
  /** SMS describes money coming in (refund, credit) — not an expense. */
  isCredit: boolean
  investment: boolean
  dateAssumed: boolean
  methodAssumed: boolean
  categoryFrom?: 'memory' | 'keyword'
  missingAmount: boolean
}

export interface ParseContext {
  today: string
  owner: Person
  categories: Category[]
  expenses: Expense[]
}

export function parseEntry(text: string, ctx: ParseContext): ParsedEntry {
  const raw = text.trim()
  const isSms = looksLikeSms(raw)
  let draft = newDraft({ date: ctx.today, paidBy: ctx.owner, source: isSms ? 'sms' : 'voice' })
  let dateAssumed = false
  let methodAssumed = false
  let isCredit = false
  let keywordText = ''

  if (isSms) {
    const r = parseSms(raw, ctx.today)
    isCredit = r.kind === 'credit'
    dateAssumed = !r.date
    draft = { ...draft, amount: r.amount ? String(r.amount) : '', date: r.date ?? ctx.today, merchant: r.merchant, method: r.method, account: r.account, note: r.narrative }
    keywordText = r.narrative
  } else {
    const r = parseSpoken(raw, ctx.today)
    dateAssumed = r.dateAssumed
    methodAssumed = !r.method
    let merchant = ''
    let note = ''
    const at = /^(.*?)\s*\b(?:at|from)\s+(.+)$/i.exec(r.what)
    if (at) {
      merchant = cleanMerchant(at[2])
      note = at[1]
    } else if (isOnlyCategoryWords(r.what) || r.what.split(' ').length > 3) {
      note = r.what
    } else {
      merchant = cleanMerchant(r.what)
    }
    draft = { ...draft, amount: r.amount ? String(r.amount) : '', date: r.date, merchant, note, method: r.method ?? 'UPI', account: '' }
    keywordText = r.what
  }

  const active = new Set(ctx.categories.filter((c) => !c.archived && !c.deleted).map((c) => c.id))
  let categoryFrom: ParsedEntry['categoryFrom']
  let categoryId = rememberedCategory(ctx.expenses, draft.merchant)
  if (categoryId && active.has(categoryId)) categoryFrom = 'memory'
  else {
    categoryId = categoryFromText(keywordText) ?? categoryFromText(draft.merchant)
    if (categoryId && active.has(categoryId)) categoryFrom = 'keyword'
    else categoryId = ''
  }
  if (categoryId) draft = withCategory(draft, categoryId, ctx.categories)

  return {
    raw,
    draft,
    isSms,
    isCredit,
    investment: looksLikeInvestment(raw),
    dateAssumed,
    methodAssumed,
    categoryFrom,
    missingAmount: !parseAmount(draft.amount),
  }
}

// ---------- saving ----------

/** The recurring item this draft would pay, if any. */
export function recurringFor(d: ExpenseDraft, items: Recurring[]): Recurring | undefined {
  if (d.forRecurringId) return items.find((r) => r.id === d.forRecurringId && !r.deleted)
  if (d.id) return undefined
  const amount = parseAmount(d.amount)
  if (!amount) return undefined
  return matchRecurring(items, { amount, date: d.date, categoryId: d.categoryId, merchant: d.merchant })
}

export async function commitDraft(d: ExpenseDraft, recurring: Recurring[]): Promise<Expense> {
  const err = validateDraft(d)
  if (err) throw new Error(err)
  const pays = recurringFor(d, recurring)
  return saveExpense(
    {
      id: d.id,
      amount: parseAmount(d.amount),
      date: d.date,
      categoryId: d.categoryId,
      merchant: d.merchant,
      spendType: d.spendType,
      paidBy: d.paidBy,
      method: d.method,
      account: d.account,
      note: d.note,
      source: d.source,
      recurringId: d.recurringId,
    },
    { payRecurringId: pays && (d.payRecurring || d.forRecurringId) ? pays.id : undefined },
  )
}
