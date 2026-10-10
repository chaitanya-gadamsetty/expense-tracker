import { useState } from 'react'
import { saveSettings, setDeviceOwner } from '../db'
import { parseAmount } from '../lib/entry'
import type { AppData } from '../lib/useData'
import { PEOPLE, type Person } from '../types'
import { Segmented } from './ui'

/** First run: names, monthly budget and who owns this phone. On a second phone only the owner is asked. */
export function SetupCard({ data, goTo }: { data: AppData; goTo: (page: string) => void }) {
  const full = !data.settings.setupDone
  const [names, setNames] = useState(data.settings.names)
  const [budget, setBudget] = useState(String(data.settings.monthlyBudget))
  const [owner, setOwner] = useState<Person>(data.owner)
  const [error, setError] = useState('')

  const save = async () => {
    if (full) {
      const b = parseAmount(budget)
      if (!b || b <= 0) return setError('Enter a monthly budget.')
      if (!names.p1.trim() || !names.p2.trim()) return setError('Enter both names.')
      await saveSettings({ names: { p1: names.p1.trim(), p2: names.p2.trim() }, monthlyBudget: b, setupDone: true })
    }
    await setDeviceOwner(owner)
  }

  return (
    <div className="card stack" style={{ borderColor: 'var(--accent)' }}>
      <h2>{full ? 'Welcome! Quick setup' : 'Whose phone is this?'}</h2>
      {full && (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            Change any of this later in Settings.{' '}
            <a href="#/settings/sync" onClick={(e) => { e.preventDefault(); goTo('settings/sync') }}>
              Joining your partner’s household? Connect Google Drive instead →
            </a>
          </p>
          <div className="grid-2">
            <label className="field">
              Your name
              <input className="input" value={names.p1} onChange={(e) => setNames({ ...names, p1: e.target.value })} />
            </label>
            <label className="field">
              Partner’s name
              <input className="input" value={names.p2} onChange={(e) => setNames({ ...names, p2: e.target.value })} />
            </label>
          </div>
          <label className="field">
            Monthly household budget (₹)
            <input className="input num" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
        </>
      )}
      <div className="field">
        This phone belongs to (new expenses default to them)
        <Segmented options={PEOPLE} labels={full ? names : data.settings.names} value={owner} onChange={setOwner} />
      </div>
      {error && <div className="alert danger">{error}</div>}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn primary" onClick={save}>{full ? 'Start tracking' : 'Save'}</button>
      </div>
    </div>
  )
}
