import { useEffect, useMemo, useRef, useState } from 'react'
import { supabaseForSession } from '../../lib/supabase'
import { useAuth } from '../account/AuthProvider'
import { useStore } from '../catalog/StoreProvider'
import { settingsError } from './settingsData'

export function useSettingsResource(load) {
  const { session } = useAuth()
  const client = useMemo(() => supabaseForSession(session.access_token), [session.access_token])
  const { reload } = useStore()
  const [state, setState] = useState({ loading: true })
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const inFlight = useRef(false)

  useEffect(() => {
    let active = true
    setState({ loading: true })
    load(client).then(
      data => { if (active) setState({ data }) },
      () => { if (active) setState({ error: true }) },
    )
    return () => { active = false }
  }, [client, load, revision])

  async function change(operation, apply, message, refreshPublic = false) {
    if (inFlight.current) return false
    inFlight.current = true
    setBusy(true)
    setFeedback(null)
    try {
      const result = await operation(client)
      setState(previous => previous.data ? { data: apply(previous.data, result) } : previous)
      setFeedback({ message })
      if (refreshPublic) reload()
      return true
    } catch (error) {
      setFeedback({ message: settingsError(error), error: true })
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return { ...state, busy, feedback, setFeedback, change, retry: () => setRevision(value => value + 1) }
}
