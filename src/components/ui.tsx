import { useEffect, type ReactNode } from 'react'
import type { Category, SpendType } from '../types'
import { SPEND_TYPE_LABEL } from '../types'

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
)

export const Icon = {
  home: svg(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>),
  list: svg(<><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></>),
  chart: svg(<><path d="M3 3v18h18" /><path d="M7 15v3M12 10v8M17 6v12" /></>),
  wallet: svg(<><path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15v13H5a2 2 0 0 1-2-2V5" /><circle cx="16" cy="13.5" r="1.2" /></>),
  receipt: svg(<><path d="M5 3h14v18l-2.3-1.5L14.3 21 12 19.5 9.7 21l-2.4-1.5L5 21z" /><path d="M9 8h6M9 12h6M9 16h3" /></>),
  alert: svg(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>),
  repeat: svg(<><path d="m17 2 4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="m7 22-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>),
  gear: svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
  mic: svg(<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" /></>),
  stop: svg(<rect x="6" y="6" width="12" height="12" rx="2" />),
  plus: svg(<path d="M12 5v14M5 12h14" />),
  close: svg(<path d="M18 6 6 18M6 6l12 12" />),
  clipboard: svg(<><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></>),
  chevL: svg(<path d="m15 18-6-6 6-6" />),
  chevR: svg(<path d="m9 18 6-6-6-6" />),
}

export function CategoryLabel({ c, fallback = 'Uncategorised' }: { c?: Category; fallback?: string }) {
  if (!c) return <span className="muted">{fallback}</span>
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap', minWidth: 0 }}>
      <span className="emoji" aria-hidden="true">{c.icon}</span>
      <span className="ellipsis">{c.name}</span>
    </span>
  )
}

export function SpendTypeChip({ value }: { value: SpendType }) {
  return <span className={`chip st-${value}`}>{SPEND_TYPE_LABEL[value]}</span>
}

export const swatch = (color: number) => `var(--c${((color % 8) + 8) % 8})`

/** Bottom sheet on phones, centred dialog on wider screens. `action` sits top-right, clear of Safari's bottom toolbar. */
export function Modal({ title, onClose, children, action }: { title: string; onClose: () => void; children: ReactNode; action?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            {action}
            <button className="btn ghost sm" onClick={onClose} aria-label="Close">
              {Icon.close}
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange, labels }: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  labels?: Partial<Record<T, string>>
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button type="button" key={o} className={o === value ? 'on' : ''} role="radio" aria-checked={o === value} onClick={() => onChange(o)}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  )
}
