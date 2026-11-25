import { useEffect, useMemo, useState } from 'react'
import { supabaseForSession } from '../../lib/supabase'
import { useAuth } from './AuthProvider'
import { loadCustomer } from './customerData'

export function useCustomerData() {
  const { session, user, recovery } = useAuth()
  const token = user && !recovery ? session?.access_token : null
  const client = useMemo(() => token ? supabaseForSession(token) : null, [token])
  const [data, setData] = useState(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!client) return
    let active = true
    loadCustomer(user, client).then(
      result => { if (active) setData({ ...result, client }) },
      () => { if (active) setData({ error: true, client }) },
    )
    return () => { active = false }
  }, [client, revision, user])

  const current = client && data?.client === client ? data : null
  return { ...current, client, loading: Boolean(client && !current), reload: () => setRevision(value => value + 1) }
}
