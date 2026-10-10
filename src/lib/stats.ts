// Pure calculations for the dashboard, budgets and alerts. Months are calendar months ("YYYY-MM").

import type { Expense, Person, Settings, SpendType } from '../types'
import { addMonths, fromISO, lastDayOfMonth, toISO } from './dates'

export const monthOf = (iso: string) => iso.slice(0, 7)

export function daysInMonth(month: string): number {
  return lastDayOfMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1)
}

export function shiftMonth(month: string, by: number): string {
  return addMonths(`${month}-01`, by).slice(0, 7)
}

/** Days of the month that have happened: all of a past month, today's day for the current one, 0 for future. */
export function daysElapsed(month: string, today: string): number {
  const cur = monthOf(today)
  if (month < cur) return daysInMonth(month)
  if (month > cur) return 0
  return Number(today.slice(8, 10))
}

const sum = (es: Expense[]) => es.reduce((s, e) => s + e.amount, 0)

export interface MonthStats {
  month: string
  expenses: Expense[]
  total: number
  dailyAverage: number
  /** Index 0 = day 1 */
  daily: number[]
  byCategory: Map<string, number>
  bySpendType: Record<SpendType, number>
  byPerson: Record<Person, number>
  topMerchants: Array<{ merchant: string; total: number; count: number }>
  topCategory?: { categoryId: string; total: number }
}

export function monthStats(all: Expense[], month: string, today: string): MonthStats {
  const expenses = all.filter((e) => !e.deleted && monthOf(e.date) === month)
  const total = sum(expenses)
  const daily = Array.from({ length: daysInMonth(month) }, () => 0)
  const byCategory = new Map<string, number>()
  const bySpendType: Record<SpendType, number> = { essential: 0, need: 0, want: 0, waste: 0 }
  const byPerson: Record<Person, number> = { p1: 0, p2: 0 }
  const merchants = new Map<string, { merchant: string; total: number; count: number }>()
  for (const e of expenses) {
    daily[Number(e.date.slice(8, 10)) - 1] += e.amount
    byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? 0) + e.amount)
    bySpendType[e.spendType] += e.amount
    byPerson[e.paidBy] += e.amount
    const key = e.merchant.trim().toLowerCase()
    // "UPI" is a placeholder for person-to-person payments, not a merchant.
    if (key && key !== 'upi') {
      const m = merchants.get(key) ?? { merchant: e.merchant.trim(), total: 0, count: 0 }
      m.total += e.amount
      m.count++
      merchants.set(key, m)
    }
  }
  const elapsed = daysElapsed(month, today)
  const [topId, topTotal] = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
  return {
    month,
    expenses,
    total,
    dailyAverage: elapsed ? total / elapsed : 0,
    daily,
    byCategory,
    bySpendType,
    byPerson,
    topMerchants: [...merchants.values()].sort((a, b) => b.total - a.total),
    topCategory: topId ? { categoryId: topId, total: topTotal! } : undefined,
  }
}

export interface YearStats {
  year: number
  total: number
  months: number[]
  byCategory: Map<string, number>
  bySpendType: Record<SpendType, number>
}

export function yearStats(all: Expense[], year: number): YearStats {
  const expenses = all.filter((e) => !e.deleted && e.date.startsWith(String(year)))
  const months = Array.from({ length: 12 }, () => 0)
  const byCategory = new Map<string, number>()
  const bySpendType: Record<SpendType, number> = { essential: 0, need: 0, want: 0, waste: 0 }
  for (const e of expenses) {
    months[Number(e.date.slice(5, 7)) - 1] += e.amount
    byCategory.set(e.categoryId, (byCategory.get(e.categoryId) ?? 0) + e.amount)
    bySpendType[e.spendType] += e.amount
  }
  return { year, total: sum(expenses), months, byCategory, bySpendType }
}

// ---------- budgets ----------

export type BudgetLevel = 'ok' | 'warn' | 'over'
export const WARN_AT = 0.8

export function budgetLevel(spent: number, budget: number): BudgetLevel {
  if (!budget) return 'ok'
  if (spent >= budget) return 'over'
  if (spent >= budget * WARN_AT) return 'warn'
  return 'ok'
}

export interface Crossing {
  scope: 'overall' | 'category'
  categoryId?: string
  level: Exclude<BudgetLevel, 'ok'>
  spentAfter: number
  budget: number
}

/**
 * Budget thresholds (80% / 100%) that saving this expense would cross, for the expense's month.
 * `editingId` excludes the expense's own previous version when editing.
 */
