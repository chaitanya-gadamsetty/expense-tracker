import { useEffect, useState, type ReactNode } from 'react'
import { deleteRecurring, saveCategory, saveRecurring, saveSettings, setDeviceOwner } from '../db'
import { CategoryPicker } from '../components/CategoryPicker'
import { CategoryLabel, Icon, Modal, Segmented, swatch } from '../components/ui'
import { exportBackup, exportCSV, importBackup } from '../lib/backup'
import { formatDate, todayISO } from '../lib/dates'
import { parseAmount } from '../lib/entry'
import { formatINR } from '../lib/format'
import { CADENCE_LABEL, advance } from '../lib/recurring'
import { rangeBounds } from '../lib/stats'
import type { AppData } from '../lib/useData'
import { syncConfigured } from '../sync/config'
import { pickerAvailable } from '../sync/picker'
import { describeLastSync, useSync } from '../sync/SyncProvider'
import { CADENCES, PEOPLE, SPEND_TYPES, SPEND_TYPE_LABEL, type Category, type Recurring } from '../types'

type Sub = 'categories' | 'recurring' | 'people' | 'backup' | 'sync'

export function Settings({ data, sub, goTo }: { data: AppData; sub?: string; goTo: (page: string) => void }) {
  const sync = useSync()
  const back = (title: string, children: ReactNode) => (
    <div className="stack" style={{ gap: 16 }}>
      <button className="back" onClick={() => goTo('settings')}>{Icon.chevL} Settings</button>
      <h1>{title}</h1>
      {children}
    </div>
  )
  switch (sub as Sub) {
    case 'categories': return back('Categories', <Categories data={data} />)
    case 'recurring': return back('Recurring bills', <RecurringList data={data} />)
    case 'people': return back('People & this device', <People data={data} />)
    case 'backup': return back('Backup & export', <Backup data={data} />)
    case 'sync': return back('Google Drive sync', <SyncPage />)
  }

  const item = (to: string, icon: ReactNode, title: string, hint: string) => (
    <button className="list-item" onClick={() => goTo(to)}>
      <span className="cat-ico" aria-hidden="true">{icon}</span>
      <div className="grow stack" style={{ gap: 2 }}>
        <span style={{ fontWeight: 500 }}>{title}</span>
        <span className="tiny muted">{hint}</span>
      </div>
      <span style={{ width: 18, height: 18, display: 'inline-flex', color: 'var(--muted)' }}>{Icon.chevR}</span>
    </button>
  )
  const active = data.recurring.filter((r) => r.active).length
  const syncHint = !sync.linked ? (sync.state === 'off' ? 'Off · share expenses between your phones' : 'Not finished setting up') : sync.state === 'needs-signin' ? 'Sign in again to sync' : `Synced ${describeLastSync(sync.lastSyncAt)}`
  return (
    <div className="stack" style={{ gap: 16 }}>
      <h1>Settings</h1>
      <div className="small muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Money</div>
      <div className="card settings-list" style={{ padding: '4px 12px' }}>
        {item('settings/categories', '🗂️', 'Categories', `${data.activeCategories.length} active · icons, colours, default spend type`)}
        {item('budgets', '🎯', 'Budgets', `${formatINR(data.settings.monthlyBudget)} a month · ${Object.keys(data.settings.categoryBudgets).length} category budgets`)}
        {item('settings/recurring', '🔁', 'Recurring bills', `${active} active · alerts 5 days before due`)}
      </div>
      <div className="small muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Household & data</div>
      <div className="card settings-list" style={{ padding: '4px 12px' }}>
        {item('settings/sync', '☁️', 'Google Drive sync', syncHint)}
        {item('settings/people', '👥', 'People & this device', `${data.settings.names.p1} & ${data.settings.names.p2} · this phone: ${data.settings.names[data.owner]}`)}
        {item('settings/backup', '💾', 'Backup & export', data.settings.lastBackupAt ? `Last backup ${new Date(data.settings.lastBackupAt).toLocaleDateString('en-IN')}` : 'No backup yet')}
      </div>
    </div>
  )
}

