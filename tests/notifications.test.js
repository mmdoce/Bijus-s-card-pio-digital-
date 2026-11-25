import assert from 'node:assert/strict'
import test from 'node:test'
import { currentFinancePeriod, financePeriod } from '../src/features/admin/financeDates.js'
import { defaultSound, normalizeSound, notificationPath, pendingRepeats } from '../src/features/notifications/notificationData.js'

test('Preferências sonoras preservam a escolha e limitam volume e repetição', () => {
  assert.equal(defaultSound('admin').enabled, true)
  assert.deepEqual(normalizeSound('customer', { enabled: false, sound: 'bells', volume: 180, repeat: true }),
    { enabled: false, sound: 'bells', volume: 100, repeat: false })
  assert.equal(normalizeSound('admin', { sound: 'invalid', volume: -1 }).sound, 'chime')
  assert.equal(normalizeSound('admin', { repeat: true }).repeat, true)
})

test('Repetição termina ao reconhecer, visualizar o pedido ou expirar o alerta', () => {
  const order = { id: 'event', kind: 'new_order', order_id: 'order', occurred_at: new Date(10).toISOString(), repeatUntil: 20 }
  assert.deepEqual(pendingRepeats([order, { ...order, kind: 'manual_review' }], {}, 15), [order])
  assert.deepEqual(pendingRepeats([order], { event: 15 }, 15), [])
  assert.deepEqual(pendingRepeats([order], { 'order:order': 15 }, 15), [])
  assert.deepEqual(pendingRepeats([order], {}, 20), [])
  assert.equal(notificationPath('customer', { kind: 'reward' }), '/perfil/fidelidade')
  assert.equal(notificationPath('admin', order), '/admin/pedidos/order')
})

test('Financeiro inclui o dia final inteiro no fuso de São Paulo', () => {
  assert.deepEqual(currentFinancePeriod(new Date('2026-12-01T01:00:00Z')), { start: '2026-11-01', end: '2026-11-30' })
  assert.deepEqual(financePeriod({ start: '2026-11-30', end: '2026-11-30' }),
    { p_from: '2026-11-30T03:00:00.000Z', p_until: '2026-12-01T03:00:00.000Z' })
  assert.throws(() => financePeriod({ start: '2026-02-30', end: '2026-03-03' }))
})
