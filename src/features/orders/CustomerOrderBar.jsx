import { useCallback, useMemo, useState } from 'react'
import { getOrder, orderView } from '../../lib/orderData'
import { pushGuestOrders } from '../notifications/pushData'
import { finalOrderVisibility, readTrackingSession, writeTrackingSession } from '../../lib/orderTracking'
import { supabase, supabaseForSession } from '../../lib/supabase'
import { useAuth } from '../account/AuthProvider'
import { ActiveOrderBar } from './ActiveOrderBar'
import { useOrderPolling } from './useOrderPolling'

const emptyOrders = []

export function CustomerOrderBar() {
  const { session, user, loading, recovery } = useAuth()
  const token = user ? session?.access_token : null
  const userId = user?.id
  const client = useMemo(() => supabase ? supabaseForSession(token) : null, [token])
  const visitor = useMemo(() => supabase ? supabaseForSession(null) : null, [])
  const [dismissed, setDismissed] = useState(() => readTrackingSession().dismissed)
  const load = useCallback(async () => {
    const guest = Object.entries({ ...pushGuestOrders(), ...readTrackingSession().guests })
    const guestOrders = guest.map(([id, privateToken]) => getOrder(visitor, id, privateToken))
    const mine = async () => {
      if (!userId) return []
      const cutoff = new Date(Date.now() - finalOrderVisibility).toISOString()
      const { data, error } = await client.from('orders').select('id').eq('customer_id', userId)
        .or('finished_at.is.null,finished_at.gte.' + cutoff).order('created_at', { ascending: false })
      if (error) throw error
      return Promise.allSettled(data.map(({ id }) => getOrder(client, id)))
    }
    const [guests, owned] = await Promise.all([Promise.allSettled(guestOrders), mine().catch(() => [])])
    return [...guests, ...owned].filter(item => item.status === 'fulfilled' && item.value)
      .map(item => orderView(item.value)).sort((a, b) => b.createdAt - a.createdAt)
  }, [client, userId, visitor])
  const { result } = useOrderPolling(load, Boolean(client && !loading && !recovery))
  const orders = result?.data ?? emptyOrders
  function dismissOrder(id) {
    const saved = readTrackingSession()
    const next = [...new Set([...dismissed, ...saved.dismissed, id])]
    try { writeTrackingSession({ ...saved, dismissed: next }) } catch { /* still hide this session */ }
    setDismissed(next)
  }

  return <ActiveOrderBar activeOrders={orders.filter(order => !dismissed.includes(order.id))}
    dismissOrder={dismissOrder} />
}
