// Sync between this device and the shared household file in Google Drive:
//   1. download the shared file and merge it into this device (newer record wins)
//   2. on the owner's devices, keep a dated copy of the file once a day (last 7) in its folder
//   3. upload this device's merged data if it has anything the file lacks
// Every device keeps its full copy, so if two phones upload at the same moment and one overwrites the
// other, the next sync from that phone puts its records back.

import { db, DEFAULT_SETTINGS, setDeviceOwner } from '../db'
import { todayISO } from '../lib/dates'
import { applySnapshot, buildSnapshot, hasChangesFor, type Snapshot } from '../lib/snapshot'
import { DriveNotFoundError, type DriveApi } from './drive'

export const FOLDER_NAME = 'Expense Tracker'
export const DATA_FILE = 'Expense Tracker household.json'
export const BACKUP_PREFIX = 'Expense Tracker household backup '
const KEEP_BACKUPS = 7

export interface SyncResult {
  pulled: number
  pushed: boolean
}

const json = (s: Snapshot) => new Blob([JSON.stringify(s)], { type: 'application/json' })

async function readRemote(drive: DriveApi, fileId: string): Promise<Snapshot | null> {
  const text = (await drive.readText(fileId)).trim()
  if (!text) return null
  try {
    return JSON.parse(text) as Snapshot
  } catch {
    throw new Error('The shared household file is damaged. Restore one of the daily copies in the Expense Tracker folder in Drive.')
  }
}

export async function runSync(drive: DriveApi, fileId: string, today = todayISO()): Promise<SyncResult> {
  const meta = await drive.get(fileId)
  if (!meta) throw new DriveNotFoundError()

  // 1. Pull
  const remote = await readRemote(drive, fileId)
  let pulled = 0
  if (remote) {
    const s = await applySnapshot(remote)
    pulled = s.expenses + s.categories + s.recurring + (s.settings ? 1 : 0)
  }

  // 2. Daily safety copy (only where this account owns the folder, so copies don't land in a partner's Drive root)
  const folder = meta.ownedByMe ? meta.parents?.[0] : undefined
  if (remote && folder) {
    const backups = (await drive.listByPrefix(folder, BACKUP_PREFIX)).sort((a, b) => a.name.localeCompare(b.name))
    const name = `${BACKUP_PREFIX}${today}.json`
    if (!backups.some((f) => f.name === name)) {
      await drive.copy(fileId, name, folder)
      backups.push({ id: '', name })
    }
    for (const old of backups.slice(0, Math.max(0, backups.length - KEEP_BACKUPS))) {
      if (old.id) await drive.remove(old.id)
    }
  }

  // 3. Push
  const local = await buildSnapshot()
  const pushed = hasChangesFor(remote, local)
  if (pushed) await drive.update(fileId, json(local))
  return { pulled, pushed }
}

/** An existing household file this account can already see (created here before, or picked earlier). */
export async function findHousehold(drive: DriveApi): Promise<string | null> {
  const [newest] = await drive.findByName(DATA_FILE)
  return newest?.id ?? null
}

/** Creates the Expense Tracker folder and the household file from this device's data. */
export async function createHousehold(drive: DriveApi): Promise<string> {
  const folder = await drive.createFolder(FOLDER_NAME)
  const file = await drive.create(DATA_FILE, json(await buildSnapshot()), folder.id)
  return file.id
}

export interface JoinResult {
  /** Household names differ from this device's, so it must be asked again whose phone it is. */
  askOwner: boolean
}

/**
 * First link of this device to an existing household file: the file's settings (names, budgets) win,
 * then everything merges both ways.
 */
export async function joinHousehold(drive: DriveApi, fileId: string): Promise<JoinResult> {
  const remote = await readRemote(drive, fileId)
  const before = await db.settings.get('settings')
  if (remote) await applySnapshot(remote, { preferRemoteSettings: true })
  const after = await db.settings.get('settings')
  const names = (x?: { names?: unknown }) => JSON.stringify(x?.names ?? DEFAULT_SETTINGS.names)
  const askOwner = !!remote && names(before) !== names(after)
  if (askOwner) await setDeviceOwner('')
  const local = await buildSnapshot()
  if (hasChangesFor(remote, local)) await drive.update(fileId, json(local))
  return { askOwner }
}
