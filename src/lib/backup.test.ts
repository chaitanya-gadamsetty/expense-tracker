import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, deleteExpense, saveCategory, saveExpense, saveRecurring, saveSettings, setDeviceOwner } from '../db'
import { buildBackupZip, buildCSV, importBackup } from './backup'
import { commitDraft, newDraft } from './entry'

const expense = (amount: number, over = {}) => ({
  amount, date: '2026-10-10', categoryId: 'food', merchant: 'Swiggy', spendType: 'want' as const, paidBy: 'p1' as const,
  method: 'Card' as const, account: 'HDFC Card ••1762', note: '', source: 'sms' as const, recurringId: '', ...over,
})

async function reset() {
  await db.delete()
  await db.open()
}

describe('database', () => {
  beforeEach(reset)

  it('seeds the preset categories once', async () => {
    const cats = await db.categories.toArray()
    expect(cats).toHaveLength(15)
    expect(cats.find((c) => c.id === 'rent')).toMatchObject({ name: 'Rent & EMI', defaultType: 'essential' })
  })

  it('paying a recurring item rolls its due date forward', async () => {
    const r = await saveRecurring({ name: 'Rent', amount: 25000, categoryId: 'rent', merchant: '', cadence: 'monthly', nextDueDate: '2026-10-05', active: true })
    await commitDraft(newDraft({ amount: '25000', date: '2026-10-04', categoryId: 'rent' }), [r])
    expect((await db.recurring.get(r.id))?.nextDueDate).toBe('2026-11-05')
    const [e] = await db.expenses.toArray()
    expect(e.recurringId).toBe(r.id)
  })

  it('unticking "counts as" leaves the recurring item alone', async () => {
    const r = await saveRecurring({ name: 'Rent', amount: 25000, categoryId: 'rent', merchant: '', cadence: 'monthly', nextDueDate: '2026-10-05', active: true })
    await commitDraft(newDraft({ amount: '25000', date: '2026-10-04', categoryId: 'rent', payRecurring: false }), [r])
    expect((await db.recurring.get(r.id))?.nextDueDate).toBe('2026-10-05')
  })

  it('refuses drafts without a category', async () => {
    await expect(commitDraft(newDraft({ amount: '100' }), [])).rejects.toThrow(/category/)
  })
})

describe('backup round trip', () => {
  beforeEach(reset)

  it('restores expenses, custom categories, recurring, settings and deletes into an empty device', async () => {
    const pets = await saveCategory({ name: 'Pets', icon: '🐶', color: 1, defaultType: 'need', archived: false, order: 15 })
    const kept = await saveExpense(expense(1044, { categoryId: pets.id }))
    const removed = await saveExpense(expense(999))
    await deleteExpense(removed.id)
    await saveRecurring({ name: 'Maid', amount: 6000, categoryId: 'household', merchant: '', cadence: 'monthly', nextDueDate: '2026-11-01', active: true })
    await saveSettings({ monthlyBudget: 90000, names: { p1: 'Chaitanya', p2: 'Spouse' } })
    await setDeviceOwner('p2')

    const zip = await buildBackupZip()
    await reset()

    const summary = await importBackup(new Blob([zip as Uint8Array<ArrayBuffer>]))
    expect(summary).toMatchObject({ expenses: 2, recurring: 1 })
    const live = await db.expenses.where('deleted').equals(0).toArray()
    expect(live.map((e) => e.id)).toEqual([kept.id])
    expect((await db.categories.get(pets.id))?.name).toBe('Pets')
    expect((await db.settings.get('settings'))?.monthlyBudget).toBe(90000)
    expect(await db.device.get('device')).toBeUndefined() // device owner is never in a backup
  })

  it('does not overwrite newer local edits', async () => {
    const e = await saveExpense(expense(500))
    const zip = await buildBackupZip()
    await new Promise((r) => setTimeout(r, 5))
    await saveExpense({ ...e, note: 'edited after backup' })
    await importBackup(new Blob([zip as Uint8Array<ArrayBuffer>]))
    expect((await db.expenses.get(e.id))?.note).toBe('edited after backup')
  })

  it('rejects files that are not backups', async () => {
    await expect(importBackup(new Blob(['hello']))).rejects.toThrow(/not a backup/)
  })

  it('CSV has names, categories and quotes', async () => {
    await saveExpense(expense(1044, { note: 'team dinner, Friday' }))
    const csv = await buildCSV('2026-10-01', '2026-10-31')
    expect(csv).toContain('2026-10-10,1044,Food & Dining,Swiggy,Want,Me,Card,HDFC Card ••1762,"team dinner, Friday"')
  })
})
