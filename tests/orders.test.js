import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkoutPayload, failedBeforeOrderCreation, finishOrderAttempt, getOrder, orderItemsInput, placeOrder, prepareOrderAttempt, readOrderAttempt } from '../src/lib/orderData.js'
import { nextStatuses } from '../src/lib/orders.js'
import { isPrivateTrackingToken, readTrackingSession, rememberGuestOrder } from '../src/lib/orderTracking.js'

const id = '10000000-0000-4000-8000-000000000001'
const tracker = '4'.repeat(64)
const storage = () => {
  const values = new Map()
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}

test('Checkout envia IDs e quantidades, sem preços dos produtos e sem endereço para retirada', () => {
  const items = orderItemsInput([{ product: { id, price: 1400 }, quantity: 2 }])
  const customer = { name: 'Cliente teste', phone: '+5511990000000', district: id, street: 'Rua', streetNumber: '1' }
  const order = checkoutPayload({ items, method: 'pickup', payment: 'receipt', customer, total: 2800 })
  assert.deepEqual(order.p_items, [{ product_id: id, quantity: 2 }])
  assert.deepEqual(order.p_customer, { name: customer.name, phone: customer.phone, expected_total_cents: 2800 })
  const delivery = checkoutPayload({ items, method: 'delivery', payment: 'pix', customer, total: 3100 })
  assert.equal(delivery.p_customer.delivery_area_id, id)
  assert.equal(delivery.p_customer.street_number, '1')
})

test('Tentativa retomada mantém o ID e os mesmos dados sem misturar visitante e conta', async () => {
  const state = storage()
  const payload = { p_items: [{ product_id: id, quantity: 1 }] }
  const initial = prepareOrderAttempt('guest', payload, state, () => id)
  const resumed = prepareOrderAttempt('guest', { p_items: [] }, state, () => assert.fail('nova chave'))
  assert.deepEqual(initial, resumed)
  assert.equal(readOrderAttempt(id, state), null)
  const calls = []
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { id } } } }
  await placeOrder(client, initial)
  await placeOrder(client, resumed)
  assert.deepEqual(calls[0], calls[1])
  finishOrderAttempt('guest', state)
  assert.equal(readOrderAttempt('guest', state), null)
})

test('Falha ambígua preserva a chave e rejeição do total permite recotar', async () => {
  const client = { rpc: async () => ({ error: { code: '22023', message: 'checkout total changed' } }) }
  await assert.rejects(() => placeOrder(client, {}), error => failedBeforeOrderCreation(error) && /total mudou/.test(error.message))
  assert.equal(failedBeforeOrderCreation(new Error('rede')), false)
  assert.equal(failedBeforeOrderCreation(new Error('acesso', { cause: { code: '42501' } })), false)
})

test('Acompanhamento guarda token hexadecimal por UUID e usa a RPC apropriada', async () => {
  const state = storage()
  assert.ok(isPrivateTrackingToken(tracker))
  assert.ok(!isPrivateTrackingToken(id))
  assert.ok(!isPrivateTrackingToken('BD-1001'))
  rememberGuestOrder(id, tracker, state)
  assert.equal(readTrackingSession(state).guests[id], tracker)
  const client = { rpc: async (name, args) => ({ data: { name, args } }) }
  assert.deepEqual(await getOrder(client, id, tracker), { name: 'track_guest_order', args: { p_token: tracker } })
  assert.deepEqual(await getOrder(client, id), { name: 'get_my_order', args: { p_order_id: id } })
  assert.ok(!nextStatuses({ status: 'PRONTO', financialStatus: 'PENDENTE' }).includes('CONCLUIDO'))
  assert.ok(nextStatuses({ status: 'PRONTO', financialStatus: 'CONFIRMADO' }).includes('CONCLUIDO'))
})
