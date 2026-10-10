// A snapshot is the whole household database as JSON. Backups and Google Drive sync both use it, and both
// merge it the same way: per record, the newer updatedAt wins; deletes are tombstones.
// The device owner (who this phone belongs to) is never part of a snapshot.

import { db, DEFAULT_SETTINGS } from '../db'
import type { Category, Expense, Recurring, Settings, SyncFields } from '../types'
import { mergeRecords } from './merge'

export interface Snapshot {
  app: 'expense-tracker'
  version: number
  exportedAt: string
  expenses: Expense[]
  categories: Category[]
  recurring: Recurring[]
  settings: Settings
}

export async function buildSnapshot(): Promise<Snapshot> {
  const [expenses, categories, recurring, settings] = await Promise.all([
    db.expenses.toArray(),
    db.categories.toArray(),
    db.recurring.toArray(),
    db.settings.get('settings'),
  ])
  return {
    app: 'expense-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    expenses,
    categories,
    recurring,
    settings: { ...DEFAULT_SETTINGS, ...settings },
  }
}

export interface ApplySummary {
  expenses: number
  categories: number
  recurring: number
  settings: boolean
}

/**
 * Merges a snapshot into this device. With `preferRemoteSettings` (first link to a household file),
 * the file's settings replace this device's even if this device's are newer.
 */
export async function applySnapshot(data: Snapshot, opts: { preferRemoteSettings?: boolean } = {}): Promise<ApplySummary> {
  if (data?.app !== 'expense-tracker') throw new Error('That file is not a backup from this app.')
  return db.transaction('rw', [db.expenses, db.categories, db.recurring, db.settings], async () => {
    const e = mergeRecords(await db.expenses.toArray(), data.expenses ?? [])
    const c = mergeRecords(await db.categories.toArray(), data.categories ?? [])
    const r = mergeRecords(await db.recurring.toArray(), data.recurring ?? [])
    await db.expenses.bulkPut(e.changed)
    await db.categories.bulkPut(c.changed)
    await db.recurring.bulkPut(r.changed)

    let settingsChanged = false
    const local = await db.settings.get('settings')
    if (data.settings && (!local || opts.preferRemoteSettings || data.settings.updatedAt > local.updatedAt)) {
      // lastBackupAt is about this device's downloads, so it never comes from elsewhere.
      // When forced, stamp it now so this device's older settings can't win the next merge.
      const updatedAt = opts.preferRemoteSettings ? Math.max(Date.now(), data.settings.updatedAt) : data.settings.updatedAt
      await db.settings.put({ ...DEFAULT_SETTINGS, ...data.settings, id: 'settings', updatedAt, lastBackupAt: local?.lastBackupAt ?? 0 })
      settingsChanged = true
    }
    return { expenses: e.changed.length, categories: c.changed.length, recurring: r.changed.length, settings: settingsChanged }
  })
}

/** True when `local` has something `remote` lacks (a new record or a newer edit). */
export function hasChangesFor(remote: Snapshot | null, local: Snapshot): boolean {
  if (!remote) return true
  const newer = <T extends SyncFields>(r: T[], l: T[]) => mergeRecords(r, l).changed.length > 0
  return (
    newer(remote.expenses ?? [], local.expenses) ||
    newer(remote.categories ?? [], local.categories) ||
    newer(remote.recurring ?? [], local.recurring) ||
    local.settings.updatedAt > (remote.settings?.updatedAt ?? 0)
  )
}
