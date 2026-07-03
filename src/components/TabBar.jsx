import { useLocation, useNavigate } from 'react-router-dom'
import { HomeIcon, LogbookIcon, StatsIcon, FriendsIcon, PlusIcon } from './icons'

// The main areas are one thumb-tap away on the top-level browse pages.
// Wizards and detail views keep their own back-button flow without the bar
// (see TABBAR_PATHS / App.jsx).
export const TABBAR_PATHS = ['/', '/logbook', '/stats', '/friends']

const TABS = [
  { path: '/', label: 'Home', Icon: HomeIcon },
  { path: '/logbook', label: 'Logbook', Icon: LogbookIcon },
  { path: '/new', label: 'Log', Icon: PlusIcon, primary: true },
  { path: '/stats', label: 'Stats', Icon: StatsIcon },
  { path: '/friends', label: 'Friends', Icon: FriendsIcon },
]

export default function TabBar() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return (
    <nav className="tabbar">
      {TABS.map(({ path, label, Icon, primary }) => {
        const active = pathname === path
        return (
          <button
            key={path}
            type="button"
            className={`tab-btn ${active ? 'is-active' : ''}`}
            onClick={() => navigate(path)}
            aria-label={label}
            aria-current={active ? 'page' : undefined}
          >
            {primary ? (
              <span className="tab-plus">
                <Icon />
              </span>
            ) : (
              <Icon />
            )}
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
