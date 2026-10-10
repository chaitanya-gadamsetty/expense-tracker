// Rule-based parser for spoken/typed expenses, e.g.
//   "spent 450 on vegetables today", "1.2K petrol yesterday", "paid rent 25000 on 1st", "Swiggy 380 by card"
// Same approach as the donation tracker: find and blank out each recognised piece (method, date, amount),
// then whatever words remain describe what the money was for.

import type { Method } from '../types'
import { MONTHS, addDays, fromISO, isValidDate, toISO } from './dates'

export interface SpokenResult {
  amount?: number
  /** YYYY-MM-DD */
  date: string
  dateAssumed: boolean
  method?: Method
  /** What it was for, e.g. "vegetables", "Swiggy", "rent" */
  what: string
}

// ---------- number words ----------

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}
const MULT: Record<string, number> = {
  hundred: 100, thousand: 1000, lakh: 100000, lakhs: 100000, lac: 100000, lacs: 100000,
}
const NUM_WORD = `(?:${[...Object.keys(SMALL), ...Object.keys(MULT)].join('|')})`
const NUM_SEQ = new RegExp(`\\b${NUM_WORD}(?:(?:\\s+|\\s*-\\s*|\\s+and\\s+)${NUM_WORD})*\\b`, 'gi')

function wordsToNumber(seq: string): number | null {
  const words = seq.toLowerCase().split(/[\s-]+/).filter((w) => w && w !== 'and')
  if (!words.some((w) => w in MULT || SMALL[w] >= 10)) return null // leave a lone "one"/"five" alone
  let total = 0
  let current = 0
  for (const w of words) {
    if (w in SMALL) current += SMALL[w]
    else if (w === 'hundred') current = (current || 1) * 100
    else {
      total += (current || 1) * MULT[w]
      current = 0
    }
  }
  return total + current
}

// ---------- dates ----------

const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const ORD = '(?:st|nd|rd|th)?'
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const monthIndex = (t: string) => MONTHS.findIndex((m) => m.startsWith(t.toLowerCase().slice(0, 3)))

/** Day+month with optional year; without a year pick the most recent past occurrence. */
function pastDate(mIdx: number, day: number, year: number | undefined, today: string): string | null {
  const t = fromISO(today)
  if (year) return isValidDate(year, mIdx, day) ? toISO(new Date(year, mIdx, day)) : null
  for (const y of [t.getFullYear(), t.getFullYear() - 1]) {
    if (isValidDate(y, mIdx, day)) {
      const iso = toISO(new Date(y, mIdx, day))
      if (iso <= today) return iso
    }
  }
  return null
}

interface Hit { date: string; start: number; end: number }

