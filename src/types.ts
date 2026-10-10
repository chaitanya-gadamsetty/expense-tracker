export const SPEND_TYPES = ['essential', 'need', 'want', 'waste'] as const
export type SpendType = (typeof SPEND_TYPES)[number]

export const SPEND_TYPE_LABEL: Record<SpendType, string> = {
  essential: 'Essential',
  need: 'Need',
  want: 'Want',
  waste: 'Waste',
}

export const METHODS = ['UPI', 'Card', 'Cash', 'Bank', 'Other'] as const
export type Method = (typeof METHODS)[number]

export const CADENCES = ['monthly', 'quarterly', 'yearly'] as const
export type Cadence = (typeof CADENCES)[number]

/** Two people per household. Names live in Settings; records store the stable id. */
export const PEOPLE = ['p1', 'p2'] as const
export type Person = (typeof PEOPLE)[number]

export type EntrySource = 'sms' | 'voice' | 'manual' | 'recurring'

/** Every synced record carries these so devices can merge record-by-record. */
export interface SyncFields {
  id: string
  updatedAt: number
  /** 1 = deleted (kept as tombstone so the delete syncs). Number so Dexie can index it. */
  deleted: 0 | 1
}

export interface Category extends SyncFields {
  name: string
  /** Emoji */
  icon: string
  /** Index into the chart palette (0–7) */
  color: number
  defaultType: SpendType
  archived: boolean
  order: number
}

export interface Expense extends SyncFields {
  amount: number
  /** Local date, YYYY-MM-DD */
  date: string
  categoryId: string
  merchant: string
  spendType: SpendType
  paidBy: Person
  method: Method
  /** e.g. "HDFC Card ••1762". Last 4 digits only, never full numbers. */
  account: string
  note: string
  source: EntrySource
  recurringId: string
}

export interface Recurring extends SyncFields {
  name: string
  amount: number
  categoryId: string
  merchant: string
  cadence: Cadence
  /** YYYY-MM-DD */
  nextDueDate: string
  active: boolean
}

export interface Settings {
  id: 'settings'
  /** Overall monthly household budget */
  monthlyBudget: number
  /** Monthly budget per category id; missing = no category budget */
  categoryBudgets: Record<string, number>
  names: Record<Person, string>
  spikeMultiplier: number
  setupDone: boolean
  lastBackupAt: number
  updatedAt: number
}

/** Per-device values that are never backed up or synced. */
export interface DeviceInfo {
  id: 'device'
  owner: Person | ''
}
