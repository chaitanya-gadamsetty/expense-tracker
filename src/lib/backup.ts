import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { db, saveSettings, DEFAULT_SETTINGS } from '../db'
import { SPEND_TYPE_LABEL } from '../types'
import { todayISO } from './dates'
import { applySnapshot, buildSnapshot, type ApplySummary, type Snapshot } from './snapshot'

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Full backup: data.json, zipped. Includes deletes so a restore merges correctly. Device owner is not included. */
export async function exportBackup(): Promise<void> {
  const zipped = await buildBackupZip()
  downloadBlob(new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `expenses-backup-${todayISO()}.zip`)
  await saveSettings({ lastBackupAt: Date.now() })
}

export async function buildBackupZip(): Promise<Uint8Array> {
  return zipSync({ 'data.json': strToU8(JSON.stringify(await buildSnapshot(), null, 2)) })
}

export type ImportSummary = ApplySummary

/** Merges a backup into this device: newer version of each record wins, nothing is blindly overwritten. */
export async function importBackup(file: Blob): Promise<ImportSummary> {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()))
  } catch {
    throw new Error('That file is not a backup .zip from this app.')
  }
  if (!entries['data.json']) throw new Error('Backup is missing data.json.')
  let data: Snapshot
  try {
    data = JSON.parse(strFromU8(entries['data.json'])) as Snapshot
  } catch {
    throw new Error('Backup data.json is damaged.')
  }
  return applySnapshot(data)
}

function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function buildCSV(from: string, to: string): Promise<string> {
  const [expenses, categories, settings] = await Promise.all([
    db.expenses.where('deleted').equals(0).sortBy('date'),
    db.categories.toArray(),
    db.settings.get('settings'),
  ])
  const names = { ...DEFAULT_SETTINGS.names, ...settings?.names }
  const cat = new Map(categories.map((c) => [c.id, c.name]))
  const header = ['Date', 'Amount (INR)', 'Category', 'Merchant', 'Spend type', 'Paid by', 'Method', 'Account', 'Note']
  const rows = expenses
    .filter((e) => e.date >= from && e.date <= to)
    .map((e) => [e.date, e.amount, cat.get(e.categoryId) ?? '', e.merchant, SPEND_TYPE_LABEL[e.spendType], names[e.paidBy], e.method, e.account, e.note])
  return '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')
}

export async function exportCSV(from: string, to: string, label: string): Promise<void> {
  const csv = await buildCSV(from, to)
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `expenses-${label}.csv`)
}
