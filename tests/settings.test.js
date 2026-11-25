import assert from 'node:assert/strict'
import { test } from 'node:test'
import { areaInput, pixInput, saveStoreState, settingsError } from '../src/features/admin/settingsData.js'
import { deliveryFeeFor } from '../src/lib/orders.js'

function form(fields) {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

test('Taxas são convertidas em centavos e apenas bairros atendidos têm entrega', () => {
  assert.deepEqual(areaInput(form({ name: ' Centro ', fee: '3,00', available: 'on' })),
    { name: 'Centro', fee_cents: 300, available: true })
  assert.equal(areaInput(form({ name: 'Centro', fee: '6,00' })).fee_cents, 600)
  assert.equal(areaInput(form({ name: 'Centro', fee: '4,75' })).fee_cents, 475)
  assert.throws(() => areaInput(form({ name: ' ', fee: '3,00' })), /nome/)
  const areas = [{ id: 'centro', fee: 600 }, { id: 'fora', fee: 300, available: false }]
  assert.equal(deliveryFeeFor('pickup', 'fora', areas), 0)
  assert.equal(deliveryFeeFor('delivery', 'centro', areas), 600)
  assert.equal(deliveryFeeFor('delivery', 'fora', areas), undefined)
  assert.equal(deliveryFeeFor('delivery', 'ausente', areas), undefined)
})

test('Configuração Pix normaliza todos os tipos e rejeita dados incompatíveis', () => {
  const base = { name: 'Biju Açúcar', city: 'São Paulo' }
  for (const [type, key, normalized] of [
    ['cpf', '123.456.789-09', '12345678909'],
    ['cnpj', '12.345.678/0001-95', '12345678000195'],
    ['email', 'QA@EXAMPLE.TEST', 'qa@example.test'],
    ['phone', '+55 (11) 99000-0000', '+5511990000000'],
    ['random', '123e4567-e12b-12d1-a456-426655440000', '123e4567-e12b-12d1-a456-426655440000'],
  ]) {
    assert.deepEqual(pixInput(form({ ...base, type, key })), {
      pix_key_type: type, pix_key: normalized, receiver_name: 'BIJU ACUCAR', receiver_city: 'SAO PAULO',
    })
  }
  assert.throws(() => pixInput(form({ ...base, type: 'phone', key: '11990000000' })), /formato/)
  assert.throws(() => pixInput(form({ ...base, type: 'email', key: 'pix@demo.invalid' })), /válida/)
})

test('Abertura passa pela RPC protegida e recusa ausência da migração sem chamada alternativa', async () => {
  const unavailable = { code: 'PGRST202' }
  const client = {
    rpc: async (name, parameters) => {
      assert.equal(name, 'set_store_open')
      assert.deepEqual(parameters, { p_open: true })
      return { error: unavailable }
    },
    from: () => assert.fail('abertura direta indevida'),
  }
  await assert.rejects(saveStoreState(client, 'loja', true), error => error === unavailable)
  assert.match(settingsError(unavailable), /migração/)
})
