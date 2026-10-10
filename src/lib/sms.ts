// Rule-based reader for Indian bank / card / UPI transaction SMS, e.g.
//   "Spent Rs.1044 On HDFC Bank Card 1762 At SWIGGY E COM On 2026-10-10:15:48:47.Not You? …"
//   "ICICI Bank Acct XX035 debited for Rs 93.00 on 09-Oct-26; SHASHANK GUPTA credited. UPI:101514865918. …"
//   "Txn Rs.40.00\nOn HDFC Bank Card 6707\nAt paytmqr6j4c2e@ptys\nby UPI 510010238301\nOn 10-10\nNot You? …"
// Anything the user types before or after the SMS is returned as `narrative`.
// Privacy: only the last 3–4 digits of an account/card are kept; UPI payee names are dropped.

import type { Method } from '../types'
import { MONTHS, fromISO, isValidDate, toISO } from './dates'
import { cleanMerchant } from './categories'

export interface SmsResult {
  kind: 'debit' | 'credit' | 'unknown'
  amount?: number
  /** YYYY-MM-DD */
  date?: string
  /** Display merchant: "UPI" for every UPI payment, otherwise a cleaned name ("Swiggy"). */
  merchant: string
  method: Method
  /** e.g. "HDFC Card ••1762", "UPI (ICICI ••035)" */
  account: string
  bank: string
  narrative: string
}

const BANKS: Array<[RegExp, string]> = [
  [/\bHDFC\b/i, 'HDFC'],
  [/\bICICI\b/i, 'ICICI'],
  [/\bSBI\b|State Bank/i, 'SBI'],
  [/\bAxis\b/i, 'Axis'],
  [/\bKotak\b/i, 'Kotak'],
  [/\bYes\s*Bank\b/i, 'Yes Bank'],
  [/\bIDFC\b/i, 'IDFC First'],
  [/\bIndusInd\b/i, 'IndusInd'],
  [/\bPNB\b|Punjab National/i, 'PNB'],
  [/\bBank of Baroda\b|\bBoB\b/i, 'Bank of Baroda'],
  [/\bCanara\b/i, 'Canara'],
  [/\bUnion Bank\b/i, 'Union Bank'],
  [/\bAU (?:Small Finance )?Bank\b/i, 'AU Bank'],
  [/\bFederal\b/i, 'Federal'],
  [/\bRBL\b/i, 'RBL'],
  [/\bOneCard\b/i, 'OneCard'],
  [/\bPaytm Payments Bank\b/i, 'Paytm Bank'],
  [/\bAirtel Payments Bank\b/i, 'Airtel Bank'],
]

const AMOUNT_RE = /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i

/**
 * Text that only ever appears in a transaction SMS: an amount plus a bank name, a masked account/card,
 * a long reference number or a UPI handle. Used to tell an SMS from a typed/voice entry.
 */
export function looksLikeSms(text: string): boolean {
  if (!AMOUNT_RE.test(text)) return false
  return BANKS.some(([re]) => re.test(text)) ||
    /\b(?:a\/c|acct|account|card)\b\s*(?:no\.?\s*)?[xX*]*\d{3,4}\b/i.test(text) ||
    /\d{10,}/.test(text) ||
    /[\w.-]+@[a-z]{2,}/i.test(text)
}

// ---------- splitting the SMS from the user's own words ----------

/** Phrases that end a bank SMS (helpline / block instructions). */
const TAIL_RES = [
  /\bSMS\s+BLOCK\b[^\n]*?\bto\s+\+?\d{6,13}\b\.?/gi,
  /\bcall\s+(?:us\s+(?:at|on)\s+)?\+?\d[\d -]{6,15}\d\b(?:\s*(?:for\s+dispute|to\s+report|immediately)\.?)?/gi,
  /\bnot\s+you\??/gi,
  /\b(?:if\s+not\s+(?:done\s+)?by\s+you|not\s+done\s+by\s+you)[^.\n]*[.\n]?/gi,
  /-\s*(?:HDFC|ICICI|SBI|Axis|Kotak)(?:\s+Bank)?\b\.?/gi,
]

/** Words a bank SMS starts with. */
const HEAD_RE = /\b(?:Spent|Txn|Sent|Dear|Your|Rs\.?|INR|₹|A\/c|Acct|Money|Paid|Debited|Alert|UPDATE|Thank|You\s+have|HDFC|ICICI|SBI|Axis|Kotak)/i

function splitNarrative(text: string): { sms: string; narrative: string } {
  let end = -1
  for (const re of TAIL_RES) {
    re.lastIndex = 0
    for (let m = re.exec(text); m; m = re.exec(text)) end = Math.max(end, m.index + m[0].length)
  }
  let sms = text
  let after = ''
  if (end > 0) {
    sms = text.slice(0, end)
    after = text.slice(end)
  } else {
    // No helpline tail: treat a final line with no amount/bank words as the user's note.
    const lines = text.split(/\n/)
    const last = lines[lines.length - 1]
    if (lines.length > 1 && !AMOUNT_RE.test(last) && !/\d{3,}|@/.test(last)) {
      sms = lines.slice(0, -1).join('\n')
      after = last
    }
  }
  let before = ''
  const head = HEAD_RE.exec(sms)
  if (head && head.index > 0) {
    const prefix = sms.slice(0, head.index)
    if (!/\d/.test(prefix)) {
      before = prefix
      sms = sms.slice(head.index)
    }
  }
  const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s.,;:\-–—|]+|[\s.,;:\-–—|]+$/g, '').trim()
  return { sms, narrative: [clean(before), clean(after)].filter(Boolean).join(' · ') }
}

// ---------- dates ----------

const MON = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*'

