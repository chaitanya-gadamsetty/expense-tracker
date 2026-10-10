const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const inr0 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/** 120000 -> "₹1,20,000"; 93.5 -> "₹93.5" is shown as "₹93.50" */
export function formatINR(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  if (Number.isInteger(rounded)) return inr0.format(rounded)
  return inr.format(rounded).replace(/\.(\d)$/, '.$10')
}

/** Short form for chart labels: ₹950, ₹12K, ₹1.2L */
export function formatShort(amount: number): string {
  const a = Math.round(amount)
  if (a >= 100000) return `₹${trim(a / 100000)}L`
  if (a >= 1000) return `₹${trim(a / 1000)}K`
  return `₹${a}`
}
const trim = (n: number) => (n >= 10 ? Math.round(n).toString() : (Math.round(n * 10) / 10).toString())

export function newId(): string {
  // randomUUID needs a secure context (https/localhost); fall back for plain-http LAN testing.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && globalThis.isSecureContext !== false) {
    return crypto.randomUUID()
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
