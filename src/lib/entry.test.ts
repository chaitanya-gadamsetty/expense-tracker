import { describe, expect, it } from 'vitest'
import type { Category, Expense } from '../types'
import { PRESET_CATEGORIES } from './categories'
import { parseEntry, recurringFor, withCategory, newDraft } from './entry'

const TODAY = '2026-10-10'
const categories: Category[] = PRESET_CATEGORIES.map((c, i) => ({ ...c, archived: false, order: i, deleted: 0, updatedAt: 0 }))
const exp = (over: Partial<Expense>): Expense => ({
  id: Math.random().toString(36), amount: 100, date: '2026-10-01', categoryId: 'others', merchant: '', spendType: 'need',
  paidBy: 'p1', method: 'UPI', account: '', note: '', source: 'manual', recurringId: '', deleted: 0, updatedAt: 1, ...over,
})
const ctx = (expenses: Expense[] = []) => ({ today: TODAY, owner: 'p2' as const, categories, expenses })

const ICICI_UPI = 'ICICI Bank Acct XX035 debited for Rs 93.00 on 09-Oct-26; SHASHANK GUPTA credited. UPI:101514865918. Call 18002662 for dispute. SMS BLOCK 035 to 9215676766'
const SWIGGY = 'Spent Rs.1044 On HDFC Bank Card 1762 At SWIGGY E COM On 2026-10-10:15:48:47.Not You? To Block+Reissue Call 18002586161/SMS BLOCK CC 1762 to 7308080808'

describe('parseEntry', () => {
  it('SMS + narrative: category from narrative keywords, paid by device owner', () => {
    const p = parseEntry(`${ICICI_UPI} vegetables`, ctx())
    expect(p.isSms).toBe(true)
    expect(p.draft).toMatchObject({ amount: '93', merchant: 'UPI', categoryId: 'groceries', spendType: 'need', note: 'vegetables', paidBy: 'p2', method: 'UPI', source: 'sms' })
    expect(p.categoryFrom).toBe('keyword')
  })

  it('UPI with no narrative leaves category for the user to pick', () => {
    const p = parseEntry(ICICI_UPI, ctx([exp({ merchant: 'UPI', categoryId: 'health' })]))
    expect(p.draft.categoryId).toBe('')
  })

  it('merchant memory beats keywords (not for UPI)', () => {
    const p = parseEntry(SWIGGY, ctx([exp({ merchant: 'Swiggy', categoryId: 'groceries', date: '2026-09-01' })]))
    expect(p.draft.categoryId).toBe('groceries')
    expect(p.categoryFrom).toBe('memory')
  })

  it('merchant keyword when no memory', () => {
    const p = parseEntry(SWIGGY, ctx())
    expect(p.draft).toMatchObject({ categoryId: 'food', spendType: 'want', merchant: 'Swiggy', account: 'HDFC Card ••1762' })
  })

  it('voice: category words become the note, not the merchant', () => {
    const p = parseEntry('spent 450 on vegetables today', ctx())
    expect(p.draft).toMatchObject({ amount: '450', merchant: '', note: 'vegetables', categoryId: 'groceries', method: 'UPI' })
    expect(p.methodAssumed).toBe(true)
  })

  it('voice: short name becomes the merchant', () => {
    expect(parseEntry('Swiggy 380 by card', ctx()).draft).toMatchObject({ merchant: 'Swiggy', method: 'Card', categoryId: 'food' })
  })

  it('voice: "at" names the merchant', () => {
    expect(parseEntry('1200 groceries at More Supermarket yesterday', ctx()).draft).toMatchObject({ merchant: 'More Supermarket', note: 'groceries', categoryId: 'groceries' })
  })

  it('investment SMS is flagged', () => {
    expect(parseEntry('Rs 10,000 debited from HDFC Bank A/c XX1234 towards NACH ICCL ZERODHA', ctx()).investment).toBe(true)
  })

  it('credit SMS is flagged', () => {
    expect(parseEntry('Rs 450.00 refund credited to HDFC Bank Card 1762 from SWIGGY', ctx()).isCredit).toBe(true)
  })

  it('missing amount is reported', () => {
    expect(parseEntry('vegetables yesterday', ctx()).missingAmount).toBe(true)
  })
})

describe('withCategory', () => {
  it('sets default spend type until the user picks one', () => {
    const d = withCategory(newDraft(), 'rent', categories)
    expect(d.spendType).toBe('essential')
    expect(withCategory({ ...d, spendType: 'waste', spendTypeSet: true }, 'food', categories).spendType).toBe('waste')
  })
})

describe('recurringFor', () => {
  const rent = { id: 'r1', name: 'Rent', amount: 25000, categoryId: 'rent', merchant: '', cadence: 'monthly' as const, nextDueDate: '2026-10-05', active: true, deleted: 0 as const, updatedAt: 1 }
  it('matches by category and similar amount near the due date', () => {
    expect(recurringFor(newDraft({ amount: '25000', date: '2026-10-03', categoryId: 'rent' }), [rent])?.id).toBe('r1')
  })
  it('ignores different amounts and far-early dates', () => {
    expect(recurringFor(newDraft({ amount: '9000', date: '2026-10-03', categoryId: 'rent' }), [rent])).toBeUndefined()
    expect(recurringFor(newDraft({ amount: '25000', date: '2026-09-10', categoryId: 'rent' }), [rent])).toBeUndefined()
  })
  it('does not match edits of existing expenses', () => {
    expect(recurringFor(newDraft({ id: 'x', amount: '25000', date: '2026-10-03', categoryId: 'rent' }), [rent])).toBeUndefined()
  })
})
