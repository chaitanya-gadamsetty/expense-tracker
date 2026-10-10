import { useState, type ReactNode } from 'react'
import { formatINR, formatShort } from '../lib/format'
import { swatch } from './ui'

// Small, dependency-free charts. Colours come from the validated categorical palette (--c0…--c7) in index.css.

type Tip = { x: number; y: number; text: string } | null

function useTip() {
  const [tip, setTip] = useState<Tip>(null)
  const show = (e: { clientX: number; clientY: number }, text: string) => setTip({ x: e.clientX, y: e.clientY, text })
  const node = tip ? <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null
  return { show, hide: () => setTip(null), node }
}

/** Spend per day of the month, with a dashed daily-average line. Future days are left blank. */
export function DailyBars({ daily, average, elapsed, label }: { daily: number[]; average: number; elapsed: number; label: (day: number) => string }) {
  const tip = useTip()
  const max = Math.max(...daily, average, 1)
  return (
    <div>
      <div className="days" style={{ gridTemplateColumns: `repeat(${daily.length}, 1fr)`, position: 'relative' }} onMouseLeave={tip.hide}>
        {average > 0 && <div className="avg-line" style={{ bottom: `${(average / max) * 100}%` }} title={`Daily average ${formatINR(Math.round(average))}`} />}
        {daily.map((v, i) => (
          <div
            key={i}
            className="col"
            onMouseMove={(e) => tip.show(e, `${label(i + 1)}: ${formatINR(v)}`)}
            onClick={(e) => tip.show(e, `${label(i + 1)}: ${formatINR(v)}`)}
            role="img"
            aria-label={`${label(i + 1)}: ${formatINR(v)}`}
          >
            <div className={`bar ${v ? '' : 'zero'} ${i + 1 > elapsed ? 'future' : ''}`} style={{ height: `${(v / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="axis"><span>1</span><span>{Math.ceil(daily.length / 2)}</span><span>{daily.length}</span></div>
      <div className="tiny muted" style={{ marginTop: 4 }}>Dashed line = daily average {formatINR(Math.round(average))}</div>
      {tip.node}
    </div>
  )
}

/** Monthly totals for a year (Jan–Dec). */
export function MonthBars({ months, labels, currentIndex }: { months: number[]; labels: string[]; currentIndex: number }) {
  const tip = useTip()
  const max = Math.max(...months, 1)
  return (
    <div className="months" onMouseLeave={tip.hide}>
      {months.map((v, i) => (
        <div className="col" key={i} onMouseMove={(e) => tip.show(e, `${labels[i]}: ${formatINR(v)}`)} onClick={(e) => tip.show(e, `${labels[i]}: ${formatINR(v)}`)} role="img" aria-label={`${labels[i]}: ${formatINR(v)}`}>
          <div className={`bar ${v ? '' : 'zero'} ${i > currentIndex ? 'future' : ''}`} style={{ height: `${(v / max) * 100}%` }} />
          <span className="m">{labels[i][0]}</span>
        </div>
      ))}
      {tip.node}
    </div>
  )
}

export interface Slice {
  key: string
  label: ReactNode
  /** Plain-text name for tooltips / screen readers */
  name: string
  value: number
  /** Palette index; undefined = neutral "Other" grey */
  color?: number
}

/** Donut of shares with a legend (icon + name + amount + %). At most `max` slices; the rest fold into "Other". */
export function Donut({ slices, max = 6, center }: { slices: Slice[]; max?: number; center: ReactNode }) {
  const tip = useTip()
  const sorted = slices.filter((s) => s.value > 0).sort((a, b) => b.value - a.value)
  const shown = sorted.slice(0, max)
  const rest = sorted.slice(max)
  if (rest.length) shown.push({ key: '__other', label: `Other (${rest.length})`, name: 'Other', value: rest.reduce((s, x) => s + x.value, 0) })
  const total = shown.reduce((s, x) => s + x.value, 0)
  const r = 60
  const C = 2 * Math.PI * r
  const gap = shown.length > 1 ? 2 : 0
  let offset = 0
  return (
    <div className="donut-wrap" onMouseLeave={tip.hide}>
      <svg viewBox="0 0 150 150" role="img" aria-label="Share by category">
        <circle cx="75" cy="75" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="22" />
        {shown.map((s) => {
          const len = (s.value / total) * C
          const el = (
            <circle
              key={s.key}
              className="seg"
              cx="75" cy="75" r={r} fill="none"
              stroke={s.color === undefined ? 'var(--c-other)' : swatch(s.color)}
              strokeWidth="22"
              strokeDasharray={`${Math.max(len - gap, 0.5)} ${C}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 75 75)"
              onMouseMove={(e) => tip.show(e, `${s.name}: ${formatINR(s.value)} (${Math.round((s.value / total) * 100)}%)`)}
            />
          )
          offset += len
          return el
        })}
        <foreignObject x="30" y="52" width="90" height="46">
          <div style={{ textAlign: 'center', fontSize: 13, lineHeight: 1.2 }}>{center}</div>
        </foreignObject>
      </svg>
      <div className="legend">
        {shown.map((s) => (
          <div className="li" key={s.key}>
            <span className="swatch" style={{ background: s.color === undefined ? 'var(--c-other)' : swatch(s.color) }} />
            <span className="ellipsis">{s.label}</span>
            <span className="num small">{formatShort(s.value)}</span>
            <span className="num tiny muted" style={{ width: 32, textAlign: 'right' }}>{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
      {tip.node}
    </div>
  )
}

/** Horizontal bars: label, track, value. */
export function HBars({ rows }: { rows: Array<{ key: string; label: ReactNode; value: number; color?: string; hint?: string }> }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div>
      {rows.map((r) => (
        <div className="hbar" key={r.key} title={r.hint}>
          <span className="ellipsis">{r.label}</span>
          <div className="track"><div style={{ width: `${(r.value / max) * 100}%`, background: r.color }} /></div>
          <span className="num small">{formatINR(r.value)}</span>
        </div>
      ))}
    </div>
  )
}
