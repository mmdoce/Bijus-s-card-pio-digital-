const messages = {
  'store is closed': 'A loja está fechada para novos pedidos.',
  'product is unavailable': 'Um dos produtos não está mais disponível.',
  'delivery area is unavailable': 'Este bairro não está disponível para entrega.',
  'invalid customer name or phone': 'Informe seu nome e um WhatsApp válido.',
  'Pix is not configured': 'O Pix está indisponível. Escolha pagamento no recebimento.',
  'customer profile is required': 'Complete seu perfil antes de fazer o pedido.',
  'reward is not available': 'A recompensa não está mais disponível. Confira o novo total.',
  'checkout total changed': 'O total mudou. Confira os valores e confirme novamente.',
  'cancellation reason required': 'Informe o motivo do cancelamento.',
  'invalid status transition or payment still pending': 'A mudança não está disponível. Confira a situação do pagamento.',
  'payment cannot be confirmed': 'O pagamento não pode ser confirmado no estado atual.',
  'confirmed payment and refund reason required': 'O reembolso exige pagamento confirmado e motivo.',
  'late Pix confirmation requires an available reward': 'A recompensa original não está disponível. Revise o pedido antes de confirmar.',
  'checkout request id already used for different data': 'A tentativa tem dados diferentes. Atualize a página antes de continuar.',
}

export function orderError(error) {
  return new Error(messages[error?.message] ?? (['42501', 'PGRST202'].includes(error?.code)
    ? 'Esta operação está indisponível no servidor ou para a sua conta.'
    : 'Não foi possível concluir a operação. Tente novamente.'), { cause: error })
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw orderError(error)
  return data
}

export const isOrderId = value => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)

export function orderItemsInput(items) {
  return items.map(({ product, quantity }) => ({ product_id: product.id, quantity }))
    .sort((a, b) => a.product_id.localeCompare(b.product_id))
}

export function quoteOrder(client, method, district, items) {
  return rpc(client, 'quote_order', { p_receipt_method: method, p_area_id: method === 'delivery' ? district : null, p_items: items })
}

export function checkoutPayload({ items, method, payment, customer, notes, total }) {
  return {
    p_receipt_method: method, p_payment_method: payment, p_items: items,
    p_customer: {
      name: customer.name, phone: customer.phone, expected_total_cents: total,
      ...(method === 'delivery' ? {
        delivery_area_id: customer.district, street: customer.street, street_number: customer.streetNumber,
        complement: customer.complement || null, reference: customer.reference || null,
      } : {}),
    },
    p_notes: notes?.trim() || null,
  }
}

const attemptKey = scope => 'bijus-order-attempt:' + scope

export function readOrderAttempt(scope, storage) {
  try { return JSON.parse((storage ?? globalThis.sessionStorage).getItem(attemptKey(scope))) } catch { return null }
}

export function prepareOrderAttempt(scope, payload, storage = globalThis.sessionStorage, createId = () => crypto.randomUUID()) {
  const existing = readOrderAttempt(scope, storage)
  if (existing) return existing
  const attempt = { p_request_id: createId(), ...payload }
  storage.setItem(attemptKey(scope), JSON.stringify(attempt))
  return attempt
}

export function finishOrderAttempt(scope, storage = globalThis.sessionStorage) {
  storage.removeItem(attemptKey(scope))
}

export function failedBeforeOrderCreation(error) {
  return ['22023', '23514', 'P0001'].includes(error?.cause?.code)
    && error?.cause?.message !== 'checkout request id already used for different data'
}

export async function placeOrder(client, attempt) {
  const result = await rpc(client, 'place_order', attempt)
  if (!isOrderId(result?.id)) throw new Error('Não foi possível confirmar a criação. Retome a tentativa para evitar pedidos duplicados.')
  return result
}

export function getOrder(client, id, privateToken) {
  return privateToken ? rpc(client, 'track_guest_order', { p_token: privateToken })
    : rpc(client, 'get_my_order', { p_order_id: id })
}

export function performOrderAction(client, id, action, reason, reference, requestId) {
  return rpc(client, 'admin_order_action', {
    p_order_id: id, p_action: action, p_reason: reason?.trim() || null,
    p_reference: reference?.trim() || null, p_request_id: requestId,
  })
}

export function orderView(data) {
  const items = (data.items ?? []).map((item, index) => ({ product: { id: index, name: item.name }, quantity: item.quantity, reward: item.is_reward }))
  return {
    id: data.id, number: data.number, revision: data.revision, status: data.status,
    financialStatus: data.financial_status, method: data.receipt_method, payment: data.payment_method,
    total: data.total_cents, deliveryFee: data.delivery_fee_cents, items, reward: items.some(item => item.reward),
    createdAt: Date.parse(data.created_at), finishedAt: data.finished_at ? Date.parse(data.finished_at) : null,
    expiresAt: data.expires_at ? Date.parse(data.expires_at) : null, pixPayload: data.pix_payload,
  }
}
