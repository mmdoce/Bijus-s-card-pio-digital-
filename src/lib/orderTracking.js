import { isOrderId } from './orderData.js'

const messages = {
  AGUARDANDO_PAGAMENTO: ['◷', 'Estamos aguardando seu Pix.'],
  PAGAMENTO_EXPIRADO: ['⌛', 'Aguarde a conferência da nossa equipe.'],
  PAGAMENTO_CONFIRMADO: ['✓', 'Recebemos seu pagamento!'],
  EM_PREPARO: ['♡', 'Estamos preparando seu pedido com carinho!'],
  PRONTO: ['✓', 'Seu pedido está prontinho!'],
  SAIU_PARA_ENTREGA: ['➜', 'Sua delícia está a caminho!'],
  CONCLUIDO: ['✓', 'Obrigada pela preferência!'],
  CANCELADO: ['×', 'Seu pedido foi cancelado. Entre em contato com nossa loja.'],
}
export function isFinalOrder(order) {
  return ['CONCLUIDO', 'CANCELADO'].includes(order.status)
}

export const finalOrderVisibility = 30 * 60_000

export function trackingView(order) {
  const aliases = { REVISAO_MANUAL: 'PAGAMENTO_EXPIRADO', PRONTO_ENTREGA: 'PRONTO' }
  const status = aliases[order.status] ?? order.status
  const [icon, message] = messages[status]
  const steps = [
    ...(order.payment === 'pix' && order.total > 0 ? ['AGUARDANDO_PAGAMENTO', 'PAGAMENTO_CONFIRMADO'] : []),
    'EM_PREPARO', 'PRONTO', ...(order.method === 'delivery' ? ['SAIU_PARA_ENTREGA'] : []), 'CONCLUIDO',
  ]
  const index = status === 'PAGAMENTO_EXPIRADO' ? 0 : steps.indexOf(status)
  return {
    status, icon, message, progress: index < 0 ? 0 : index + 1, steps: steps.length,
    paymentMessage: order.financialStatus === 'CONFIRMADO' && !isFinalOrder(order) && status !== 'PAGAMENTO_CONFIRMADO'
      ? messages.PAGAMENTO_CONFIRMADO[1] : '',
  }
}

export function trackedOrders(orders, accountId, guestTokens) {
  return orders.filter(order => order.accountId ? order.accountId === accountId : guestTokens.includes(order.token))
}

export function readTrackingSession(storage) {
  try {
    const saved = JSON.parse((storage ?? globalThis.sessionStorage).getItem('bijus-tracking-session'))
    return {
      tokens: Array.isArray(saved?.tokens) ? saved.tokens.filter(isPrivateTrackingToken) : [],
      dismissed: Array.isArray(saved?.dismissed) ? saved.dismissed.filter(isOrderId) : [],
      guests: Object.fromEntries(Object.entries(saved?.guests ?? {}).filter(([id, token]) => isOrderId(id) && isPrivateTrackingToken(token))),
    }
  } catch {
    return { tokens: [], dismissed: [], guests: {} }
  }
}

export function writeTrackingSession(tracking, storage = globalThis.sessionStorage) {
  storage.setItem('bijus-tracking-session', JSON.stringify(tracking))
}

export function isPrivateTrackingToken(token) {
  return typeof token === 'string' && /^[0-9a-f]{64}$/.test(token)
}

export function rememberGuestOrder(id, token, storage = globalThis.sessionStorage) {
  if (!isOrderId(id) || !isPrivateTrackingToken(token)) throw new Error('Não foi possível guardar o acesso ao pedido. Retome a tentativa nesta aba.')
  const current = readTrackingSession(storage)
  writeTrackingSession({ ...current, guests: { ...current.guests, [id]: token } }, storage)
}

export function observeOrderChanges(previous, orders) {
  const snapshot = new Map()
  let changed = false
  for (const order of orders) {
    const signature = order.status + '/' + order.financialStatus
    const known = previous.get(order.id)
    if (known && order.revision <= known.revision) {
      snapshot.set(order.id, known)
      continue
    }
    if (known && known.signature !== signature) changed = true
    snapshot.set(order.id, { signature, revision: order.revision })
  }
  return { snapshot, changed }
}
