// Fitness data from intervals.icu. The Fitness & form numbers in the app
// should MATCH what intervals.icu shows - re-deriving them from imported
// sessions misses history (imports only reach back 60 days) and drifts. So we
// pull intervals.icu's own daily wellness rows (ctl = fitness, atl = fatigue)
// and use them as-is. Fetched once and cached for the rest of the day.
import { get as idbGet, set as idbSet } from 'idb-keyval'
import { format, subDays } from 'date-fns'
import { getSettings, hasCredentials, authHeader } from './intervals'

const API_BASE = 'https://intervals.icu/api/v1'
const CACHE_KEY = 'icu-fitness:v2'
const FETCH_DAYS = 430 // covers the 1Y stats range

let memory = null

async function apiGet(path, apiKey) {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: authHeader(apiKey) },
    })
  } catch {
    throw new Error('Could not reach intervals.icu.')
  }
  if (!res.ok) throw new Error(`intervals.icu error (${res.status}).`)
  return res.json()
}

// Returns { day, wellness: [{date, ctl, atl}...] ascending }. Throws with
// .code = 'no-creds' when intervals.icu isn't connected.
export async function fetchIcuFitnessData() {
  const today = format(new Date(), 'yyyy-MM-dd')
  if (memory?.day === today) return memory
  try {
    const cached = await idbGet(CACHE_KEY)
    if (cached?.day === today) {
      memory = cached
      return cached
    }
  } catch {
    // idb unavailable - fetch fresh
  }

  const settings = await getSettings()
  if (!hasCredentials(settings)) {
    const err = new Error('intervals.icu is not connected')
    err.code = 'no-creds'
    throw err
  }
  const id = (settings.athleteId || '0').trim() || '0'
  const oldest = format(subDays(new Date(), FETCH_DAYS), 'yyyy-MM-dd')

  const rows = await apiGet(
    `/athlete/${id}/wellness.json?oldest=${oldest}&newest=${today}&cols=ctl,atl`,
    settings.apiKey,
  )
  const wellness = []
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r?.id && r.ctl != null && r.atl != null) {
      wellness.push({ date: r.id, ctl: r.ctl, atl: r.atl })
    }
  }
  wellness.sort((a, b) => a.date.localeCompare(b.date))

  const result = { day: today, wellness }
  memory = result
  try {
    await idbSet(CACHE_KEY, result)
  } catch {
    // best-effort cache
  }
  return result
}
