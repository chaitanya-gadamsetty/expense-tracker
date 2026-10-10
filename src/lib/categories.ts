// Preset categories, keyword → category hints, and merchant display-name aliases.
// Preset ids are stable strings so keyword hints and backups always point at the same category.

import type { Category, SpendType } from '../types'

type Preset = Pick<Category, 'id' | 'name' | 'icon' | 'color' | 'defaultType'>

export const PRESET_CATEGORIES: Preset[] = [
  { id: 'groceries', name: 'Groceries', icon: '🛒', color: 2, defaultType: 'need' },
  { id: 'food', name: 'Food & Dining', icon: '🍽️', color: 1, defaultType: 'want' },
  { id: 'transport', name: 'Transport & Fuel', icon: '⛽', color: 0, defaultType: 'need' },
  { id: 'rent', name: 'Rent & EMI', icon: '🏠', color: 6, defaultType: 'essential' },
  { id: 'utilities', name: 'Utilities & Bills', icon: '💡', color: 3, defaultType: 'essential' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', color: 4, defaultType: 'want' },
  { id: 'health', name: 'Health', icon: '💊', color: 7, defaultType: 'essential' },
  { id: 'education', name: 'Education', icon: '📚', color: 5, defaultType: 'essential' },
  { id: 'kids', name: 'Kids', icon: '🧸', color: 4, defaultType: 'need' },
  { id: 'travel', name: 'Travel', icon: '✈️', color: 0, defaultType: 'want' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', color: 3, defaultType: 'want' },
  { id: 'subscriptions', name: 'Subscriptions', icon: '📺', color: 6, defaultType: 'want' },
  { id: 'household', name: 'Household Help', icon: '🧹', color: 5, defaultType: 'need' },
  { id: 'gifts', name: 'Gifts', icon: '🎁', color: 7, defaultType: 'want' },
  { id: 'others', name: 'Others', icon: '📦', color: 2, defaultType: 'need' },
]

/** Words in a narrative, voice phrase or merchant name that suggest a preset category. */
const KEYWORDS: Record<string, string[]> = {
  groceries: ['grocery', 'groceries', 'vegetable', 'vegetables', 'veggies', 'fruit', 'fruits', 'milk', 'curd', 'eggs', 'kirana', 'provisions', 'bigbasket', 'blinkit', 'zepto', 'instamart', 'dmart', 'more supermarket', 'ratnadeep', 'jiomart', 'nature basket'],
  food: ['food', 'dinner', 'lunch', 'breakfast', 'brunch', 'snack', 'snacks', 'coffee', 'tea', 'chai', 'restaurant', 'cafe', 'hotel food', 'pizza', 'biryani', 'swiggy', 'zomato', 'dining', 'starbucks', 'dominos', 'mcdonalds', 'kfc', 'eat', 'treat'],
  transport: ['petrol', 'diesel', 'fuel', 'cng', 'uber', 'ola', 'rapido', 'auto', 'cab', 'taxi', 'metro', 'bus', 'parking', 'toll', 'fastag', 'service centre', 'car wash', 'indian oil', 'hpcl', 'bpcl', 'shell'],
  rent: ['rent', 'emi', 'loan', 'maintenance charges', 'society maintenance'],
  utilities: ['electricity', 'power bill', 'bescom', 'tneb', 'water bill', 'gas', 'cylinder', 'lpg', 'broadband', 'wifi', 'internet', 'recharge', 'mobile bill', 'postpaid', 'airtel', 'jio', 'vodafone', 'dth', 'tata play', 'bill'],
  shopping: ['shopping', 'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'nykaa', 'clothes', 'dress', 'shoes', 'electronics', 'decathlon', 'ikea', 'croma'],
  health: ['medicine', 'medicines', 'pharmacy', 'chemist', 'doctor', 'hospital', 'clinic', 'apollo', 'medplus', 'pharmeasy', 'netmeds', '1mg', 'tata 1mg', 'lab test', 'diagnostics', 'dental', 'dentist', 'gym', 'insurance'],
  education: ['school', 'fees', 'tuition', 'books', 'course', 'college', 'exam', 'stationery'],
  kids: ['kids', 'toys', 'toy', 'diapers', 'baby', 'daycare', 'creche'],
  travel: ['flight', 'flights', 'train', 'irctc', 'makemytrip', 'goibibo', 'cleartrip', 'trip', 'vacation', 'holiday', 'airbnb', 'oyo', 'hotel stay', 'redbus', 'indigo'],
  entertainment: ['movie', 'movies', 'cinema', 'pvr', 'inox', 'bookmyshow', 'concert', 'game', 'games', 'outing', 'party'],
  subscriptions: ['subscription', 'netflix', 'prime', 'hotstar', 'jiocinema', 'spotify', 'youtube premium', 'icloud', 'google one', 'apple', 'chatgpt'],
  household: ['maid', 'cook', 'driver', 'house help', 'househelp', 'cleaning', 'servant', 'laundry', 'ironing', 'dhobi', 'plumber', 'electrician', 'carpenter', 'urban company'],
  gifts: ['gift', 'gifts', 'birthday', 'wedding', 'present', 'donation'],
}

const KEYWORD_LIST: Array<[RegExp, string]> = Object.entries(KEYWORDS).flatMap(([cat, words]) =>
  words.map((w) => [new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'i'), cat] as [RegExp, string]),
)

/** First preset category whose keyword appears in the text (longest keyword wins on ties). */
export function categoryFromText(text: string): string | undefined {
  if (!text.trim()) return undefined
  let best: { cat: string; len: number; at: number } | undefined
  for (const [re, cat] of KEYWORD_LIST) {
    const m = re.exec(text)
    if (!m) continue
    if (!best || m.index < best.at || (m.index === best.at && m[0].length > best.len)) best = { cat, len: m[0].length, at: m.index }
  }
  return best?.cat
}

/**
 * True when every word of the text is a category keyword or filler ("vegetables", "petrol and parking").
 * Known brands ("Swiggy", "Uber") are merchants, not category words.
 */
export function isOnlyCategoryWords(text: string): boolean {
  if (MERCHANT_ALIASES.some(([re]) => re.test(text))) return false
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const filler = new Set(['and', 'for', 'the', 'some', 'my', 'our', 'of', 'a', 'an', 'bill', 'stuff', 'items', 'things'])
  return words.length > 0 && words.every((w) => filler.has(w) || KEYWORD_LIST.some(([re, cat]) => re.test(w) && !!cat))
}

// ---------- merchant display names ----------

export const MERCHANT_ALIASES: Array<[RegExp, string]> = [
  [/swiggy/i, 'Swiggy'],
  [/zomato/i, 'Zomato'],
  [/flipkart/i, 'Flipkart'],
  [/amazon\s*pay|amazon|amzn/i, 'Amazon'],
  [/myntra/i, 'Myntra'],
  [/bigbasket|innovative retail/i, 'BigBasket'],
  [/blinkit|grofers/i, 'Blinkit'],
  [/zepto|kiranakart/i, 'Zepto'],
  [/uber/i, 'Uber'],
  [/\bola\b|ani technologies/i, 'Ola'],
  [/rapido|roppen/i, 'Rapido'],
  [/irctc/i, 'IRCTC'],
  [/bookmyshow|bigtree/i, 'BookMyShow'],
  [/makemytrip/i, 'MakeMyTrip'],
  [/netflix/i, 'Netflix'],
  [/spotify/i, 'Spotify'],
  [/apollo/i, 'Apollo'],
  [/dmart|avenue supermarts/i, 'DMart'],
  [/reliance\s*(?:retail|fresh|smart)/i, 'Reliance Retail'],
  [/jiomart/i, 'JioMart'],
  [/airtel/i, 'Airtel'],
  [/jio\b|reliance jio/i, 'Jio'],
]

const CORP_SUFFIX = /\b(?:pvt|private|ltd|limited|llp|inc|india|internet|e\s*com|ecom|technologies|tech|services|retail|payments?|online|co)\b\.?/gi

/** "SWIGGY E COM" → "Swiggy", "Flipkart Internet PVT" → "Flipkart", "SOME SHOP PVT LTD" → "Some Shop". */
export function cleanMerchant(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim()
  if (!s) return ''
  for (const [re, name] of MERCHANT_ALIASES) if (re.test(s)) return name
  const stripped = s.replace(CORP_SUFFIX, ' ').replace(/[^\p{L}\p{N}&'.\- ]/gu, ' ').replace(/\s+/g, ' ').trim() || s
  return stripped.toLowerCase().replace(/(^|[\s\-&])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase())
}

export function defaultTypeFor(categoryId: string, categories: Array<Pick<Category, 'id' | 'defaultType'>>): SpendType {
  return categories.find((c) => c.id === categoryId)?.defaultType ?? 'need'
}
