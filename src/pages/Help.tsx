import type { ReactNode } from 'react'

const base = import.meta.env.BASE_URL

function Topic({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="card help" open={open}>
      <summary><h2>{title}</h2></summary>
      <div className="stack small" style={{ gap: 8, marginTop: 10 }}>{children}</div>
    </details>
  )
}

/** In-app help: install, adding expenses, sync, backups & privacy. */
export function Help() {
  return (
    <>
      <Topic title="Install & first setup" open>
        <ol>
          <li><strong>iPhone:</strong> open the app in Safari → Share → <em>Add to Home Screen</em>, then always open it from that icon.</li>
          <li><strong>Android:</strong> in Chrome tap <em>Install app</em> (or ⋮ → <em>Add to Home screen</em>).</li>
          <li><strong>First run:</strong> enter both names and the monthly household budget, and choose whose phone this is. New expenses on this phone are marked as paid by that person.</li>
        </ol>
        <p className="muted" style={{ margin: 0 }}>Joining a partner who already uses the app? Skip the setup and go to Settings → Google Drive sync instead.</p>
      </Topic>

      <Topic title="Adding expenses">
        <ul>
          <li><strong>Paste an SMS:</strong> copy a bank, card or UPI message, tap <em>Paste SMS</em> (or long-press the box → Paste), add a word such as “groceries”, tap <em>Read it</em>.</li>
          <li><strong>Type or say it:</strong> “450 vegetables today”, “1.2K petrol yesterday”, “rent 25000 on 1st”. On an installed iPhone app, the mic button opens the keyboard: tap 🎤 on the keyboard to dictate.</li>
          <li><strong>From a screenshot:</strong> open it in Photos, press and hold the text (or tap Live Text → Copy All), then paste it into the box.</li>
          <li><strong>Quick add:</strong> fill the form yourself.</li>
          <li>Nothing is saved until you tap <em>Save</em> on the card. It warns about likely duplicates, budget limits, and SIP/RD/investment debits (those belong in savings, not expenses).</li>
          <li>Tap any expense in Home or History to edit or delete it.</li>
        </ul>
      </Topic>

      <Topic title="Sync with your partner">
        <ol>
          <li><strong>First phone:</strong> Settings → Google Drive sync → <em>Connect Google Drive</em> → <em>Create household file</em>. Then type your partner's Gmail under <em>Share with your partner</em>.</li>
          <li><strong>Partner's phone:</strong> Connect with their own Google account → <em>Pick the shared file</em>. Names and budgets come from the shared file; any expenses already on that phone are added in.</li>
          <li><strong>Your other devices</strong> (same Google account): just Connect; the file is found automatically.</li>
        </ol>
        <ul>
          <li>Syncs when the app opens, a few seconds after each change, and when you're back online.</li>
          <li>Google sign-in lasts about an hour. After that the top of Home shows <em>Tap to sync</em>: one tap, usually no password.</li>
          <li>Google may say the app “hasn't been verified” while it's new: tap <em>Continue</em>.</li>
        </ul>
      </Topic>

      <Topic title="Backups & privacy">
        <ul>
          <li>Your expenses are stored on this device, and in one file in your Google Drive if you use sync. There is no Expense Tracker server; nobody else can see your data.</li>
          <li>The app can see only its own file in your Drive, never your other files.</li>
          <li>Only the last 4 digits of cards and accounts are kept. Pasted SMS text and the names of people you pay by UPI aren't stored.</li>
          <li><strong>Backups:</strong> Settings → Backup & export → <em>Download backup</em>. Keep the file in iCloud Drive or Google Drive. Restoring merges: the newest version of each expense wins.</li>
          <li>Sync also keeps 7 daily copies in the Expense Tracker folder of whoever created the household file.</li>
        </ul>
        <p style={{ margin: 0 }}><a href={`${base}privacy.html`} target="_blank" rel="noopener">Full privacy policy</a> · <a href={`${base}about.html`} target="_blank" rel="noopener">About this app</a> · <a href="mailto:chaitu.others@gmail.com">Contact</a></p>
      </Topic>
    </>
  )
}
