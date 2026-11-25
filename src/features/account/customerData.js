import { brazilianPhone } from '../../lib/orders.js'

export function contactDetails({ name, phone }) {
  const formatted = brazilianPhone(phone ?? '')
  if (!name?.trim() || name.trim().length > 100 || !formatted) throw new Error('Informe seu nome e um WhatsApp válido com DDD.')
  return { name: name.trim(), phone: '+' + formatted }
}

export async function loadCustomer(user, client) {
  const profileQuery = () => client.from('profiles').select('id,name,phone').eq('id', user.id).maybeSingle()
  const [initial, addressResult] = await Promise.all([
    profileQuery(),
    client.from('addresses').select('id,delivery_area_id,street,street_number,complement,reference')
      .eq('profile_id', user.id).order('created_at').order('id').limit(1).maybeSingle(),
  ])
  if (initial.error || addressResult.error) throw initial.error ?? addressResult.error
  let profile = initial.data
  if (!profile) {
    let contact
    try {
      const metadata = user.user_metadata ?? {}
      if (typeof metadata.name === 'string' && typeof metadata.phone === 'string') contact = contactDetails(metadata)
    } catch {
      // A conta pode ter sido criada sem os dados de contato.
    }
    if (contact) {
      const { error } = await client.from('profiles').insert(contact)
      if (error && error.code !== '23505') throw error
      const response = await profileQuery()
      if (response.error) throw response.error
      profile = response.data
    }
  }
  return { profile, address: addressResult.data }
}

export async function saveCustomerContact(userId, fields, client) {
  const contact = contactDetails(fields)
  const { data, error } = await client.from('profiles').update(contact).eq('id', userId).select('id').maybeSingle()
  if (error) throw error
  if (data) return
  const result = await client.from('profiles').insert(contact)
  if (result.error?.code === '23505') {
    const retry = await client.from('profiles').update(contact).eq('id', userId).select('id').single()
    if (retry.error) throw retry.error
  } else if (result.error) throw result.error
}

export async function saveCustomerAddress({ userId, addressId, fields }, client) {
  if (!fields.district || !fields.street || !fields.streetNumber) throw new Error('Preencha bairro, rua e número para salvar o endereço.')
  const address = {
    delivery_area_id: fields.district, street: fields.street, street_number: fields.streetNumber,
    complement: fields.complement || null, reference: fields.reference || null,
  }
  const query = client.from('addresses')
  const { error } = await (addressId
    ? query.update(address).eq('id', addressId).eq('profile_id', userId).select('id').single()
    : query.insert(address))
  if (error) throw error
}
