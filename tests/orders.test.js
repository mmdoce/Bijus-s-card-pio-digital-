import assert from 'node:assert/strict'
import { test } from 'node:test'
import { brazilianPhone, createOrder, expireOrder, loyaltyBalance, nextStatuses, updateOrder, whatsappMessage } from '../src/lib/orders.js'
import { demoPixPayload } from '../src/lib/pix.js'
import { products, neighborhoods } from '../src/mocks/store.js'

const now = 1_000_000
const customer = {
  name: 'Cliente Teste', phone: '+55 (11) 99000-0000',
  district: 'centro', street: 'Rua Teste', streetNumber: '20', complement: 'Casa', reference: 'Esquina',
}
const draft = { items: [{ product: products[0], quantity: 1 }], method: 'delivery', payment: 'pix', customer, notes: 'Nota' }
const context = { catalog: products, areas: neighborhoods, open: true, orders: [], accountId: 'cliente', now, id: 'pedido', token: 'token' }

test('Pix inclui a taxa no total e exige confirmação para entrar em preparo', () => {
  const order = createOrder(draft, context)
  assert.equal(order.total, 1900)
  assert.equal(order.status, 'AGUARDANDO_PAGAMENTO')
  assert.equal(order.financialStatus, 'PENDENTE')
  assert.equal(order.expiresAt, now + 300_000)
  assert.match(demoPixPayload(order), /540519\.005802BR/)
  assert.match(demoPixPayload(order), /6304[0-9A-F]{4}$/)
  assert.throws(() => updateOrder(order, 'EM_PREPARO', [order], now))
  const paid = updateOrder(order, 'confirm', [order], now + 1)
  assert.equal(paid.status, 'EM_PREPARO')
  assert.equal(paid.financialStatus, 'CONFIRMADO')
  assert.throws(() => updateOrder(paid, 'confirm', [paid], now + 2))
})

test('Pix vencido fica em revisão manual e permite confirmação tardia', () => {
  const order = createOrder(draft, context)
  assert.equal(expireOrder(order, order.expiresAt - 1), order)
  const expired = expireOrder(order, order.expiresAt)
  assert.equal(expired.status, 'REVISAO_MANUAL')
  assert.equal(expired.financialStatus, 'EXPIRADO')
  assert.match(whatsappMessage(expired, 'REVISAO_MANUAL'), /prazo de pagamento.*terminou/)
  assert.equal(updateOrder(expired, 'confirm', [expired], order.expiresAt + 1).status, 'EM_PREPARO')
})

for (const [method, ready, total] of [['pickup', 'PRONTO', 1400], ['delivery', 'SAIU_PARA_ENTREGA', 1900]]) {
  test(`Pagamento no recebimento (${method}) segue em preparo e exige confirmação para concluir`, () => {
    const order = createOrder({ ...draft, method, payment: 'receipt' }, context)
    assert.equal(order.total, total)
    assert.equal(order.expiresAt, null)
    assert.equal(order.status, 'EM_PREPARO')
    assert.equal(loyaltyBalance([order], 'cliente'), 0)
    const moved = updateOrder(order, ready, [order], now)
    assert.ok(!nextStatuses(moved).includes('CONCLUIDO'))
    assert.throws(() => updateOrder(moved, 'CONCLUIDO', [moved], now))
    const paid = updateOrder(moved, 'confirm', [moved], now)
    assert.equal(paid.status, ready)
    assert.equal(loyaltyBalance([paid], 'cliente'), 1)
    assert.equal(loyaltyBalance([paid], 'outra-pessoa'), 0)
    assert.equal(updateOrder(paid, 'CONCLUIDO', [paid], now).status, 'CONCLUIDO')
  })
}

test('Recompensa gratuita não gera cobrança nem carimbo e o cancelamento libera a reserva', () => {
  const prior = { accountId: 'cliente', financialStatus: 'CONFIRMADO', stamps: 11 }
  const reward = createOrder({ ...draft, method: 'pickup' }, { ...context, orders: [prior] })
  assert.equal(reward.status, 'EM_PREPARO')
  assert.equal(reward.financialStatus, 'ISENTO')
  assert.equal(reward.total, 0)
  assert.equal(reward.expiresAt, null)
  assert.equal(reward.stamps, 0)
  assert.equal(loyaltyBalance([prior, reward], 'cliente'), 2)
  const ready = updateOrder(reward, 'PRONTO', [prior, reward], now)
  assert.ok(nextStatuses(ready).includes('CONCLUIDO'))
  const canceled = updateOrder(ready, 'CANCELADO', [prior, ready], now)
  assert.equal(loyaltyBalance([prior, canceled], 'cliente'), 11)
  assert.equal(createOrder(draft, { ...context, orders: [prior] }).total, 500)
})

test('Pix expirado libera recompensa e exige saldo para reaproveitá-la', () => {
  const prior = { accountId: 'cliente', financialStatus: 'CONFIRMADO', stamps: 9 }
  const order = createOrder(draft, { ...context, orders: [prior] })
  const expired = expireOrder(order, order.expiresAt)
  const later = createOrder({ ...draft, method: 'pickup' }, { ...context, orders: [prior, expired], now: order.expiresAt, id: 'outro' })
  assert.equal(later.reward, true)
  assert.throws(() => updateOrder(expired, 'confirm', [prior, expired, later], order.expiresAt), /recompensa/)
})

test('Criação valida loja e disponibilidade e guarda snapshots independentes', () => {
  const withPhoto = { ...products[0], image: 'blob:foto-original' }
  const person = { ...customer }
  const input = { ...draft, customer: person }
  const order = createOrder(input, { ...context, catalog: [withPhoto], accountId: null })
  withPhoto.price = 5000
  withPhoto.image = 'blob:foto-editada'
  person.street = 'Outra rua'
  assert.equal(order.items[0].product.price, 1400)
  assert.equal(order.items[0].product.image, 'blob:foto-original')
  assert.equal(order.receipt.street, 'Rua Teste')
  assert.equal(order.accountId, null)
  assert.throws(() => createOrder(input, { ...context, open: false }), /fechada/)
  assert.throws(() => createOrder(input, { ...context, catalog: [] }), /carrinho/)
  assert.throws(() => createOrder({ ...input, customer: { ...person, streetNumber: '' } }, context), /rua e número/)
  assert.equal(brazilianPhone(customer.phone), '5511990000000')
  assert.equal(brazilianPhone('123'), '')
})
