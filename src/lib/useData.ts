import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { DEFAULT_SETTINGS, live } from '../db'
import type { Category, Person } from '../types'

/** Live view of everything the screens need. Re-renders whenever the database changes. */
export function useData() {
  const expenses = useLiveQuery(live.expenses, [])
  const categories = useLiveQuery(live.categories, [])
  const recurring = useLiveQuery(live.recurring, [])
  const settings = useLiveQuery(live.settings, [])
  const device = useLiveQuery(live.device, [])
  const catById = useMemo(() => new Map<string, Category>((categories ?? []).map((c) => [c.id, c])), [categories])
  const activeCategories = useMemo(() => (categories ?? []).filter((c) => !c.archived), [categories])
  return {
    ready: !!(expenses && categories && recurring && settings && device),
    expenses: expenses ?? [],
    categories: categories ?? [],
    activeCategories,
    catById,
    recurring: recurring ?? [],
    settings: settings ?? DEFAULT_SETTINGS,
    /** Who owns this device; defaults to the first person until set. */
    owner: (device?.owner || 'p1') as Person,
    ownerSet: !!device?.owner,
  }
}

export type AppData = ReturnType<typeof useData>
