// Google's file picker, used once on a partner's phone to pick the shared household file.
// Picking is what grants this app (drive.file scope) access to a file someone else created.

import { APP_ID, PICKER_API_KEY } from './config'
import { DATA_FILE } from './sync'

/* Minimal typings for the parts of gapi / google.picker we use. */
interface PickerDoc { id: string; name: string }
interface PickerData { action: string; docs?: PickerDoc[] }
interface PickerApi {
  ViewId: { DOCS: string }
  Action: { PICKED: string; CANCEL: string }
  Feature: { NAV_HIDDEN: string }
  DocsView: new (viewId: string) => { setMimeTypes(m: string): unknown; setQuery(q: string): unknown; setMode?(m: string): unknown }
  PickerBuilder: new () => {
    addView(v: unknown): PickerBuilderT
  }
}
interface PickerBuilderT {
  addView(v: unknown): PickerBuilderT
  setOAuthToken(t: string): PickerBuilderT
  setDeveloperKey(k: string): PickerBuilderT
  setAppId(id: string): PickerBuilderT
  setTitle(t: string): PickerBuilderT
  enableFeature(f: string): PickerBuilderT
  setCallback(cb: (d: PickerData) => void): PickerBuilderT
  build(): { setVisible(v: boolean): void }
}
declare global {
  interface Window {
    gapi?: { load(name: string, cb: { callback: () => void; onerror: () => void }): void }
    google?: { picker?: PickerApi }
  }
}

export const pickerAvailable = () => !!PICKER_API_KEY

let loading: Promise<PickerApi> | null = null

function loadPicker(): Promise<PickerApi> {
  if (window.google?.picker) return Promise.resolve(window.google.picker)
  loading ??= new Promise<PickerApi>((resolve, reject) => {
    const fail = () => {
      loading = null
      reject(new Error('Couldn’t load Google’s file picker. Check your connection and try again.'))
    }
    const ready = () =>
      window.gapi!.load('picker', { callback: () => (window.google?.picker ? resolve(window.google.picker) : fail()), onerror: fail })
    if (window.gapi) return ready()
    const s = document.createElement('script')
    s.src = 'https://apis.google.com/js/api.js'
    s.async = true
    s.onload = ready
    s.onerror = fail
    document.head.appendChild(s)
  })
  return loading
}

/** Opens the picker filtered to the household file. Resolves to the picked file id, or null if cancelled. */
export async function pickHouseholdFile(token: string): Promise<string | null> {
  if (!PICKER_API_KEY) throw new Error('The file picker isn’t set up yet (missing Google API key).')
  const picker = await loadPicker()
  const view = new picker.DocsView(picker.ViewId.DOCS)
  view.setMimeTypes('application/json')
  view.setQuery(DATA_FILE)
  return new Promise((resolve) => {
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(PICKER_API_KEY)
      .setAppId(APP_ID)
      .setTitle('Pick “Expense Tracker household”')
      .enableFeature(picker.Feature.NAV_HIDDEN)
      .setCallback((data) => {
        if (data.action === picker.Action.PICKED) resolve(data.docs?.[0]?.id ?? null)
        else if (data.action === picker.Action.CANCEL) resolve(null)
      })
      .build()
      .setVisible(true)
  })
}
