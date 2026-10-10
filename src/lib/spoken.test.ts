import { describe, expect, it } from 'vitest'
import { parseSpoken } from './spoken'

const TODAY = '2026-10-10' // a Saturday

describe('parseSpoken', () => {
  it.each([
    ['spent 450 on vegetables today', { amount: 450, what: 'vegetables', date: '2026-10-10', dateAssumed: false }],
    ['1.2K petrol yesterday', { amount: 1200, what: 'petrol', date: '2026-10-09' }],
    ['paid rent 25000 on 1st', { amount: 25000, what: 'rent', date: '2026-10-01' }],
    ['Swiggy 380 by card', { amount: 380, what: 'Swiggy', method: 'Card', dateAssumed: true }],
    ['five hundred for milk in cash', { amount: 500, what: 'milk', method: 'Cash' }],
    ['spent ₹1,250 at DMart on 5 Oct', { amount: 1250, what: 'DMart', date: '2026-10-05' }],
    ['2 lakh school fees on 3/10', { amount: 200000, what: 'school fees', date: '2026-10-03' }],
    ['maid salary 6000 last Sunday via gpay', { amount: 6000, what: 'maid salary', date: '2026-10-04', method: 'UPI' }],
    ['93.50 for tea', { amount: 93.5, what: 'tea' }],
  ])('%s', (text, expected) => {
    expect(parseSpoken(text, TODAY)).toMatchObject(expected)
  })

  it('on 25th when today is the 10th means last month', () => {
    expect(parseSpoken('maid 6000 on 25th', TODAY).date).toBe('2026-09-25')
  })

  it('no amount', () => {
    expect(parseSpoken('vegetables yesterday', TODAY).amount).toBeUndefined()
  })
})
