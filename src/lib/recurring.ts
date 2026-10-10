import type { Cadence, Recurring } from '../types'
import { addDays, addMonths, daysBetween } from './dates'

/** Recurring items show as alerts this many days before they are due. */
export const DUE_WINDOW_DAYS = 5
/** An expense this many days before the due date can count as paying it. */
export const EARLY_PAYMENT_DAYS = 10
/** An expense matches a recurring item by category when its amount is within this fraction. */
export const AMOUNT_TOLERANCE = 0.25

const CADENCE_MONTHS: Record<Cadence, number> = { monthly: 1, quarterly: 3, yearly: 12 }

export const CADENCE_LABEL: Record<Cadence, string> = { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }

export function advance(dateIso: string, cadence: Cadence): string {
  return addMonths(dateIso, CADENCE_MONTHS[cadence])
}

export interface DueItem {
  item: Recurring
  status: 'overdue' | 'due'
  /** Negative = days overdue */
  daysLeft: number
}

export function dueItems(items: Recurring[], today: string): DueItem[] {
  const horizon = addDays(today, DUE_WINDOW_DAYS)
  return items
    .filter((r) => !r.deleted && r.active && r.nextDueDate <= horizon)
    .map((r) => {
      const daysLeft = daysBetween(today, r.nextDueDate)
      return { item: r, status: daysLeft < 0 ? ('overdue' as const) : ('due' as const), daysLeft }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
}

const sameMerchant = (a: string, b: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase() && a.trim().toLowerCase() !== 'upi'

/**
 * The open recurring item a new expense would pay: same merchant (not "UPI"), or same category with a
 * similar amount, dated no more than EARLY_PAYMENT_DAYS before the due date.
 */
export function matchRecurring(
  items: Recurring[],
  e: { amount: number; date: string; categoryId: string; merchant: string },
): Recurring | undefined {
  return items
    .filter((r) => !r.deleted && r.active && e.date >= addDays(r.nextDueDate, -EARLY_PAYMENT_DAYS))
    .filter(
      (r) =>
        sameMerchant(r.merchant, e.merchant) ||
        (r.categoryId === e.categoryId && Math.abs(e.amount - r.amount) <= r.amount * AMOUNT_TOLERANCE),
    )
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))[0]
}

export function describeDue(item: DueItem): string {
  const d = item.daysLeft
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`
  if (d === 0) return 'Due today'
  return `Due in ${d} day${d === 1 ? '' : 's'}`
}
