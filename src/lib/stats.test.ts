import { describe, expect, it } from 'vitest'
import type { Expense } from '../types'
import { budgetCrossings, findDuplicate, monthStats, rememberedCategory, spikes, yearStats } from './stats'

const exp = (over: Partial<Expense>): Expense => ({
  id: Math.random().toString(36), amount: 100, date: '2026-10-01', categoryId: 'food', merchant: '', spendType: 'want',
  paidBy: 'p1', method: 'UPI', account: '', note: '', source: 'manual', recurringId: '', deleted: 0, updatedAt: 1, ...over,
})
const TODAY = '2026-10-10'

describe('monthStats', () => {
  const es = [
    exp({ amount: 1000, date: '2026-10-01', categoryId: 'food', merchant: 'Swiggy', spendType: 'want' }),
    exp({ amount: 3000, date: '2026-10-05', categoryId: 'groceries', merchant: 'DMart', spendType: 'need', paidBy: 'p2' }),
    exp({ amount: 500, date: '2026-10-05', categoryId: 'food', merchant: 'swiggy', spendType: 'waste' }),
    exp({ amount: 999, date: '2026-09-30' }),
    exp({ amount: 5000, date: '2026-10-02', deleted: 1 }),
  ]
  const s = monthStats(es, '2026-10', TODAY)
  it('totals, daily average over elapsed days, top category', () => {
    expect(s.total).toBe(4500)
    expect(s.dailyAverage).toBe(450)
    expect(s.topCategory).toEqual({ categoryId: 'groceries', total: 3000 })
    expect(s.daily[4]).toBe(3500)
    expect(s.daily).toHaveLength(31)
  })
  it('splits by spend type, person and merchant (case-insensitive)', () => {
    expect(s.bySpendType).toEqual({ essential: 0, need: 3000, want: 1000, waste: 500 })
    expect(s.byPerson).toEqual({ p1: 1500, p2: 3000 })
    expect(s.topMerchants[0]).toMatchObject({ merchant: 'DMart', total: 3000 })
    expect(s.topMerchants[1]).toMatchObject({ total: 1500, count: 2 })
  })
  it('past month averages over all its days', () => {
    expect(monthStats(es, '2026-09', TODAY).dailyAverage).toBeCloseTo(999 / 30)
  })
  it('year view', () => {
    const y = yearStats(es, 2026)
    expect(y.months[9]).toBe(4500)
    expect(y.months[8]).toBe(999)
    expect(y.total).toBe(5499)
  })
})

describe('budgetCrossings', () => {
  const settings = { monthlyBudget: 100000, categoryBudgets: { food: 5000 } }
  const es = [exp({ amount: 75000, categoryId: 'rent' }), exp({ amount: 3900, categoryId: 'food' })]
  it('warns when crossing 80% and 100%', () => {
    const c = budgetCrossings(es, settings, { amount: 200, date: TODAY, categoryId: 'food' })
    expect(c).toEqual([{ scope: 'category', categoryId: 'food', level: 'warn', spentAfter: 4100, budget: 5000 }])
    const c2 = budgetCrossings(es, settings, { amount: 1500, date: TODAY, categoryId: 'food' })
    expect(c2.map((x) => [x.scope, x.level])).toEqual([['overall', 'warn'], ['category', 'over']])
  })
  it('stays quiet when already past the threshold', () => {
    expect(budgetCrossings([exp({ amount: 4500, categoryId: 'food' })], settings, { amount: 100, date: TODAY, categoryId: 'food' })).toEqual([])
  })
  it('ignores other months and the expense being edited', () => {
    const old = exp({ id: 'me', amount: 3000, categoryId: 'food' })
    expect(budgetCrossings([old], settings, { amount: 3000, date: TODAY, categoryId: 'food' }, 'me')).toEqual([])
    expect(budgetCrossings([exp({ amount: 4900, date: '2026-09-01' })], settings, { amount: 100, date: TODAY, categoryId: 'food' })).toEqual([])
  })
})

describe('spikes', () => {
  const history = ['2026-07', '2026-08', '2026-09'].map((m) => exp({ amount: 2000, date: `${m}-05`, categoryId: 'food' }))
  it('flags a category above 1.5x its 3-month same-point average', () => {
    const now = [...history, exp({ amount: 3500, date: '2026-10-08' })]
    expect(spikes(now, TODAY, 1.5)).toEqual([{ categoryId: 'food', spent: 3500, average: 2000, ratio: 1.75 }])
  })
  it('compares to the same point in earlier months', () => {
    const late = [...history, exp({ amount: 5000, date: '2026-09-25', categoryId: 'food' }), exp({ amount: 3500, date: '2026-10-08' })]
    expect(spikes(late, TODAY, 1.5)).toHaveLength(1) // the 25 Sep spend is after day 10, so not counted
  })
  it('silent without 3 months of history', () => {
    expect(spikes([exp({ amount: 2000, date: '2026-08-05' }), exp({ amount: 9000, date: '2026-10-08' })], TODAY, 1.5)).toEqual([])
  })
  it('silent for small amounts', () => {
    const small = ['2026-07', '2026-08', '2026-09'].map((m) => exp({ amount: 100, date: `${m}-05` }))
    expect(spikes([...small, exp({ amount: 900, date: '2026-10-08' })], TODAY, 1.5)).toEqual([])
  })
})

describe('duplicates and merchant memory', () => {
  const es = [exp({ id: 'a', amount: 93, date: '2026-10-09', merchant: 'UPI' }), exp({ id: 'b', merchant: 'Swiggy', categoryId: 'groceries', date: '2026-10-02' }), exp({ merchant: 'swiggy', categoryId: 'food', date: '2026-09-01' })]
  it('finds same amount + date + merchant', () => {
    expect(findDuplicate(es, { amount: 93, date: '2026-10-09', merchant: 'upi' })?.id).toBe('a')
    expect(findDuplicate(es, { amount: 93, date: '2026-10-09', merchant: 'UPI' }, 'a')).toBeUndefined()
    expect(findDuplicate(es, { amount: 94, date: '2026-10-09', merchant: 'UPI' })).toBeUndefined()
  })
  it('remembers the latest category per merchant, never for UPI', () => {
    expect(rememberedCategory(es, 'SWIGGY')).toBe('groceries')
    expect(rememberedCategory([exp({ merchant: 'UPI', categoryId: 'health' })], 'UPI')).toBeUndefined()
  })
})
