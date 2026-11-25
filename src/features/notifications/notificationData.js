export const soundNames = {
  chime: 'Campainha', bells: 'Sinos', pulse: 'Pulso', melody: 'Melodia', signal: 'Sinal',
}

export const notificationMessages = {
  new_order: 'Chegou um novo pedido!',
  manual_review: 'O Pix expirou e o pedido precisa de revisão.',
  paid: 'Recebemos seu pagamento!',
  preparing: 'Estamos preparando seu pedido com carinho!',
  pickup: 'Seu pedido está prontinho para retirada!',
  delivery: 'Sua delícia está a caminho!',
  completed: 'Pedido concluído. Obrigada pela preferência!',
  canceled: 'Seu pedido foi cancelado. Se precisar, fale com a Biju’s Doce.',
  expired: 'O prazo do Pix terminou. Nossa equipe vai conferir seu pedido.',
  reward: 'Tem uma nova recompensa esperando por você!',
}

export const repeatInterval = 15_000
export const notificationWindow = 24 * 60 * 60_000

export function notificationPath(audience, event) {
  if (event.kind === 'reward') return '/perfil/fidelidade'
  return (audience === 'admin' ? '/admin/pedidos/' : '/pedido/') + event.order_id
}

export function defaultSound(audience) {
  return { enabled: true, sound: 'chime', volume: audience === 'admin' ? 85 : 55, repeat: false }
}

export function normalizeSound(audience, saved) {
  const defaults = defaultSound(audience)
  return {
    enabled: typeof saved?.enabled === 'boolean' ? saved.enabled : defaults.enabled,
    sound: Object.hasOwn(soundNames, saved?.sound) ? saved.sound : defaults.sound,
    volume: Number.isFinite(saved?.volume) ? Math.max(0, Math.min(100, saved.volume)) : defaults.volume,
    repeat: audience === 'admin' && saved?.repeat === true,
  }
}

export function readLocal(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}

export function writeLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* preferences remain in memory */ }
}

export function pendingRepeats(alerts, viewed, now) {
  return alerts.filter(alert => alert.kind === 'new_order' && !isNotificationViewed(alert, viewed) && alert.repeatUntil > now)
}

export function isNotificationViewed(event, viewed) {
  return Boolean(viewed[event.id]) || (event.kind === 'new_order' &&
    viewed['order:' + event.order_id] >= Date.parse(event.occurred_at))
}
