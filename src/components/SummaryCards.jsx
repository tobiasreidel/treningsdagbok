import { getDashboardWidgets } from '../lib/prefs'
import { WIDGET_MAP } from './DashboardWidgets'

// Renders the front-page stat cards the user has chosen, in their order. Pass an
// explicit `widgets` list for read-only contexts (e.g. a coach viewing an
// athlete), where the layout is fixed rather than read from the user's prefs.
export default function SummaryCards({ sessions, widgets }) {
  const ids = (widgets || getDashboardWidgets()).filter((id) => WIDGET_MAP[id])
  if (ids.length === 0) return null

  return (
    <div className="summary-grid">
      {ids.map((id) => {
        const W = WIDGET_MAP[id].Component
        return <W key={id} sessions={sessions} />
      })}
    </div>
  )
}
