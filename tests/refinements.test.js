import assert from 'node:assert/strict'
import { test } from 'node:test'
import { playOrderSound, unlockOrderAudio } from '../src/lib/orderSound.js'
import { isFinalOrder, observeOrderChanges, readTrackingSession, trackedOrders, trackingView } from '../src/lib/orderTracking.js'
import { crc16, createDemoPixService, createPixPayload, validatePixReceiver } from '../src/lib/pix.js'

const order = { id: 'one', number: 'BD-1002', total: 2150, method: 'delivery', payment: 'pix', status: 'AGUARDANDO_PAGAMENTO', financialStatus: 'PENDENTE', revision: 0 }

test('BR Code preserva valor, identificador, recebedor normalizado e CRC16', () => {
  const receiver = { type: 'email', key: 'pedido@demo.invalid', name: 'Biju Açúcar', city: 'São Paulo' }
  assert.equal(crc16('123456789'), '29B1')
  const payload = createPixPayload(order, receiver)
  assert.match(payload, /0014br\.gov\.bcb\.pix0119pedido@demo\.invalid/)
  assert.match(payload, /540521\.505802BR5911BIJU ACUCAR6009SAO PAULO62100506BD1002/)
  assert.equal(payload.slice(-4), crc16(payload.slice(0, -4)))
  assert.throws(() => createPixPayload({ ...order, total: 0 }, receiver))
  assert.throws(() => validatePixReceiver({ ...receiver, city: 'Uma cidade com mais de quinze caracteres' }), /cidade/)
})

test('Configuração valida o tipo e a simulação usa somente chaves do domínio .invalid', () => {
  const service = createDemoPixService()
  const defaults = service.readReceiver()
  assert.throws(() => service.saveReceiver({ ...defaults, type: 'phone', key: '123' }), /formato/)
  assert.deepEqual(service.readReceiver(), defaults)
  const local = { ...defaults, type: 'random', key: '123e4567-e12b-12d1-a456-426655440000', name: 'Teste Pix' }
  service.saveReceiver(local)
  assert.match(service.createCharge(order), /pix@demo\.invalid/)
  assert.match(service.createCharge(order), /5909TESTE PIX/)
  assert.ok(!service.createCharge(order).includes(local.key))
  service.saveReceiver({ ...local, type: 'email', key: 'lojinha@demo.invalid' })
  assert.match(service.createCharge(order), /lojinha@demo\.invalid/)
})

test('Acompanhamento apresenta todos os estados e respeita retirada, entrega e forma de pagamento', () => {
  const states = {
    AGUARDANDO_PAGAMENTO: 'Estamos aguardando seu Pix.',
    REVISAO_MANUAL: 'Aguarde a conferência da nossa equipe.',
    PAGAMENTO_CONFIRMADO: 'Recebemos seu pagamento!',
    EM_PREPARO: 'Estamos preparando seu pedido com carinho!',
    PRONTO: 'Seu pedido está prontinho!',
    PRONTO_ENTREGA: 'Seu pedido está prontinho!',
    SAIU_PARA_ENTREGA: 'Sua delícia está a caminho!',
    CONCLUIDO: 'Obrigada pela preferência!',
    CANCELADO: 'Seu pedido foi cancelado. Entre em contato com nossa loja.',
  }
  for (const [status, message] of Object.entries(states)) {
    const view = trackingView({ ...order, status })
    assert.equal(view.message, message)
    assert.ok(view.icon)
    assert.ok(view.progress >= 0 && view.progress <= view.steps)
  }
  const pickup = { ...order, method: 'pickup', payment: 'receipt', status: 'EM_PREPARO' }
  assert.equal(trackingView(pickup).steps, 3)
  assert.equal(trackingView(pickup).progress, 1)
  assert.equal(trackingView({ ...pickup, payment: 'pix', total: 0 }).progress, 1)
  assert.equal(trackingView({ ...order, status: 'EM_PREPARO', financialStatus: 'CONFIRMADO' }).paymentMessage, states.PAGAMENTO_CONFIRMADO)
  assert.ok(isFinalOrder({ status: 'CONCLUIDO' }))
  assert.ok(isFinalOrder({ status: 'CANCELADO' }))
})

test('Acompanhamento filtra pedidos por dono ou token privado da aba', () => {
  const token = 'a'.repeat(64)
  const own = { id: 'own', accountId: 'customer' }
  const guest = { id: 'guest', token }
  const others = [{ id: 'other', accountId: 'other', token }, { id: 'other-guest', token: 'other-token' }]
  const storage = { getItem: () => JSON.stringify({ tokens: [token, 'other-token'], dismissed: [] }) }
  const session = readTrackingSession(storage)
  assert.deepEqual(session.tokens, [token])
  assert.deepEqual(trackedOrders([own, guest, ...others], 'customer', session.tokens), [own, guest])
  assert.deepEqual(trackedOrders([own, guest, ...others], null, session.tokens), [guest])
})

test('Mudanças de status ignoram carga inicial, duplicados, versões antigas e reentrada na conta', () => {
  const expired = { ...order, revision: 1, status: 'REVISAO_MANUAL', financialStatus: 'EXPIRADO' }
  const next = { ...expired, revision: 2, status: 'EM_PREPARO', financialStatus: 'CONFIRMADO' }
  let observation = observeOrderChanges(new Map(), [order])
  assert.equal(observation.changed, false)
  observation = observeOrderChanges(observation.snapshot, [expired])
  assert.equal(observation.changed, true)
  observation = observeOrderChanges(observation.snapshot, [order])
  assert.equal(observation.changed, false)
  observation = observeOrderChanges(observation.snapshot, [expired])
  assert.equal(observation.changed, false)
  observation = observeOrderChanges(observation.snapshot, [next])
  assert.equal(observation.changed, true)
  observation = observeOrderChanges(observation.snapshot, [{ ...next, revision: 3 }])
  assert.equal(observation.changed, false)
  observation = observeOrderChanges(observation.snapshot, [])
  assert.equal(observeOrderChanges(observation.snapshot, [next]).changed, false)
})

test('Som aguarda desbloqueio, distingue cinco sinais e respeita o volume', async () => {
  const waves = []
  const volumes = []
  const original = globalThis.AudioContext
  globalThis.AudioContext = class {
    state = 'suspended'
    currentTime = 0
    destination = {}
    addEventListener() {}
    async resume() { this.state = 'running' }
    createOscillator() {
      const notes = []
      return { frequency: { setValueAtTime(note) { notes.push(note) } }, connect: node => node,
        start() { waves.push([this.type, notes]) }, stop() {} }
    }
    createGain() {
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime(peak) { volumes.push(peak) },
        exponentialRampToValueAtTime() {} }, connect() {} }
    }
  }
  try {
    assert.equal(playOrderSound({ sound: 'chime', volume: 50 }), false)
    assert.equal(waves.length, 0)
    assert.equal(await unlockOrderAudio(), true)
    for (const sound of ['chime', 'bells', 'pulse', 'melody', 'signal']) {
      assert.equal(playOrderSound({ sound, volume: 50 }), true)
    }
    assert.equal(new Set(waves.map(wave => JSON.stringify(wave))).size, 5)
    assert.equal(volumes[0], 0.21)
    assert.equal(playOrderSound({ sound: 'chime', volume: 0 }), false)
    assert.equal(waves.length, 5)
  } finally {
    globalThis.AudioContext = original
  }
})
