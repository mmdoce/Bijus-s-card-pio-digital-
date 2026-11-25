import { useEffect, useState } from 'react'
import { Button } from '../../components/ui'
import { readTrackingSession } from '../../lib/orderTracking'
import { supabase, supabaseForSession } from '../../lib/supabase'
import { useAuth } from '../account/AuthProvider'
import { pushGuestOrders, registerBrowserPush, revokeBrowserPush } from './pushData'

const vapidKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY
const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function PushSettings({ audience }) {
  const { session, user } = useAuth()
  const [registration, setRegistration] = useState(null)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone
  const supported = isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const available = supported && Boolean(vapidKey && supabase)
  const denied = supported && Notification.permission === 'denied'
  useEffect(() => {
    if (!available) return
    let active = true
    navigator.serviceWorker.register('/push-worker.js', { type: 'module' })
      .then(() => navigator.serviceWorker.ready)
      .then(async worker => {
        const subscription = await worker.pushManager.getSubscription()
        if (active) { setRegistration(worker); setSubscribed(Boolean(subscription)) }
      }).catch(() => { if (active) setMessage('Não foi possível iniciar as notificações neste navegador.') })
    return () => { active = false }
  }, [available])

  async function enable() {
    const guests = user || audience === 'admin' ? {} : { ...pushGuestOrders(), ...readTrackingSession().guests }
    if (!user && !Object.keys(guests).length) {
      setMessage('Faça um pedido neste navegador para ativar os avisos de visitante.')
      return
    }
    setBusy(true)
    try {
      if (Notification.permission === 'denied') return
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
      if (permission !== 'granted') {
        setMessage(permission === 'denied' ? 'Permissão negada. Você pode alterá-la nas configurações do navegador.' : 'A permissão não foi concedida.')
        return
      }
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: vapidKey,
      })
      await registerBrowserPush(supabaseForSession(session?.access_token ?? null), subscription, user ? audience : 'guest', guests)
      setSubscribed(true)
      setMessage('Avisos ativados neste dispositivo.')
    } catch (error) {
      setSubscribed(Boolean(await registration.pushManager.getSubscription().catch(() => null)))
      setMessage(error.message || 'Não foi possível ativar os avisos.')
    } finally { setBusy(false) }
  }

  async function disable() {
    setBusy(true)
    try {
      await revokeBrowserPush(supabaseForSession(session?.access_token ?? null))
      setSubscribed(false)
      setMessage('Avisos em segundo plano desativados neste dispositivo.')
    } catch { setMessage('Não foi possível desativar os avisos. Tente novamente.') }
    finally { setBusy(false) }
  }

  return <div className="stack-small">
    <h3>Avisos com o site fechado</h3>
    {ios && !standalone ? <p>No iPhone ou iPad, use Compartilhar → Adicionar à Tela de Início e abra a Biju’s Doce pelo ícone.</p>
      : !supported ? <p>Este navegador não oferece Web Push neste contexto.</p>
        : !available ? <p>Os avisos em segundo plano ainda não estão disponíveis.</p>
          : <>
            {denied && <p>A permissão está bloqueada nas configurações do navegador.</p>}
            <div className="actions">
              <Button secondary disabled={busy || !registration || denied} onClick={enable}>{subscribed ? 'Atualizar inscrição' : 'Ativar avisos neste dispositivo'}</Button>
              {subscribed && <Button secondary disabled={busy} onClick={disable}>Cancelar avisos neste dispositivo</Button>}
            </div>
          </>}
    {message && <p role="status">{message}</p>}
  </div>
}