export function budgetCrossings(
  all: Expense[],
  settings: Pick<Settings, 'monthlyBudget' | 'categoryBudgets'>,
  e: { amount: number; date: string; categoryId: string },
  editingId?: string,
): Crossing[] {
  const month = monthOf(e.date)
  const inMonth = all.filter((x) => !x.deleted && x.id !== editingId && monthOf(x.date) === month)
  const out: Crossing[] = []
  const check = (scope: Crossing['scope'], before: number, budget: number, categoryId?: string) => {
    if (!budget) return
    const after = before + e.amount
    const lb = budgetLevel(before, budget)
    const la = budgetLevel(after, budget)
    if (la !== 'ok' && la !== lb) out.push({ scope, categoryId, level: la, spentAfter: after, budget })
  }
  check('overall', sum(inMonth), settings.monthlyBudget)
  if (e.categoryId) {
    check('category', sum(inMonth.filter((x) => x.categoryId === e.categoryId)), settings.categoryBudgets[e.categoryId] ?? 0, e.categoryId)
  }
  return out
}

// ---------- spike alert ----------

export interface Spike {
  categoryId: string
  spent: number
  average: number
  ratio: number
}

/** Ignore spikes in categories where this month's spend is still small. */
export const SPIKE_MIN_AMOUNT = 1000

/**
 * Categories whose month-to-date spend exceeds `multiplier` × their average over the previous 3 months
 * up to the same day of the month. Silent until there are 3 full months of history.
 */
export function spikes(all: Expense[], today: string, multiplier: number): Spike[] {
  const live = all.filter((e) => !e.deleted)
  if (!live.length) return []
  const month = monthOf(today)
  const day = Number(today.slice(8, 10))
  const earliest = live.reduce((m, e) => (e.date < m ? e.date : m), live[0].date)
  if (monthOf(earliest) > shiftMonth(month, -3)) return []

  const upTo = (m: string) => `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, '0')}`
  const totals = (from: string, to: string) => {
    const t = new Map<string, number>()
    for (const e of live) if (e.date >= from && e.date <= to) t.set(e.categoryId, (t.get(e.categoryId) ?? 0) + e.amount)
    return t
  }
  const now = totals(`${month}-01`, today)
  const past = [1, 2, 3].map((k) => {
    const m = shiftMonth(month, -k)
    return totals(`${m}-01`, upTo(m))
  })
  const out: Spike[] = []
  for (const [categoryId, spent] of now) {
    const average = past.reduce((s, t) => s + (t.get(categoryId) ?? 0), 0) / 3
    if (spent >= SPIKE_MIN_AMOUNT && average > 0 && spent > average * multiplier) {
      out.push({ categoryId, spent, average, ratio: spent / average })
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio)
}

// ---------- duplicates & merchant memory ----------

/** An existing expense with the same amount, date and merchant (e.g. a bank SMS and a UPI SMS for one payment). */
export function findDuplicate(all: Expense[], e: { amount: number; date: string; merchant: string }, editingId?: string): Expense | undefined {
  const m = e.merchant.trim().toLowerCase()
  return all.find(
    (x) => !x.deleted && x.id !== editingId && x.amount === e.amount && x.date === e.date && x.merchant.trim().toLowerCase() === m,
  )
}

/** Category last used for this merchant. Never for "UPI" (too generic) or a blank merchant. */
export function rememberedCategory(all: Expense[], merchant: string): string | undefined {
  const m = merchant.trim().toLowerCase()
  if (!m || m === 'upi') return undefined
  let best: Expense | undefined
  for (const x of all) {
    if (x.deleted || x.merchant.trim().toLowerCase() !== m) continue
    if (!best || x.date > best.date || (x.date === best.date && x.updatedAt > best.updatedAt)) best = x
  }
  return best?.categoryId
}

// ---------- date ranges (history) ----------

export const RANGES = ['month', 'last30', 'ytd', 'all', 'custom'] as const
export type Range = (typeof RANGES)[number]
export const RANGE_LABEL: Record<Range, string> = { month: 'This month', last30: 'Last 30 days', ytd: 'Year to date', all: 'All time', custom: 'Custom' }

export function rangeBounds(range: Range, today: string, custom?: { from: string; to: string }): { from: string; to: string } {
  const t = fromISO(today)
  switch (range) {
    case 'month': return { from: `${monthOf(today)}-01`, to: `${monthOf(today)}-${daysInMonth(monthOf(today))}` }
    case 'last30': { const d = new Date(t); d.setDate(d.getDate() - 29); return { from: toISO(d), to: today } }
    case 'ytd': return { from: `${t.getFullYear()}-01-01`, to: today }
    case 'custom': return { from: custom?.from || '0000-01-01', to: custom?.to || '9999-12-31' }
    default: return { from: '0000-01-01', to: '9999-12-31' }
  }
}
