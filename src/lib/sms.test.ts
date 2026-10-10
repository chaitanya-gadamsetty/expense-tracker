import { describe, expect, it } from 'vitest'
import { looksLikeInvestment, looksLikeSms, parseSms } from './sms'

const TODAY = '2026-10-10'

// Real samples from the user (account numbers already masked by the bank).
const HDFC_CARD_SWIGGY = 'Spent Rs.1044 On HDFC Bank Card 1762 At SWIGGY E COM On 2026-10-10:15:48:47.Not You? To Block+Reissue Call 18002586161/SMS BLOCK CC 1762 to 7308080808'
const HDFC_CARD_FLIPKART = 'Spent Rs.1446 On HDFC Bank Card 1762 At Flipkart Internet PVT On 2026-10-09:08:52:45.Not You? To Block+Reissue Call 18002586161/SMS BLOCK CC 1762 to 7308080808'
const ICICI_UPI = 'ICICI Bank Acct XX035 debited for Rs 93.00 on 09-Oct-26; SHASHANK GUPTA credited. UPI:101514865918. Call 18002662 for dispute. SMS BLOCK 035 to 9215676766'
const HDFC_CARD_ON_UPI = `Txn Rs.40.00
On HDFC Bank Card 6707
At paytmqr6j4c2e@ptys 
by UPI 510010238301
On 10-10
Not You?
Call 18002586161/SMS BLOCK CC 6707 to 7308080808`

describe('real samples', () => {
  it('HDFC credit card at Swiggy', () => {
    expect(parseSms(HDFC_CARD_SWIGGY, TODAY)).toMatchObject({
      kind: 'debit', amount: 1044, date: '2026-10-10', merchant: 'Swiggy', method: 'Card', account: 'HDFC Card ••1762', narrative: '',
    })
  })

  it('HDFC credit card at Flipkart', () => {
    expect(parseSms(HDFC_CARD_FLIPKART, TODAY)).toMatchObject({
      kind: 'debit', amount: 1446, date: '2026-10-09', merchant: 'Flipkart', method: 'Card', account: 'HDFC Card ••1762',
    })
  })

  it('ICICI UPI to a person: merchant is "UPI", payee name dropped', () => {
    const r = parseSms(ICICI_UPI, TODAY)
    expect(r).toMatchObject({ kind: 'debit', amount: 93, date: '2026-10-09', merchant: 'UPI', method: 'UPI', account: 'UPI (ICICI ••035)' })
    expect(JSON.stringify(r)).not.toMatch(/SHASHANK/i)
  })

  it('HDFC card used over UPI, multi-line, date without year', () => {
    expect(parseSms(HDFC_CARD_ON_UPI, TODAY)).toMatchObject({
      kind: 'debit', amount: 40, date: '2026-10-10', merchant: 'UPI', method: 'UPI', account: 'UPI (HDFC Card ••6707)', narrative: '',
    })
  })
})

describe('narrative', () => {
  it('words after the SMS become the note', () => {
    expect(parseSms(`${ICICI_UPI} vegetables`, TODAY).narrative).toBe('vegetables')
    expect(parseSms(`${HDFC_CARD_SWIGGY}\ndinner with team`, TODAY).narrative).toBe('dinner with team')
    expect(parseSms(`${HDFC_CARD_ON_UPI}\nauto to office`, TODAY).narrative).toBe('auto to office')
  })

  it('words before the SMS become the note', () => {
    expect(parseSms(`Milk and eggs: ${ICICI_UPI}`, TODAY).narrative).toBe('Milk and eggs')
  })
})

describe('dates', () => {
  it('missing year that would be in the future uses last year', () => {
    const sms = HDFC_CARD_ON_UPI.replace('On 10-10', 'On 28-12')
    expect(parseSms(sms, '2027-01-03').date).toBe('2026-12-28')
  })

  it.each([
    ['Rs 500 debited from A/c XX1234 on 05Oct26 UPI', '2026-10-05'],
    ['Rs 500 debited from A/c XX1234 on 05/10/2026 UPI', '2026-10-05'],
    ['Rs 500 debited from A/c XX1234 on 5 Oct 2026 UPI', '2026-10-05'],
  ])('%s', (sms, date) => {
    expect(parseSms(sms, TODAY).date).toBe(date)
  })
})

describe('kinds and detection', () => {
  it('flags refunds and credits', () => {
    expect(parseSms('Rs 450.00 refund credited to HDFC Bank Card 1762 from SWIGGY', TODAY).kind).toBe('credit')
    expect(parseSms('ICICI Bank Acct XX035 credited with Rs 5,000.00 on 09-Oct-26 by IMPS', TODAY).kind).toBe('credit')
  })

  it('amount with commas', () => {
    expect(parseSms('Spent INR 12,450.50 on Axis Bank Card XX9876 at AMAZON PAY on 08-10-26', TODAY)).toMatchObject({
      amount: 12450.5, merchant: 'Amazon', account: 'Axis Card ••9876', date: '2026-10-08',
    })
  })

  it('tells SMS from a spoken entry', () => {
    expect(looksLikeSms(HDFC_CARD_SWIGGY)).toBe(true)
    expect(looksLikeSms(ICICI_UPI)).toBe(true)
    expect(looksLikeSms(HDFC_CARD_ON_UPI)).toBe(true)
    expect(looksLikeSms('spent 450 on vegetables today')).toBe(false)
    expect(looksLikeSms('paid rs 200 for auto by upi')).toBe(false)
  })
})

describe('investment guard', () => {
  it.each([
    'Your SIP of Rs 5000 in Axis Bluechip Fund has been processed',
    'Rs 10,000 debited from HDFC Bank A/c XX1234 towards NACH ICCL ZERODHA',
    'RD instalment of Rs.2000 debited from A/c XX035',
    'Rs 5000 debited for BSE STAR MF',
  ])('%s', (t) => expect(looksLikeInvestment(t)).toBe(true))

  it('ignores ordinary spends', () => {
    expect(looksLikeInvestment(HDFC_CARD_SWIGGY)).toBe(false)
    expect(looksLikeInvestment(ICICI_UPI)).toBe(false)
  })
})