/** Missing year → this year, unless that lands in the future, then last year. */
function withYear(mIdx: number, day: number, year: number | undefined, today: string): string | undefined {
  const t = fromISO(today)
  if (year !== undefined) return isValidDate(year, mIdx, day) ? toISO(new Date(year, mIdx, day)) : undefined
  let y = t.getFullYear()
  if (!isValidDate(y, mIdx, day)) return undefined
  if (toISO(new Date(y, mIdx, day)) > today) y--
  return isValidDate(y, mIdx, day) ? toISO(new Date(y, mIdx, day)) : undefined
}

const yr = (s?: string) => (s === undefined ? undefined : s.length === 2 ? 2000 + Number(s) : Number(s))
const mon = (s: string) => MONTHS.findIndex((m) => m.startsWith(s.toLowerCase().slice(0, 3)))

export function findSmsDate(sms: string, today: string): string | undefined {
  const patterns: Array<[RegExp, (m: RegExpExecArray) => string | undefined]> = [
    // 2026-10-10 or 2026-10-10:15:48:47
    [/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/, (m) => withYear(Number(m[2]) - 1, Number(m[3]), Number(m[1]), today)],
    // 09-Oct-26, 9 Oct 2026, 09Oct26
    [new RegExp(`\\b(\\d{1,2})[-\\s/]?${MON}[-\\s/,]*(\\d{4}|\\d{2})?\\b`, 'i'), (m) => withYear(mon(m[2]), Number(m[1]), yr(m[3]), today)],
    // Oct 9, 2026
    [new RegExp(`\\b${MON}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s*(\\d{4})?\\b`, 'i'), (m) => withYear(mon(m[1]), Number(m[2]), yr(m[3]), today)],
    // 10-10-26, 10/10/2026 (Indian DD-MM-YY)
    [/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/, (m) => withYear(Number(m[2]) - 1, Number(m[1]), yr(m[3]), today)],
    // "On 10-10" (DD-MM, no year)
    [/\bon\s+(\d{1,2})[-/](\d{1,2})\b(?![-/]\d)/i, (m) => withYear(Number(m[2]) - 1, Number(m[1]), undefined, today)],
  ]
  for (const [re, resolve] of patterns) {
    const m = re.exec(sms)
    if (m) {
      const d = resolve(m)
      if (d) return d
    }
  }
  return undefined
}

// ---------- main ----------

export function parseSms(text: string, today: string): SmsResult {
  const { sms, narrative } = splitNarrative(text.replace(/\r/g, ''))
  const flat = sms.replace(/\s+/g, ' ')

  const a = AMOUNT_RE.exec(flat)
  const amount = a ? Math.round(Number(a[1].replace(/,/g, '')) * 100) / 100 : undefined

  let kind: SmsResult['kind'] = 'unknown'
  if (/\b(refund|refunded|reversed|reversal|cashback)\b/i.test(flat)) kind = 'credit'
  else if (/\b(debited|spent|txn|paid|sent|withdrawn|purchase|payment of|charged|dr\.?)\b/i.test(flat)) kind = 'debit'
  else if (/\b(credited|received|deposited|cr\.?)\b/i.test(flat)) kind = 'credit'

  const bank = BANKS.find(([re]) => re.test(flat))?.[1] ?? ''
  const card = /\bcard\b(?:\s*(?:no\.?|number|ending(?:\s+(?:with|in))?))?\s*[:#]?\s*(?:[xX*]+\s*)?(\d{4})\b/i.exec(flat)
  const acct = /\b(?:a\/c|acct|account|ac)\b(?:\s*(?:no\.?|number|ending(?:\s+(?:with|in))?))?\s*[:#]?\s*(?:[xX*]+\s*)?(\d{3,4})\b/i.exec(flat)
  const isUpi = /\bUPI\b|\bVPA\b|[\w.-]+@[a-z]{2,}/i.test(flat)

  let method: Method = 'Other'
  if (isUpi) method = 'UPI'
  else if (card) method = 'Card'
  else if (/\b(?:ATM|cash withdrawal)\b/i.test(flat)) method = 'Cash'
  else if (acct || /\b(?:NEFT|IMPS|RTGS)\b/i.test(flat)) method = 'Bank'

  const prefix = bank ? `${bank} ` : ''
  const base = card ? `${prefix}Card ••${card[1]}` : acct ? `${prefix}••${acct[1]}` : bank
  const account = method === 'UPI' ? (base ? `UPI (${base})` : 'UPI') : base

  let merchant = ''
  if (method === 'UPI') {
    merchant = 'UPI'
  } else {
    const at = /\b(?:at|to|towards|on account of|info:?)\s+(.+?)(?=\s+on\s+\d|\s+on\s+(?:20\d{2}|\d{1,2}[-/])|\s+(?:via|using|by|ref|avl|bal|for)\b|[.;]\s|$)/i.exec(
      flat.replace(/\bon\s+\w+\s+bank\s+card\s+\d{4}\b/i, ' '),
    )
    if (at) merchant = cleanMerchant(at[1].replace(/\b(?:a\/c|acct)\b.*$/i, ''))
  }

  return { kind, amount, date: findSmsDate(flat, today), merchant, method, account, bank, narrative }
}

// ---------- investment guard ----------

const INVESTMENT_RE = /\b(SIP|NACH|E-?NACH|ACH\s*D|mutual\s*funds?|MF|RD|recurring\s+deposit|FD|fixed\s+deposit|PPF|NPS|zerodha|groww|kuvera|paytm\s+money|upstox|ICCL|BSE\s*STAR|CAMS|KFIN\w*|systematic\s+investment)\b/i

/** True when the text looks like a SIP / RD / FD / mutual-fund / auto-debit-to-investment payment. */
export function looksLikeInvestment(text: string): boolean {
  return INVESTMENT_RE.test(text)
}
