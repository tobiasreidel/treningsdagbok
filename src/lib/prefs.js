// Local, per-device display preferences (no server round-trip, no migration).
// These only affect what *this* device shows — not stored data.
const KEYS = {
  hideRidesUnderKm: 'pref.hideRidesUnderKm',
}

// Minimum cycling distance (km) to show in the dashboard's "Last 7 days" list.
// 0 (or unset) means show everything. Used to hide short commutes.
export function getHideRidesUnderKm() {
  const v = Number(localStorage.getItem(KEYS.hideRidesUnderKm))
  return Number.isFinite(v) && v > 0 ? v : 0
}

export function setHideRidesUnderKm(km) {
  const v = Number(km)
  if (Number.isFinite(v) && v > 0) localStorage.setItem(KEYS.hideRidesUnderKm, String(v))
  else localStorage.removeItem(KEYS.hideRidesUnderKm)
}
