import Dexie, { type Table } from 'dexie'
import type { Category, DeviceInfo, Expense, Person, Recurring, Settings } from './types'
import { PRESET_CATEGORIES } from './lib/categories'
import { newId } from './lib/format'
import { advance } from './lib/recurring'

class ExpenseDB extends Dexie {
  expenses!: Table<Expense, string>
  categories!: Table<Category, string>
  recurring!: Table<Recurring, string>
  settings!: Table<Settings, string>
  /** Per-device only (who owns this phone). Not backed up or synced. */
  device!: Table<DeviceInfo, string>

  constructor() {
    super('expense-tracker')
    this.version(1).stores({
      expenses: 'id, date, categoryId, merchant, deleted, updatedAt',
      categories: 'id, deleted, updatedAt',
      recurring: 'id, nextDueDate, deleted, updatedAt',
      settings: 'id',
      device: 'id',
    })
    // Seed preset categories on first open. updatedAt 0 so any edited/restored version wins a merge.
    this.on('populate', (tx) => {
      tx.table('categories').bulkAdd(
        PRESET_CATEGORIES.map((c, i): Category => ({ ...c, archived: false, order: i, deleted: 0, updatedAt: 0 })),
      )
    })
  }
}

export const db = new ExpenseDB()

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  monthlyBudget: 100000,
  categoryBudgets: {},
  names: { p1: 'Me', p2: 'Spouse' },
  spikeMultiplier: 1.5,
  setupDone: false,
  lastBackupAt: 0,
  updatedAt: 0,
}

const stamp = () => ({ updatedAt: Date.now() })

// ---------- reads ----------

export const live = {
  expenses: () => db.expenses.where('deleted').equals(0).reverse().sortBy('date'),
  /** All non-deleted categories, archived included (old expenses still need their name). */
  categories: () => db.categories.where('deleted').equals(0).sortBy('order'),
  recurring: () => db.recurring.where('deleted').equals(0).sortBy('nextDueDate'),
  settings: async () => {
    const s = await db.settings.get('settings')
    return s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS
  },
  device: async (): Promise<DeviceInfo> => (await db.device.get('device')) ?? { id: 'device', owner: '' },
}

// ---------- expenses ----------

export type ExpenseInput = Omit<Expense, 'id' | 'updatedAt' | 'deleted'> & { id?: string }

/** Saves an expense; when payRecurringId is given, that recurring item rolls to its next due date. */
export async function saveExpense(input: ExpenseInput, opts: { payRecurringId?: string } = {}): Promise<Expense> {
  return db.transaction('rw', db.expenses, db.recurring, async () => {
    let recurringId = input.recurringId
    if (opts.payRecurringId) {
      const r = await db.recurring.get(opts.payRecurringId)
      if (r) {
        await db.recurring.update(r.id, { nextDueDate: advance(r.nextDueDate, r.cadence), ...stamp() })
        recurringId = r.id
      }
    }
    const record: Expense = { ...input, recurringId, merchant: input.merchant.trim(), note: input.note.trim(), id: input.id ?? newId(), deleted: 0, ...stamp() }
    await db.expenses.put(record)
    return record
  })
}

export async function deleteExpense(id: string): Promise<void> {
  await db.expenses.update(id, { deleted: 1, ...stamp() })
}

// ---------- categories ----------

export type CategoryInput = Omit<Category, 'id' | 'updatedAt' | 'deleted'> & { id?: string }

export async function saveCategory(input: CategoryInput): Promise<Category> {
  const record: Category = { ...input, name: input.name.trim(), id: input.id ?? newId(), deleted: 0, ...stamp() }
  await db.categories.put(record)
  return record
}

// ---------- recurring ----------

export type RecurringInput = Omit<Recurring, 'id' | 'updatedAt' | 'deleted'> & { id?: string }

export async function saveRecurring(input: RecurringInput): Promise<Recurring> {
  const record: Recurring = { ...input, name: input.name.trim(), merchant: input.merchant.trim(), id: input.id ?? newId(), deleted: 0, ...stamp() }
  await db.recurring.put(record)
  return record
}

export async function skipRecurring(id: string): Promise<void> {
  const r = await db.recurring.get(id)
  if (r) await db.recurring.update(id, { nextDueDate: advance(r.nextDueDate, r.cadence), ...stamp() })
}

export async function deleteRecurring(id: string): Promise<void> {
  await db.recurring.update(id, { deleted: 1, ...stamp() })
}

// ---------- settings & device ----------

export async function saveSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = (await db.settings.get('settings')) ?? DEFAULT_SETTINGS
  await db.settings.put({ ...DEFAULT_SETTINGS, ...current, ...patch, id: 'settings', ...stamp() })
}

export async function setDeviceOwner(owner: Person | ''): Promise<void> {
  await db.device.put({ id: 'device', owner })
}
