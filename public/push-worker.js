import { claimNotification } from './notification-ledger.js'

const allowed = /^(?:\/perfil\/fidelidade|\/(?:admin\/pedidos|pedido)\/[a-f0-9-]{36})$/

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data
    try { data = event.data.json() } catch { return }
    if (typeof data.id !== 'string' || !allowed.test(data.url) || typeof data.body !== 'string') return
    if (!await claimNotification(data.audience + ':' + data.id).catch(() => true)) return
    await self.registration.showNotification('Biju’s Doce', {
      body: data.body, icon: '/icons/bijus-192.png', tag: data.audience + ':' + data.id, data: { url: data.url },
    })
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const path = event.notification.data?.url
  if (!allowed.test(path ?? '')) return
  const url = new URL(path, self.location.origin).href
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = tabs.find(tab => tab.url === url)
    if (existing) await existing.focus()
    else await self.clients.openWindow(url)
  })())
})