// ---------- categories ----------

const EMOJI_CHOICES = ['🛒', '🍽️', '⛽', '🏠', '💡', '🛍️', '💊', '📚', '🧸', '✈️', '🎬', '📺', '🧹', '🎁', '📦', '🐶', '👵', '🛡️', '💇', '🏋️', '🚗', '📱', '☕', '🍺', '🎓', '🧾', '🔧', '🌱']

function Categories({ data }: { data: AppData }) {
  const [edit, setEdit] = useState<Category | 'new' | null>(null)
  const archived = data.categories.filter((c) => c.archived)
  const row = (c: Category) => (
    <button key={c.id} className="list-item" onClick={() => setEdit(c)}>
      <span className="swatch" style={{ background: swatch(c.color) }} />
      <span className="grow"><CategoryLabel c={c} /></span>
      <span className="tiny muted">{SPEND_TYPE_LABEL[c.defaultType]}</span>
    </button>
  )
  return (
    <>
      <div className="card" style={{ padding: '4px 12px' }}>
        <div className="list">{data.activeCategories.map(row)}</div>
      </div>
      <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit('new')}>{Icon.plus} Add category</button>
      {archived.length > 0 && (
        <>
          <h2>Archived</h2>
          <div className="small muted">Hidden from pickers; past expenses keep them.</div>
          <div className="card" style={{ padding: '4px 12px' }}><div className="list">{archived.map(row)}</div></div>
        </>
      )}
      {edit && <CategoryEditor data={data} c={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function CategoryEditor({ data, c, onClose }: { data: AppData; c?: Category; onClose: () => void }) {
  const [name, setName] = useState(c?.name ?? '')
  const [icon, setIcon] = useState(c?.icon ?? '📦')
  const [color, setColor] = useState(c?.color ?? data.categories.length % 8)
  const [defaultType, setDefaultType] = useState(c?.defaultType ?? 'need')
  const [error, setError] = useState('')
  const save = async (archived = c?.archived ?? false) => {
    const n = name.trim()
    if (!n) return setError('Enter a name.')
    if (data.categories.some((x) => x.id !== c?.id && x.name.toLowerCase() === n.toLowerCase())) return setError('A category with that name already exists.')
    await saveCategory({ id: c?.id, name: n, icon, color, defaultType, archived, order: c?.order ?? Math.max(0, ...data.categories.map((x) => x.order)) + 1 })
    onClose()
  }
  return (
    <Modal title={c ? 'Edit category' : 'New category'} onClose={onClose}>
      <div className="stack">
        <label className="field">Name<input className="input" value={name} autoFocus={!c} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pets" /></label>
        <div className="field">
          Icon
          <div className="row" style={{ gap: 4 }}>
            {EMOJI_CHOICES.map((e) => (
              <button key={e} type="button" className={`btn sm ${e === icon ? 'primary' : ''}`} style={{ minWidth: 40, fontSize: '1.1rem' }} onClick={() => setIcon(e)} aria-pressed={e === icon}>{e}</button>
            ))}
          </div>
        </div>
        <div className="field">
          Colour (charts)
          <div className="row" style={{ gap: 6 }}>
            {Array.from({ length: 8 }, (_, i) => (
              <button key={i} type="button" aria-label={`Colour ${i + 1}`} aria-pressed={i === color} onClick={() => setColor(i)}
                style={{ width: 32, height: 32, borderRadius: 8, background: swatch(i), border: i === color ? '3px solid var(--text)' : '1px solid var(--border)', cursor: 'pointer' }} />
            ))}
          </div>
        </div>
        <div className="field">
          Default spend type
          <Segmented options={SPEND_TYPES} labels={SPEND_TYPE_LABEL} value={defaultType} onChange={setDefaultType} />
        </div>
        {error && <div className="alert danger">{error}</div>}
        <div className="spread">
          {c ? (
            <button className="btn" onClick={() => save(!c.archived)}>{c.archived ? 'Restore' : 'Archive'}</button>
          ) : <span />}
          <div className="row">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={() => save()}>Save</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ---------- recurring ----------

function RecurringList({ data }: { data: AppData }) {
  const [edit, setEdit] = useState<Recurring | 'new' | null>(null)
  return (
    <>
      <div className="small muted">Bills that repeat: rent, EMI, maid, school fees, subscriptions. They appear on Home 5 days before due, and clear when you log the payment.</div>
      <div className="card" style={{ padding: '4px 12px' }}>
        {data.recurring.length === 0 && <div className="empty">No recurring bills yet.</div>}
        <div className="list">
          {data.recurring.map((r) => {
            const c = data.catById.get(r.categoryId)
            return (
              <button key={r.id} className="list-item" onClick={() => setEdit(r)} style={{ opacity: r.active ? 1 : 0.55 }}>
                <span className="cat-ico" aria-hidden="true">{c?.icon ?? '🔁'}</span>
                <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                  <span className="ellipsis" style={{ fontWeight: 500 }}>{r.name}{!r.active && ' (paused)'}</span>
                  <span className="tiny muted">{CADENCE_LABEL[r.cadence]} · next {formatDate(r.nextDueDate)}</span>
                </div>
                <span className="num" style={{ fontWeight: 600 }}>{formatINR(r.amount)}</span>
              </button>
            )
          })}
        </div>
      </div>
      <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit('new')}>{Icon.plus} Add recurring bill</button>
      {edit && <RecurringEditor data={data} r={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function RecurringEditor({ data, r, onClose }: { data: AppData; r?: Recurring; onClose: () => void }) {
  const [f, setF] = useState({
    name: r?.name ?? '',
    amount: r ? String(r.amount) : '',
    categoryId: r?.categoryId ?? '',
    merchant: r?.merchant ?? '',
    cadence: r?.cadence ?? ('monthly' as const),
    nextDueDate: r?.nextDueDate ?? advance(todayISO(), 'monthly').slice(0, 8) + '01',
    active: r?.active ?? true,
  })
  const [error, setError] = useState('')
  const set = (p: Partial<typeof f>) => setF((cur) => ({ ...cur, ...p }))
  const save = async () => {
    const amount = parseAmount(f.amount)
    if (!f.name.trim()) return setError('Enter a name, e.g. Rent.')
    if (!amount || amount <= 0) return setError('Enter the usual amount.')
    if (!f.categoryId) return setError('Choose a category.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.nextDueDate)) return setError('Choose the next due date.')
    await saveRecurring({ ...f, id: r?.id, amount })
    onClose()
  }
  return (
    <Modal title={r ? 'Edit recurring bill' : 'New recurring bill'} onClose={onClose}>
      <div className="stack">
        <div className="grid-2">
          <label className="field">Name<input className="input" value={f.name} autoFocus={!r} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Rent, Maid, Netflix" /></label>
          <label className="field">Usual amount (₹)<input className="input num" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} /></label>
        </div>
        <div className="field">Category<CategoryPicker categories={data.activeCategories} value={f.categoryId} onChange={(categoryId) => set({ categoryId })} /></div>
        <div className="grid-2">
          <label className="field">Merchant (optional)<input className="input" value={f.merchant} onChange={(e) => set({ merchant: e.target.value })} placeholder="Helps match the payment" /></label>
          <label className="field">Next due date<input className="input" type="date" value={f.nextDueDate} onChange={(e) => set({ nextDueDate: e.target.value })} /></label>
        </div>
        <div className="field">Repeats<Segmented options={CADENCES} labels={CADENCE_LABEL} value={f.cadence} onChange={(cadence) => set({ cadence })} /></div>
        <label className="row small"><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> Active (show alerts)</label>
        {error && <div className="alert danger">{error}</div>}
        <div className="spread">
          {r ? <button className="btn danger" onClick={async () => { if (confirm(`Delete ${r.name}?`)) { await deleteRecurring(r.id); onClose() } }}>Delete</button> : <span />}
          <div className="row">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn primary" onClick={save}>Save</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ---------- people ----------

function People({ data }: { data: AppData }) {
  const [names, setNames] = useState(data.settings.names)
  const [msg, setMsg] = useState('')
  useEffect(() => setNames(data.settings.names), [data.settings.names])
  return (
    <>
      <div className="card stack">
        <h2>Names</h2>
        <div className="grid-2">
          {PEOPLE.map((p) => (
            <label key={p} className="field">{p === 'p1' ? 'Person 1' : 'Person 2'}<input className="input" value={names[p]} onChange={(e) => setNames({ ...names, [p]: e.target.value })} /></label>
          ))}
        </div>
        {msg && <div className="alert ok">{msg}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primary" disabled={!names.p1.trim() || !names.p2.trim()} onClick={async () => { await saveSettings({ names: { p1: names.p1.trim(), p2: names.p2.trim() } }); setMsg('Names saved.') }}>Save names</button>
        </div>
      </div>
      <div className="card stack">
        <h2>This device</h2>
        <div className="small muted">New expenses on this phone are marked as paid by:</div>
        <Segmented options={PEOPLE} labels={data.settings.names} value={data.owner} onChange={(p) => setDeviceOwner(p)} />
      </div>
    </>
  )
}

// ---------- backup ----------

function Backup({ data }: { data: AppData }) {
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [storage, setStorage] = useState<{ persisted: boolean; usage: number } | null>(null)
  const today = todayISO()
  const year = today.slice(0, 4)

  useEffect(() => {
    ;(async () => {
      if (!navigator.storage?.estimate) return
      const [est, persisted] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted?.() ?? false])
      setStorage({ persisted, usage: est.usage ?? 0 })
    })()
  }, [])

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    setMsg(null)
    try {
      const text = await fn()
      if (text) setMsg({ kind: 'ok', text })
    } catch (e) {
      setMsg({ kind: 'danger', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }
  const month = rangeBounds('month', today)

  return (
    <>
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}
      <div className="card stack">
        <h2>Full backup</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Your data lives on this device. Export a backup regularly and keep it in iCloud Drive or Google Drive.
          {data.settings.lastBackupAt ? ` Last backup: ${new Date(data.settings.lastBackupAt).toLocaleString('en-IN')}.` : ' No backup yet.'}
        </p>
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => run(async () => { await exportBackup(); return 'Backup downloaded.' })}>Download backup (.zip)</button>
          <label className="btn" aria-disabled={busy}>
            Restore / merge backup…
            <input
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) run(async () => {
                  const s = await importBackup(f)
                  return `Merged: ${s.expenses} expenses, ${s.categories} categories, ${s.recurring} recurring bills updated.`
                })
              }}
            />
          </label>
        </div>
        <div className="tiny muted">Restoring merges: for each record, the most recently edited version wins. Nothing newer on this device is overwritten.</div>
      </div>
      <div className="card stack">
        <h2>Spreadsheet (CSV)</h2>
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => run(() => exportCSV(month.from, month.to, today.slice(0, 7)))}>This month</button>
          <button className="btn" disabled={busy} onClick={() => run(() => exportCSV(`${year}-01-01`, `${year}-12-31`, year))}>{year}</button>
          <button className="btn" disabled={busy} onClick={() => run(() => exportCSV('0000-01-01', '9999-12-31', 'all'))}>All time</button>
        </div>
      </div>
      {storage && (
        <div className="tiny muted">
          Storage used on this device: {(storage.usage / 1024 / 1024).toFixed(1)} MB ·{' '}
          {storage.persisted ? 'Protected from automatic browser cleanup' : 'Not yet protected from browser cleanup (add to Home Screen to protect it)'}
        </div>
      )}
    </>
  )
}

// ---------- sync ----------

function SyncPage() {
  const sync = useSync()
  const [busy, setBusy] = useState(false)
  const [to, setTo] = useState('')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null)
  const [shared, setShared] = useState<string[]>([])
  const { linked, state } = sync

  useEffect(() => {
    if (linked && state === 'ok') sync.sharedWith().then(setShared)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, state])

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      if (ok) setMsg({ kind: 'ok', text: ok })
    } catch (e) {
      setMsg({ kind: 'danger', text: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const statusText: Record<typeof state, string> = {
    off: '',
    'needs-signin': 'Google sign-in has expired (it lasts about an hour). Tap Sync now to sign in again.',
    'needs-link': '',
    syncing: 'Syncing…',
    ok: `Last synced ${describeLastSync(sync.lastSyncAt)}.`,
    error: 'The last sync failed.',
    offline: 'Offline. Changes will sync when you are back online.',
  }

  return (
    <>
      {sync.error && <div className="alert danger">{sync.error}</div>}
      {msg && <div className={`alert ${msg.kind}`}>{msg.text}</div>}

      {state === 'off' && (
        <div className="card stack">
          <p className="small" style={{ margin: 0 }}>
            Keep both phones in step through one shared file in Google Drive. Each of you signs in with your own Google account.
          </p>
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
            <li>The app can only see the file it creates (or the one you pick), never the rest of your Drive.</li>
            <li>Your data also stays on this phone, so the app works offline.</li>
          </ul>
          {syncConfigured() ? (
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={sync.connect}>Connect Google Drive</button>
          ) : (
            <div className="alert info">Sync is coming soon: the app’s Google connection is still being set up.</div>
          )}
        </div>
      )}

      {state !== 'off' && !linked && state !== 'needs-signin' && (
        <>
          <div className="small muted">Signed in as <strong>{sync.email || 'your Google account'}</strong>. One more step:</div>
          <div className="card stack">
            <h2>First phone in the household?</h2>
            <p className="small muted" style={{ margin: 0 }}>Creates an “Expense Tracker” folder in your Drive with the shared household file, starting from this phone’s data. Then share it with your partner.</p>
            <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={busy || state === 'syncing'} onClick={() => run(sync.createNew, 'Household file created. Now share it with your partner below.')}>
              Create household file
            </button>
          </div>
          <div className="card stack">
            <h2>Partner already set it up?</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Ask them to share it with {sync.email || 'your Gmail'} from this screen on their phone. Then pick “Expense Tracker household” here. Your expenses on this phone are merged in; household names and budgets come from the shared file.
            </p>
            {pickerAvailable() ? (
              <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={busy || state === 'syncing'} onClick={() => run(sync.joinShared)}>
                Pick the shared file
              </button>
            ) : (
              <div className="alert warn">The file picker isn’t set up yet (Google API key missing).</div>
            )}
          </div>
        </>
      )}

      {state !== 'off' && (linked || state === 'needs-signin') && (
        <div className="card stack">
          <div className="small">{statusText[state]}</div>
          {sync.email && <div className="tiny muted">Signed in as {sync.email}</div>}
          <div className="row">
            <button className="btn primary" onClick={sync.syncNow} disabled={state === 'syncing'}>Sync now</button>
          </div>
          <div className="tiny muted">Syncs automatically while signed in: when the app opens, after each change, and when you come back online. Drive keeps a daily copy (last 7 days) in the Expense Tracker folder of whoever created the file.</div>
        </div>
      )}

      {linked && state !== 'needs-signin' && (
        <div className="card stack">
          <h2>Share with your partner</h2>
          <p className="small muted" style={{ margin: 0 }}>Gives their Google account edit access. Google emails them a link. Then on their phone: open this app → Settings → Google Drive sync → Connect → Pick the shared file.</p>
          <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); run(async () => { await sync.share(to); setShared(await sync.sharedWith()); setTo('') }, `Shared with ${to.trim()}.`) }}>
            <input className="input grow" type="email" inputMode="email" autoComplete="email" placeholder="partner@gmail.com" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Partner’s Gmail address" />
            <button className="btn primary" disabled={busy || !/^\S+@\S+\.\S+$/.test(to.trim())}>Share</button>
          </form>
          {shared.length > 0 && <div className="tiny muted">People with access: {shared.join(', ')}</div>}
        </div>
      )}

      {state !== 'off' && (
        <button
          className="btn danger"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => confirm('Stop syncing on this phone? Your data stays on this phone and in Drive.') && sync.disconnect()}
        >
          Disconnect this phone
        </button>
      )}
    </>
  )
}
