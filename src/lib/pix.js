export const pixKeyTypes = { cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', phone: 'Telefone', random: 'Chave aleatória' }
const demoReceiver = { type: 'email', key: 'pix@demo.invalid', name: 'BIJUS DEMO', city: 'SAO PAULO' }

function receiverText(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\x20-\x7E]/g, '').trim().replace(/\s+/g, ' ').toUpperCase()
}

export function validatePixReceiver({ type, key, name, city }) {
  key = key.trim()
  name = receiverText(name)
  city = receiverText(city)
  if (!/[A-Z]/.test(name) || name.length > 25) throw new Error('Informe o nome do recebedor com até 25 caracteres.')
  if (!/[A-Z]/.test(city) || city.length > 15) throw new Error('Informe a cidade com até 15 caracteres.')
  if (type === 'cpf' || type === 'cnpj') key = key.replace(/[.\/\s-]/g, '').toUpperCase()
  if (type === 'phone') key = key.replace(/[()\s-]/g, '')
  if (type === 'email' || type === 'random') key = key.toLowerCase()
  const formats = {
    cpf: /^\d{11}$/,
    cnpj: /^[A-Z0-9]{12}\d{2}$/,
    email: /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/,
    phone: /^\+[1-9]\d{7,14}$/,
    random: /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/,
  }
  if (!Object.hasOwn(formats, type) || !formats[type].test(key) || key.length > 77) {
    throw new Error('Informe uma chave no formato selecionado. Para telefone, inclua o código do país, como +55.')
  }
  return { type, key, name, city }
}

function field(id, value) {
  const size = new TextEncoder().encode(value).length
  if (size > 99) throw new Error('Campo BR Code excede o tamanho permitido.')
  return id + String(size).padStart(2, '0') + value
}

export function crc16(payload) {
  let crc = 0xffff
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function createPixPayload(order, receiver) {
  if (!Number.isSafeInteger(order.total) || order.total <= 0) throw new Error('O Pix exige um valor positivo em centavos.')
  const amount = (order.total / 100).toFixed(2)
  if (amount.length > 13) throw new Error('O valor excede o limite do BR Code.')
  const { key, name, city } = validatePixReceiver(receiver)
  const account = field('00', 'br.gov.bcb.pix') + field('01', key)
  const txid = order.number.replace(/[^a-z0-9]/gi, '').slice(0, 25) || '***'
  const payload = field('00', '01') + field('26', account) + field('52', '0000')
    + field('53', '986') + field('54', amount) + field('58', 'BR')
    + field('59', name) + field('60', city) + field('62', field('05', txid)) + '6304'
  return payload + crc16(payload)
}

export function createDemoPixService() {
  let receiver = { ...demoReceiver }
  return {
    readReceiver: () => ({ ...receiver }),
    saveReceiver: fields => { receiver = validatePixReceiver(fields) },
    createCharge: order => demoPixPayload(order, receiver),
  }
}

export function demoPixPayload(order, receiver = demoReceiver) {
  const safeKey = receiver.type === 'email' && receiver.key.endsWith('.invalid') ? receiver.key : demoReceiver.key
  return createPixPayload(order, { ...receiver, type: 'email', key: safeKey })
}
