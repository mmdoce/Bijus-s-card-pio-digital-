import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authError, verifyAdministrator } from '../src/lib/auth.js'
import { contactDetails } from '../src/features/account/customerData.js'

test('Autorização administrativa verifica o token e exige resposta afirmativa do backend', async () => {
  const session = { access_token: 'token-teste', user: { id: 'conta' } }
  let granted = true
  const auth = { auth: { getUser: async token => {
    assert.equal(token, session.access_token)
    return { data: { user: { id: 'conta' } } }
  } } }
  const api = { rpc: async name => {
    assert.equal(name, 'is_admin')
    return { data: granted }
  } }
  assert.equal(await verifyAdministrator(session, auth, api), true)
  granted = false
  assert.equal(await verifyAdministrator(session, auth, api), false)
  granted = 'true'
  assert.equal(await verifyAdministrator(session, auth, api), false)
})

test('Autorização para sessão divergente ou erro de backend falha fechada', async () => {
  const session = { access_token: 'token-teste', user: { id: 'conta' } }
  const mismatched = { auth: { getUser: async () => ({ data: { user: { id: 'outra-conta' } } }) } }
  assert.equal(await verifyAdministrator(session, mismatched, { rpc: () => assert.fail('RPC indevida') }), false)
  const auth = { auth: { getUser: async () => ({ data: { user: { id: 'conta' } } }) } }
  await assert.rejects(() => verifyAdministrator(session, auth, { rpc: async () => ({ error: new Error('indisponível') }) }), /indisponível/)
})

test('Contato usa o WhatsApp normalizado e erros de Auth têm mensagens em português', () => {
  assert.deepEqual(contactDetails({ name: ' Cliente ', phone: '(11) 99000-0000' }), { name: 'Cliente', phone: '+5511990000000' })
  assert.throws(() => contactDetails({ name: 'Cliente', phone: '123' }), /WhatsApp válido/)
  assert.equal(authError({ code: 'email_not_confirmed' }), 'Confirme seu e-mail antes de entrar.')
  assert.equal(authError(new Error('Invalid login credentials')), 'E-mail ou senha inválidos.')
})
