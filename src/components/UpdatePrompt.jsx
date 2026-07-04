import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export default function UpdatePrompt() {
  const registrationRef = useRef(null)

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      registrationRef.current = registration
      setInterval(() => registration.update(), 60 * 60 * 1000)
    },
  })

  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== 'visible') return
      const reg = registrationRef.current
      if (!reg) return
      try {
        await reg.update()
      } catch (_) {}
      // workbox-window fires needRefresh automatically when it sees a waiting SW,
      // but on iOS it sometimes misses the transition - check manually as fallback.
      if (reg.waiting) setNeedRefresh(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [setNeedRefresh])

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
