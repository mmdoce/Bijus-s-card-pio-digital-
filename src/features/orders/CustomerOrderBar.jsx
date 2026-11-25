import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getOrder, orderView } from '../../lib/orderData'
import { createOrderSound } from '../../lib/orderSound'
import { finalOrderVisibility, observeOrderChanges, readTrackingSession, writeTrackingSession } from '../../lib/orderTracking'
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
  const [sound] = useState(() => createOrderSound({ notes: [620, 780], duration: 0.25 }))
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [dismissed, setDismissed] = useState(() => readTrackingSession().dismissed)
  const seen = useRef(new Map())
  const load = useCallback(async () => {
    const guest = Object.entries(readTrackingSession().guests)
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
  useEffect(() => {
    if (!result?.data) return
    const { snapshot, changed } = observeOrderChanges(seen.current, orders)
    for (const [id, record] of snapshot) seen.current.set(id, record)
    if (changed) sound.play()
  }, [orders, result, sound])
  useEffect(() => () => sound.disable(), [sound])

  async function toggleSound() {
    if (soundEnabled) {
      sound.disable()
      setSoundEnabled(false)
    } else {
      if (!await sound.enable()) throw new Error('Áudio indisponível.')
      setSoundEnabled(true)
    }
  }

  function dismissOrder(id) {
    const saved = readTrackingSession()
    const next = [...new Set([...dismissed, ...saved.dismissed, id])]
    try { writeTrackingSession({ ...saved, dismissed: next }) } catch { /* still hide this session */ }
    setDismissed(next)
  }

  return <ActiveOrderBar activeOrders={orders.filter(order => !dismissed.includes(order.id))}
    dismissOrder={dismissOrder} customerSoundEnabled={soundEnabled} toggleCustomerSound={toggleSound} />
}
