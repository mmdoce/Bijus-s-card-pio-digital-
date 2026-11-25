import { readLocal, writeLocal } from './notificationData'
import { isOrderId } from '../../lib/orderData'
import { isPrivateTrackingToken } from '../../lib/orderTracking'

const deviceKey = 'bijus-push-device'
const guestKey = 'bijus-push-guest-orders'
function validGuestOrders(guests) {
  return Object.fromEntries(Object.entries(guests)
    .filter(([id, token]) => isOrderId(id) && isPrivateTrackingToken(token)).slice(-50))
}

export const pushGuestOrders = () => validGuestOrders(readLocal(guestKey, {}))

export async function acknowledgeBrowserPush(client, admin, events) {
  const secret = readLocal(deviceKey)
  if (!secret || !navigator.serviceWorker || !events.length) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager?.getSubscription()
  if (!subscription) return
  for (let offset = 0; offset < events.length; offset += 100) {
    await client.rpc('acknowledge_web_push', {
      p_endpoint: subscription.endpoint, p_secret: secret, p_admin: admin, p_events: events.slice(offset, offset + 100),
    })
  }
}

export async function revokeBrowserPush(client) {
  if (!globalThis.navigator?.serviceWorker) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager?.getSubscription()
  if (!subscription) {
    writeLocal(guestKey, {})
    return
  }
  const secret = readLocal(deviceKey)
  if (client && secret) {
    const { error } = await client.rpc('revoke_web_push', { p_endpoint: subscription.endpoint, p_secret: secret })
    if (error) {
      if (!await subscription.unsubscribe()) throw error
      writeLocal(guestKey, {})
      return
    }
  }
  await subscription.unsubscribe()
  writeLocal(guestKey, {})
}

export async function registerBrowserPush(client, subscription, audience, guests = {}) {
  guests = validGuestOrders(guests)
  let secret = readLocal(deviceKey)
  if (!secret) {
    secret = Array.from(crypto.getRandomValues(new Uint8Array(32)), v => v.toString(16).padStart(2, '0')).join('')
    writeLocal(deviceKey, secret)
    if (readLocal(deviceKey) !== secret) throw new Error('Permita o armazenamento neste navegador.')
  }
  const { keys } = subscription.toJSON()
  const { error } = await client.rpc('register_web_push', {
    p_endpoint: subscription.endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth, p_secret: secret,
    p_audience: audience, p_guest_tokens: Object.values(guests),
  })
  if (error) throw new Error('Não foi possível salvar a inscrição neste dispositivo.')
  writeLocal(guestKey, audience === 'guest' ? guests : {})
}

export async function addGuestPushOrder(client, id, token) {
  const guests = pushGuestOrders()
  if (!Object.keys(guests).length || !navigator.serviceWorker) return
  const registration = await navigator.serviceWorker.getRegistration('/')
  const subscription = await registration?.pushManager?.getSubscription()
  if (!subscription) return
  await registerBrowserPush(client, subscription, 'guest', { ...guests, [id]: token })
}
