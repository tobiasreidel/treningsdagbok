// App colour themes. "system" follows the device's light/dark setting; every
// other key forces a fixed palette. A theme is applied by setting data-theme on
// <html> - the matching CSS lives in styles.css. The choice follows the
// account like every other preference (see prefs.js).
import { getPref, setPref } from './prefs'

const KEY = 'theme'

// `bg`/`surface`/`accent` are only used to draw the little swatch preview in
// Settings. `meta` is the browser chrome colour (theme-color); null = resolve
// from the OS (system theme only).
export const THEMES = [
  {
    key: 'system',
    label: 'System',
    bg: 'linear-gradient(135deg, #eef0f6 0 50%, #0b1020 50% 100%)',
    surface: '#c7ccda',
    accent: '#6366f1',
    meta: null,
  },
  { key: 'light', label: 'Light', bg: '#f3f4f8', surface: '#ffffff', accent: '#4f46e5', meta: '#f3f4f8' },
  { key: 'dark', label: 'Dark', bg: '#0b1020', surface: '#151b2e', accent: '#6366f1', meta: '#0b1020' },
  { key: 'midnight', label: 'Midnight', bg: '#000000', surface: '#0c0c14', accent: '#8b5cf6', meta: '#000000' },
  { key: 'forest', label: 'Forest', bg: '#0c1410', surface: '#122019', accent: '#10b981', meta: '#0c1410' },
  { key: 'sunset', label: 'Sunset', bg: '#fdf6f0', surface: '#ffffff', accent: '#ea580c', meta: '#fdf6f0' },
]

const VALID = new Set(THEMES.map((t) => t.key))

export function getTheme() {
  const t = getPref(KEY)
  return t && VALID.has(t) ? t : 'system'
}

function metaColor(key) {
  if (key === 'system') {
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    return dark ? '#0b1020' : '#f3f4f8'
  }
  return THEMES.find((t) => t.key === key)?.meta || '#f3f4f8'
}

// Apply a theme immediately: swap the <html> attribute (re-colours the whole
// app live via CSS variables) and update the mobile browser chrome colour.
export function applyTheme(key) {
  const t = VALID.has(key) ? key : 'system'
  document.documentElement.setAttribute('data-theme', t)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', metaColor(t))
}

export function setTheme(key) {
  const t = VALID.has(key) ? key : 'system'
  setPref(KEY, t)
  applyTheme(t)
  return t
}

// Boot: apply the stored theme and keep "system" tracking the OS as it flips.
// The first paint uses whatever this device last cached, which is the right
// answer on your own phone; signing in somewhere new repaints once the
// account's settings arrive, hence the prefs:changed listener.
export function initTheme() {
  applyTheme(getTheme())
  window.addEventListener('prefs:changed', () => applyTheme(getTheme()))
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  mq?.addEventListener?.('change', () => {
    if (getTheme() === 'system') applyTheme('system')
  })
}
