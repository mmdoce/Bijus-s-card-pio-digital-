import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ActionLink, Button } from '../../components/ui'
import { audioReady, playOrderSound, subscribeAudio, unlockOrderAudio } from '../../lib/orderSound'
import { readTrackingSession } from '../../lib/orderTracking'
import { supabase, supabaseForSession } from '../../lib/supabase'
import { useAuth } from '../account/AuthProvider'
import { useOrderPolling } from '../orders/useOrderPolling'
import { acknowledgeBrowserPush, pushGuestOrders } from './pushData'
import { defaultSound, isNotificationViewed, normalizeSound, notificationMessages, notificationPath, notificationWindow, pendingRepeats, readLocal, repeatInterval, soundNames, writeLocal } from './notificationData'
import { PushSettings } from './PushSettings'

const Context = createContext(null)
const ledgerUrl = new URL('/notification-ledger.js', window.location.origin).href
const fallbackLedger = new Map()
let ledger

async function claim(key, interval) {
  try {
    ledger ??= import(/* @vite-ignore */ ledgerUrl)
    return await (await ledger).claimNotification(key, interval)
  } catch {
    const now = Date.now()
    const last = fallbackLedger.get(key)
    if (last !== undefined && now - last < (interval ?? Infinity)) return false
    fallbackLedger.set(key, now)
    return true
  }
}

export function NotificationProvider({ audience, children }) {
  const { session, user, loading, recovery } = useAuth()
  const identity = user?.id ?? session?.user.id ?? 'visitor'
  return <NotificationSession key={audience + ':' + identity} audience={audience} identity={identity}
    token={session?.access_token} enabled={!loading && !recovery} >{children}</NotificationSession>
}

function NotificationSession({ audience, identity, token, enabled, children }) {
  const preferencesKey = 'bijus-notification-sound:' + audience + ':' + identity
  const viewedKey = 'bijus-notification-viewed:' + audience + ':' + identity
  const [preferences, setPreferences] = useState(() => normalizeSound(audience, readLocal(preferencesKey)))
  const [viewed, setViewed] = useState(() => readLocal(viewedKey, {}))
  const [alerts, setAlerts] = useState([])
  const [audioHelp, setAudioHelp] = useState(false)
  const ready = useSyncExternalStore(subscribeAudio, audioReady)
  const since = useRef(new Date().toISOString())
  const consumed = useRef(new Set())
  const client = useMemo(() => supabase ? supabaseForSession(token ?? null) : null, [token])
  const admin = audience === 'admin'

  const load = useCallback(async () => {
    const from = new Date(Math.max(Date.parse(since.current), Date.now() - notificationWindow)).toISOString()
    const guestTokens = admin ? [] : Object.values({ ...pushGuestOrders(), ...readTrackingSession().guests })
    const { data, error } = await client.rpc('get_notification_feed', {
      p_admin: admin, p_since: from, p_guest_tokens: [...new Set(guestTokens)].slice(-50),
    })
    if (error) throw error
    return data
  }, [admin, client])
  const { result } = useOrderPolling(load, Boolean(client && enabled && (!admin || token)))

  function update(next) {
    setPreferences(next)
    writeLocal(preferencesKey, next)
  }

  const acknowledge = useCallback(id => {
    const cutoff = Date.now() - notificationWindow
    const saved = readLocal(viewedKey, {})
    const next = Object.fromEntries(Object.entries(saved).filter(([, time]) => time >= cutoff))
    next[id] = Date.now()
    writeLocal(viewedKey, next)
    setViewed(next)
  }, [viewedKey])

  useEffect(() => {
    function sync(event) {
      if (event.key === preferencesKey) setPreferences(normalizeSound(audience, readLocal(preferencesKey)))
      if (event.key === viewedKey) setViewed(readLocal(viewedKey, {}))
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [audience, preferencesKey, viewedKey])

  const play = useCallback(() => {
    if (preferences.enabled && preferences.volume > 0 && !playOrderSound(preferences)) setAudioHelp(true)
  }, [preferences])

  useEffect(() => {
    if (!result?.data) return
    let active = true
    async function receive() {
      if (document.visibilityState !== 'visible') return
      const additions = []
      const claimed = []
      const batch = result.data.filter(event => !consumed.current.has(event.id))
      for (const event of batch) {
        if (!active) return
        if (!await claim(audience + ':' + event.id)) {
          consumed.current.add(event.id)
          continue
        }
        if (!active) return
        consumed.current.add(event.id)
        claimed.push(event.id)
        const url = notificationPath(audience, event)
        if (admin && isNotificationViewed(event, readLocal(viewedKey, {}))) continue
        additions.push({ ...event, url, repeatUntil: Date.parse(event.occurred_at) + notificationWindow })
      }
      if (active && claimed.length) void acknowledgeBrowserPush(client, admin, claimed).catch(() => {})
      if (!active || !additions.length) return
      setAlerts(current => [...additions, ...current].slice(0, 100))
      play()
    }
    void receive()
    document.addEventListener('visibilitychange', receive)
    return () => { active = false; document.removeEventListener('visibilitychange', receive) }
  }, [admin, audience, client, play, result, viewedKey])

  useEffect(() => {
    if (!preferences.repeat || !preferences.enabled || !preferences.volume) return
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      const saved = readLocal(viewedKey, viewed)
      const pending = pendingRepeats(alerts, saved, Date.now())
      if (pending.length) play()
    }, repeatInterval)
    return () => clearInterval(timer)
  }, [alerts, play, preferences, viewed, viewedKey])

  const unread = alerts.filter(alert => !isNotificationViewed(alert, viewed))
  const showAudioHelp = audioHelp && !ready && preferences.enabled
  return <Context.Provider value={{ audience, preferences, update, unread, showAudioHelp, acknowledge }}>{children}</Context.Provider>
}

