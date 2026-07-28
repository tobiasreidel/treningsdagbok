// Shown when VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set yet, so the
// app gives a clear next step instead of a blank screen.
export default function SetupNeeded() {
  return (
    <div className="setup">
      <div className="setup-card">
        <h1>📓 Treningsdagbok</h1>
        <p className="muted">Almost there. Connect your Supabase project.</p>
        <ol>
          <li>
            Create a free project at <code>supabase.com</code>.
          </li>
          <li>
            Apply the migrations with <code>npx supabase db push</code>.
          </li>
          <li>
            Copy <code>.env.example</code> to <code>.env</code> and fill in your
            project URL and anon key (Project Settings → API).
          </li>
          <li>
            Restart the dev server (<code>npm run dev</code>).
          </li>
        </ol>
        <p className="muted small">Full steps are in the README.</p>
      </div>
    </div>
  )
}
