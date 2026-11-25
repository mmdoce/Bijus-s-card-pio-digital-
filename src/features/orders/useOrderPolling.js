import { useEffect, useState } from 'react'

export function useOrderPolling(load, enabled = true) {
  const [result, setResult] = useState(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let active = true
    let timer
    async function poll() {
      try {
        const data = await load()
        if (active) setResult({ load, data })
      } catch (error) {
        if (active) setResult({ load, error })
      } finally {
        if (active) timer = setTimeout(poll, 5000)
      }
    }
    void poll()
    return () => { active = false; clearTimeout(timer) }
  }, [load, enabled, revision])
  return {
    result: enabled && result?.load === load ? result : null,
    refresh: () => setRevision(value => value + 1),
  }
}
