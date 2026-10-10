import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, deleteExpense, saveExpense, saveSettings, setDeviceOwner } from '../db'
import type { DriveApi, DriveFile } from './drive'
import { BACKUP_PREFIX, DATA_FILE, createHousehold, findHousehold, joinHousehold, runSync } from './sync'

type Stored = DriveFile & { body: Blob; owner: string; trashed?: boolean }

/** In-memory Drive shared by two Google accounts. Each account sees only files it created or picked. */
function fakeDrive() {
  const files = new Map<string, Stored>()
  const access = new Map<string, Set<string>>() // account -> visible file ids
  let n = 0
  const as = (account: string): DriveApi => {
    const visible = () => access.get(account) ?? access.set(account, new Set()).get(account)!
    const add = (f: Stored) => { files.set(f.id, f); visible().add(f.id); return view(f) }
    const view = ({ body: _b, owner, trashed: _t, ...f }: Stored): DriveFile => ({ ...f, ownedByMe: owner === account })
    const mine = () => [...visible()].map((id) => files.get(id)).filter((f): f is Stored => !!f && !f.trashed)
    return {
      findByName: async (name) => mine().filter((f) => f.name === name).map(view),
      listByPrefix: async (parent, prefix) => mine().filter((f) => f.parents?.includes(parent) && f.name.startsWith(prefix)).map(view),
      get: async (id) => (visible().has(id) && files.get(id) && !files.get(id)!.trashed ? view(files.get(id)!) : null),
      readText: async (id) => files.get(id)!.body.text(),
      createFolder: async (name) => add({ id: `f${++n}`, name, body: new Blob(), owner: account }),
      create: async (name, body, parentId) => add({ id: `f${++n}`, name, body, owner: account, parents: parentId ? [parentId] : [] }),
      update: async (id, body) => { files.get(id)!.body = body },
      copy: async (id, name, parentId) => { add({ id: `f${++n}`, name, body: files.get(id)!.body, owner: account, parents: [parentId] }) },
      remove: async (id) => { files.delete(id) },
      share: async () => {},
      sharedWith: async () => [],
      me: async () => account,
    }
  }
  /** Simulates the partner picking the file in Google's file picker. */
  const pick = (account: string, id: string) => (access.get(account) ?? access.set(account, new Set()).get(account)!).add(id)
  return { as, pick, files }
}

const expense = (amount: number, paidBy: 'p1' | 'p2' = 'p1') => ({
  amount, date: '2026-10-10', categoryId: 'food', merchant: 'Swiggy', spendType: 'want' as const, paidBy,
  method: 'UPI' as const, account: '', note: '', source: 'manual' as const, recurringId: '',
})

/** Each "device" is a saved copy of the IndexedDB tables. */
type Device = Record<string, unknown[]>
const save = async (): Promise<Device> => Object.fromEntries(await Promise.all(db.tables.map(async (t) => [t.name, await t.toArray()])))
const load = async (d: Device) => { for (const t of db.tables) { await t.clear(); await t.bulkPut((d[t.name] ?? []) as never[]) } }
const fresh = async () => { await db.delete(); await db.open() }
const amounts = async () => (await db.expenses.where('deleted').equals(0).toArray()).map((e) => e.amount).sort((a, b) => a - b)

describe('household sync', () => {
  beforeEach(fresh)

  it('two people on their own accounts share one file, including deletes', async () => {
    const drive = fakeDrive()
    const me = drive.as('me@gmail.com')
    const spouse = drive.as('spouse@gmail.com')

    // My phone: set up, two expenses, create the household file
    await saveSettings({ names: { p1: 'Chaitanya', p2: 'Spouse name' }, monthlyBudget: 90000, setupDone: true })
    await setDeviceOwner('p1')
    const keep = await saveExpense(expense(450))
    const gone = await saveExpense(expense(999))
    expect(await findHousehold(me)).toBeNull()
    const fileId = await createHousehold(me)
    await runSync(me, fileId, '2026-10-10')
    const myPhone = await save()

    // Spouse's phone: did its own first-run setup (names from their point of view), logged one expense
    await fresh()
    await saveSettings({ names: { p1: 'Spouse name', p2: 'Chaitanya' }, monthlyBudget: 50000, setupDone: true })
    await setDeviceOwner('p1')
    await saveExpense(expense(2000))
    // Before picking, the file is invisible to their account
    expect(await findHousehold(spouse)).toBeNull()
    drive.pick('spouse@gmail.com', fileId)
    expect(await findHousehold(spouse)).toBe(fileId)
    const joined = await joinHousehold(spouse, fileId)
    expect(joined.askOwner).toBe(true)
    expect((await db.device.get('device'))?.owner).toBe('') // asked again whose phone it is
    const s = await db.settings.get('settings')
    expect(s?.names).toEqual({ p1: 'Chaitanya', p2: 'Spouse name' })
    expect(s?.monthlyBudget).toBe(90000)
    expect(await amounts()).toEqual([450, 999, 2000])
    await setDeviceOwner('p2')
    await deleteExpense(gone.id)
    await runSync(spouse, fileId, '2026-10-11')
    expect(await db.settings.get('settings')).toMatchObject({ monthlyBudget: 90000 })

    // Back on my phone: spouse's expense arrives, the delete applies, my settings survive
    await load(myPhone)
    await runSync(me, fileId, '2026-10-11')
    expect(await amounts()).toEqual([450, 2000])
    expect((await db.expenses.get(keep.id))?.deleted).toBe(0)
    expect((await db.settings.get('settings'))?.monthlyBudget).toBe(90000)
    expect((await db.device.get('device'))?.owner).toBe('p1') // device owner never syncs
  })

  it('my second device finds the file without the picker', async () => {
    const drive = fakeDrive()
    const me = drive.as('me@gmail.com')
    await saveExpense(expense(300))
    const fileId = await createHousehold(me)
    await fresh()
    expect(await findHousehold(me)).toBe(fileId)
    const joined = await joinHousehold(me, fileId)
    expect(joined.askOwner).toBe(false) // same names (defaults) — no need to ask
    expect(await amounts()).toEqual([300])
  })

  it('does not upload when nothing changed', async () => {
    const drive = fakeDrive()
    const me = drive.as('me@gmail.com')
    await saveExpense(expense(100))
    const fileId = await createHousehold(me)
    expect((await runSync(me, fileId)).pushed).toBe(false)
    await saveExpense(expense(200))
    expect((await runSync(me, fileId)).pushed).toBe(true)
  })

  it('keeps 7 daily copies in the owner folder; the partner makes none', async () => {
    const drive = fakeDrive()
    const me = drive.as('me@gmail.com')
    const spouse = drive.as('spouse@gmail.com')
    await saveExpense(expense(100))
    const fileId = await createHousehold(me)
    for (let d = 1; d <= 10; d++) await runSync(me, fileId, `2026-10-${String(d).padStart(2, '0')}`)
    drive.pick('spouse@gmail.com', fileId)
    await runSync(spouse, fileId, '2026-10-11')
    const copies = [...drive.files.values()].filter((f) => f.name.startsWith(BACKUP_PREFIX))
    expect(copies).toHaveLength(7)
    expect(copies.every((f) => f.owner === 'me@gmail.com')).toBe(true)
    expect([...drive.files.values()].filter((f) => f.name === DATA_FILE)).toHaveLength(1)
  })

  it('reports a missing file (deleted or unshared)', async () => {
    const drive = fakeDrive()
    await expect(runSync(drive.as('x@gmail.com'), 'nope')).rejects.toThrow(/not found/)
  })
})