export function useAcknowledgeOrder(orderId) {
  const { acknowledge } = useContext(Context)
  useEffect(() => {
    if (orderId) acknowledge('order:' + orderId)
  }, [acknowledge, orderId])
}

export function NotificationInbox() {
  const { audience, unread, showAudioHelp, acknowledge } = useContext(Context)
  const admin = audience === 'admin'
  if (!unread.length && !showAudioHelp) return null
  return <section className="notification-center panel stack-small" aria-label="Notificações">
      {showAudioHelp && <div className="actions">
        <p>Toque para liberar os sons neste navegador.</p>
        <Button secondary onClick={() => void unlockOrderAudio()}>Liberar áudio</Button>
      </div>}
      {unread.length > 0 && <details open={!admin}>
        <summary aria-live="polite">{unread.length} {unread.length === 1 ? 'notificação nova' : 'notificações novas'}</summary>
        <ul className="stack-small">{unread.map(alert => <li key={alert.id}>
          <p>{notificationMessages[alert.kind]}{alert.started_preparing && ' Já estamos preparando seu pedido!'}</p>
          <div className="actions">
            <ActionLink secondary to={alert.url} onClick={() => acknowledge(alert.id)}>Ver detalhes</ActionLink>
            <Button secondary onClick={() => acknowledge(alert.id)}>{admin ? 'Reconhecer alerta' : 'Dispensar'}</Button>
          </div>
        </li>)}</ul>
      </details>}
    </section>
}

export function NotificationSettings() {
  const { audience, preferences, update } = useContext(Context)
  const [preview, setPreview] = useState('')
  const set = change => update({ ...preferences, ...change })
  return <section className="panel stack-small" id="notificacoes">
    <h2>Notificações</h2>
    <label><input type="checkbox" checked={preferences.enabled} onChange={event => set({ enabled: event.target.checked })} /> Sons de notificações</label>
    <label>Som <select value={preferences.sound} onChange={event => set({ sound: event.target.value })}>
      {Object.entries(soundNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
    </select></label>
    <label>Volume {preferences.volume}% <input type="range" min="0" max="100" value={preferences.volume} onChange={event => set({ volume: Number(event.target.value) })} /></label>
    {audience === 'admin' && <label><input type="checkbox" checked={preferences.repeat} onChange={event => set({ repeat: event.target.checked })} /> Repetir novos pedidos a cada 15 segundos</label>}
    <div className="actions">
      <Button secondary onClick={async () => {
        const ready = await unlockOrderAudio()
        if (!ready) setPreview('Toque novamente para liberar o áudio.')
        else if (preferences.volume === 0) setPreview('Aumente o volume para ouvir a prévia.')
        else { playOrderSound(preferences); setPreview('') }
      }}>Ouvir prévia</Button>
      <Button secondary onClick={() => { update(defaultSound(audience)); setPreview('') }}>Restaurar padrão</Button>
    </div>
    {preview && <p role="status">{preview}</p>}
    <PushSettings audience={audience} />
  </section>
}
