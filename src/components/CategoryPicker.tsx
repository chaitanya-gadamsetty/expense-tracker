import type { Category } from '../types'

/** Tap-to-pick grid of categories (emoji + name). Big targets for one-handed use. */
export function CategoryPicker({ categories, value, onChange }: { categories: Category[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="cat-grid" role="radiogroup" aria-label="Category">
      {categories.map((c) => (
        <button type="button" key={c.id} role="radio" aria-checked={c.id === value} className={c.id === value ? 'on' : ''} onClick={() => onChange(c.id)}>
          <span className="emoji" aria-hidden="true">{c.icon}</span>
          <span>{c.name}</span>
        </button>
      ))}
    </div>
  )
}
