import { liveQuery } from 'dexie'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { db } from '../db'
import { disconnect as disconnectAuth, forgetToken, getToken, isConnected, rememberEmail, signedInEmail, startSignIn, storage } from './auth'
import { DriveAuthError, DriveNotFoundError, googleDrive } from './drive'
import { pickHouseholdFile } from './picker'
import { createHousehold, findHousehold, joinHousehold, runSync } from './sync'

export type SyncState = 'off' | 'needs-signin' | 'needs-link' | 'syncing' | 'ok' | 'error' | 'offline'

interface SyncContextValue {
  state: SyncState
  lastSyncAt: number
  error: string
  email: string
  linked: boolean
  connect: () => void
  syncNow: () => void
  /** First phone: create the shared household file from this phone's data. */
  createNew: () => Promise<void>
  /** Partner's phone: pick the file that was shared with this account. */
  joinShared: () => Promise<void>
  share: (email: string) => Promise<void>
  sharedWith: () => Promise<string[]>
  disconnect: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)
const LAST_SYNC_KEY = 'et.sync.last'
const FILE_KEY = 'et.sync.fileId'

export function useSync() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSync outside SyncProvider')
  return ctx
}

/** Fingerprint of local data; when it changes, there is something to sync. */
async function localFingerprint(): Promise<string> {
  const parts = await Promise.all(
    [db.expenses, db.categories, db.recurring, db.settings].map(async (t) => {
      const all = (await t.toArray()) as Array<{ updatedAt: number }>
      return `${all.length}:${Math.max(0, ...all.map((r) => r.updatedAt))}`
    }),
  )
  return parts.join('|')
}

export function SyncProvider({ initialError, children }: { initialError?: string; children: ReactNode }) {
  const initial = (): SyncState => (!isConnected() ? 'off' : !getToken() ? 'needs-signin' : storage.get(FILE_KEY) ? 'ok' : 'needs-link')
  const [state, setState] = useState<SyncState>(initial)
  const [error, setError] = useState(initialError ?? '')
  const [email, setEmail] = useState(signedInEmail)
  const [fileId, setFileIdState] = useState(() => storage.get(FILE_KEY) ?? '')
  const [lastSyncAt, setLastSyncAt] = useState(() => Number(storage.get(LAST_SYNC_KEY) ?? 0))
  const running = useRef(false)
  const again = useRef(false)
  const syncedPrint = useRef('')

  const setFileId = (id: string) => {
    if (id) storage.set(FILE_KEY, id)
    else storage.remove(FILE_KEY)
    setFileIdState(id)
  }

  const fail = useCallback((e: unknown) => {
    if (e instanceof DriveAuthError) {
      forgetToken()
      setState('needs-signin')
    } else if (e instanceof DriveNotFoundError) {
      setFileId('')
      setError('The shared household file was deleted, or is no longer shared with this Google account. Link to it again below.')
      setState('needs-link')
    } else {
      setError((e as Error).message || 'Sync failed.')
      setState(navigator.onLine ? 'error' : 'offline')
    }
  }, [])

  const sync = useCallback(async () => {
    if (!isConnected()) return setState('off')
    const token = getToken()
    if (!token) return setState('needs-signin')
    if (!navigator.onLine) return setState('offline')
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    setState('syncing')
    try {
      const drive = googleDrive(token)
      if (!signedInEmail()) {
        const me = await drive.me()
        rememberEmail(me)
        setEmail(me)
      }
      let id = storage.get(FILE_KEY) ?? ''
      if (!id) {
        // This account may already see the file (created on my other device, or picked before).
        const found = await findHousehold(drive)
        if (!found) {
          setState('needs-link')
          return
        }
        await joinHousehold(drive, found)
        setFileId(found)
        id = found
      }
      do {
        again.current = false
        await runSync(drive, id)
      } while (again.current)
      syncedPrint.current = await localFingerprint()
      const now = Date.now()
      storage.set(LAST_SYNC_KEY, String(now))
      setLastSyncAt(now)
      setError('')
      setState('ok')
    } catch (e) {
      fail(e)
    } finally {
      running.current = false
    }
  }, [fail])

  // Sync on start, when the app comes back to the foreground, and when the network returns.
  useEffect(() => {
    sync()
    const onVisible = () => document.visibilityState === 'visible' && sync()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', sync)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', sync)
    }
  }, [sync])

  // Sync a couple of seconds after any local change.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const sub = liveQuery(localFingerprint).subscribe({
      next: (print) => {
        if (!syncedPrint.current || print === syncedPrint.current) return
        clearTimeout(timer)
        timer = setTimeout(sync, 2000)
      },
    })
    return () => {
      clearTimeout(timer)
      sub.unsubscribe()
    }
  }, [sync])

  /** Runs a linking step with a fresh token, or sends the user to sign in first. */
  const withToken = async (fn: (token: string) => Promise<void>) => {
    const token = getToken()
    if (!token) return startSignIn()
    setError('')
    try {
      await fn(token)
    } catch (e) {
      fail(e)
      throw e
    }
  }

  const value: SyncContextValue = {
    state,
    lastSyncAt,
    error,
    email,
    linked: !!fileId,
    connect: startSignIn,
    syncNow: () => (getToken() ? sync() : startSignIn()),
    createNew: () =>
      withToken(async (token) => {
        setState('syncing')
        const id = await createHousehold(googleDrive(token))
        setFileId(id)
        await sync()
      }),
    joinShared: () =>
      withToken(async (token) => {
        const id = await pickHouseholdFile(token)
        if (!id) return
        setState('syncing')
        await joinHousehold(googleDrive(token), id)
        setFileId(id)
        await sync()
      }),
    share: (to) =>
      withToken(async (token) => {
        if (!fileId) throw new Error('Create or link the household file first.')
        await googleDrive(token).share(fileId, to.trim())
      }),
    sharedWith: async () => {
      const token = getToken()
      if (!token || !fileId) return []
      try {
        return await googleDrive(token).sharedWith(fileId)
      } catch {
        return []
      }
    },
    disconnect: async () => {
      await disconnectAuth()
      setFileId('')
      setEmail('')
      setState('off')
      setError('')
    },
  }
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function describeLastSync(at: number): string {
  if (!at) return 'never'
  const mins = Math.round((Date.now() - at) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  return new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
