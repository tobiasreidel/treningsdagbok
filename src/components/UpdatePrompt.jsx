import { useRegisterSW } from 'virtual:pwa-register/react'

// Shows a small banner when a new version of the app has been deployed and is
// waiting to activate. Tapping "Reload" swaps in the new service worker and
// refreshes the page. This makes updates explicit instead of relying on the
// browser to pick them up on its own (which is inconsistent across browsers,
// and especially sticky for an installed PWA).
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      // Hourly poll as a fallback for long-lived sessions.
      setInterval(() => registration.update(), 60 * 60 * 1000)
      // iOS suspends JS timers while the PWA is backgrounded, so the interval
      // above won't fire on resume. Check whenever the app comes back to the
      // foreground instead — this covers swipe-back without killing the app.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update()
      })
    },
  })

  if (!needRefresh) return null

  return (
    <div className="update-banner" role="status">
      <span className="update-text">A new version is available.</span>
      <div className="update-actions">
        <button className="btn btn-primary btn-sm" onClick={() => updateServiceWorker(true)}>
          Reload
        </button>
        <button
          className="update-dismiss"
          onClick={() => setNeedRefresh(false)}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