export function findSpokenDate(text: string, today: string): Hit | null {
  const lead = '(?:\\b(?:on|dated)\\s+)?(?:the\\s+)?'
  const yr = '(?:\\s*,?\\s*(\\d{4}))?'
  const t = fromISO(today)
  const patterns: Array<[RegExp, (m: RegExpExecArray) => string | null]> = [
    [new RegExp(`${lead}\\bday before yesterday\\b`, 'i'), () => addDays(today, -2)],
    [new RegExp(`${lead}\\byesterday\\b`, 'i'), () => addDays(today, -1)],
    [new RegExp(`${lead}\\b(?:today|this morning|this evening|tonight)\\b`, 'i'), () => today],
    [/\b(\d{1,2})\s+days?\s+ago\b/i, (m) => addDays(today, -Number(m[1]))],
    [
      new RegExp(`${lead}\\b(?:last|this past|previous)\\s+(${WEEKDAYS.join('|')})\\b`, 'i'),
      (m) => {
        let diff = t.getDay() - WEEKDAYS.indexOf(m[1].toLowerCase())
        if (diff <= 0) diff += 7
        return addDays(today, -diff)
      },
    ],
    [new RegExp(`${lead}\\b${MONTH_RE}\\s+(?:the\\s+)?(\\d{1,2})${ORD}\\b${yr}`, 'i'), (m) => pastDate(monthIndex(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined, today)],
    [new RegExp(`${lead}\\b(\\d{1,2})${ORD}\\s+(?:of\\s+)?${MONTH_RE}\\b${yr}`, 'i'), (m) => pastDate(monthIndex(m[2]), Number(m[1]), m[3] ? Number(m[3]) : undefined, today)],
    // 5/10, 5-10-26 (DD/MM). No dots: "1.5k" is an amount, not a date.
    [new RegExp(`${lead}\\b(\\d{1,2})[/-](\\d{1,2})(?:[/-](\\d{2}|\\d{4}))?\\b`, 'i'), (m) => pastDate(Number(m[2]) - 1, Number(m[1]), m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined, today)],
    // "on 1st", "on the 5th" — this month, or last month if that day hasn't come yet
    [
      /\bon\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i,
      (m) => {
        const day = Number(m[1])
        const thisMonth = isValidDate(t.getFullYear(), t.getMonth(), day) ? toISO(new Date(t.getFullYear(), t.getMonth(), day)) : null
        if (thisMonth && thisMonth <= today) return thisMonth
        const prev = new Date(t.getFullYear(), t.getMonth() - 1, 1)
        return isValidDate(prev.getFullYear(), prev.getMonth(), day) ? toISO(new Date(prev.getFullYear(), prev.getMonth(), day)) : null
      },
    ],
  ]
  for (const [re, resolve] of patterns) {
    const m = re.exec(text)
    if (m) {
      const date = resolve(m)
      if (date) return { date, start: m.index, end: m.index + m[0].length }
    }
  }
  return null
}

// ---------- helpers ----------

function blank(s: string, start: number, end: number): string {
  return s.slice(0, start) + ' '.repeat(end - start) + s.slice(end)
}

const METHOD_RE = /\b(?:(?:via|through|by|using|with|in|on)\s+)?(upi|g\s?pay|google pay|phone\s?pe|paytm|bhim|credit card|debit card|card|cash|neft|imps|net\s?banking|bank transfer)\b/i
const METHOD_MAP: Array<[RegExp, Method]> = [
  [/upi|g\s?pay|google pay|phone\s?pe|paytm|bhim/i, 'UPI'],
  [/card/i, 'Card'],
  [/cash/i, 'Cash'],
  [/neft|imps|net\s?banking|bank/i, 'Bank'],
]

const AMOUNT_RE = /(?:\b(?:rs\.?|inr|rupees)\s*)?\b(\d+(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|l)?\b(?:\s*(?:rupees|rs\.?|inr|bucks|\/-))?/i
const UNIT: Record<string, number> = { k: 1e3, thousand: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5 }

const STOP = new Set(['i', 'we', 'have', 'has', 'just', 'had', 'spent', 'spend', 'paid', 'pay', 'gave', 'bought', 'buy', 'for', 'on', 'at', 'to', 'towards', 'the', 'a', 'an', 'my', 'our', 'some', 'of', 'and', 'expense', 'expenses', 'was', 'is', 'it', 'rs', 'rupees', 'inr'])

/** Drop filler words from both ends: "spent on vegetables for" → "vegetables". */
function trimFiller(text: string): string {
  const words = text.split(' ').filter(Boolean)
  while (words.length && STOP.has(words[0].toLowerCase())) words.shift()
  while (words.length && STOP.has(words[words.length - 1].toLowerCase())) words.pop()
  return words.join(' ')
}

// ---------- main ----------

export function parseSpoken(input: string, today: string): SpokenResult {
  let s = ' ' + input.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim() + ' '
  s = s.replace(/₹\s*/g, ' rs ')
  s = s.replace(/(\d),(?=\d{2,3}\b)/g, '$1') // 1,20,000 -> 120000
  s = s.replace(/\ban?\s+(hundred|thousand|lakh)\b/gi, 'one $1')
  s = s.replace(NUM_SEQ, (seq, offset: number, str: string) => {
    if (/\d\s*$/.test(str.slice(0, offset)) && seq.split(/\s/)[0].toLowerCase() in MULT) return seq
    const n = wordsToNumber(seq)
    return n === null ? seq : String(n)
  })
  s = s.replace(/\s+/g, ' ')

  const result: SpokenResult = { date: today, dateAssumed: true, what: '' }

  const m = METHOD_RE.exec(s)
  if (m) {
    result.method = METHOD_MAP.find(([re]) => re.test(m[1]))?.[1]
    s = blank(s, m.index, m.index + m[0].length)
  }

  const d = findSpokenDate(s, today)
  if (d) {
    result.date = d.date
    result.dateAssumed = false
    s = blank(s, d.start, d.end)
  }

  const a = AMOUNT_RE.exec(s)
  if (a) {
    const unit = a[2]?.toLowerCase()
    result.amount = Math.round(Number(a[1]) * (unit ? UNIT[unit] : 1) * 100) / 100
    s = blank(s, a.index, a.index + a[0].length)
  }

  // Whatever is left (first non-empty chunk) says what it was for.
  result.what = s
    .split(/\s{2,}|[,.;!?]/)
    .map((c) => trimFiller(c.trim()))
    .filter(Boolean)
    .join(' ')
  return result
}
