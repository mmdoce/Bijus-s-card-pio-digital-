import { validatePixReceiver } from '../../lib/pix.js'
import { catalogError, priceInCents } from './catalogData.js'

export function areaInput(form) {
  const name = form.get('name')?.trim()
  if (!name || name.length > 100) throw new Error('Informe o nome do bairro, com até 100 caracteres.')
  return { name, fee_cents: priceInCents(form.get('fee')), available: form.has('available') }
}

export function pixInput(form) {
  const { type, key, name, city } = validatePixReceiver({
    type: form.get('type'), key: form.get('key') ?? '', name: form.get('name') ?? '', city: form.get('city') ?? '',
  })
  if (type === 'email' && key.endsWith('.invalid')) throw new Error('Informe uma chave de e-mail válida para o Pix.')
  return { pix_key_type: type, pix_key: key, receiver_name: name, receiver_city: city }
}

export function settingsError(error) {
  if (error?.code === 'PGRST202') return 'A abertura aguarda a migração da operação manual no servidor.'
  if (error?.code === 'P0001' && error.message === 'checkout must stay disabled') return 'A loja só pode abrir quando o envio de pedidos estiver bloqueado no servidor.'
  if (error?.code === '23514') return 'Confira os campos e o formato selecionado.'
  return catalogError(error)
}

async function unwrap(query) {
  const { data, error } = await query
  if (error) throw error
  return data
}

export function readAreas(client) {
  return unwrap(client.from('delivery_areas').select('id,name,fee_cents,available').order('name'))
}

export function saveArea(client, id, fields) {
  const table = client.from('delivery_areas')
  const query = id ? table.update(fields).eq('id', id) : table.insert(fields)
  return unwrap(query.select('id,name,fee_cents,available').single())
}

export async function readSettings(client) {
  const [store, pix] = await Promise.all([
    unwrap(client.from('store_settings').select('id,is_open').single()),
    unwrap(client.from('payment_settings').select('id,pix_key_type,pix_key,receiver_name,receiver_city').single()),
  ])
  return { store, pix }
}

export async function saveStoreState(client, id, open) {
  if (open) {
    const isOpen = await unwrap(client.rpc('set_store_open', { p_open: true }))
    return { id, is_open: isOpen }
  }
  return unwrap(client.from('store_settings').update({ is_open: false }).eq('id', id).select('id,is_open').single())
}

export function savePixSettings(client, id, fields) {
  return unwrap(client.from('payment_settings').update(fields).eq('id', id)
    .select('id,pix_key_type,pix_key,receiver_name,receiver_city').single())
}
