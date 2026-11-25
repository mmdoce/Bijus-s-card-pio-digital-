import { supabase, supabaseForSession } from './supabase.js'

const authMessages = {
  invalid_credentials: 'E-mail ou senha inválidos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
  email_exists: 'Já existe uma conta para este e-mail.',
  user_already_exists: 'Já existe uma conta para este e-mail.',
  weak_password: 'Escolha uma senha mais forte.',
  same_password: 'Escolha uma senha diferente da atual.',
  over_email_send_rate_limit: 'Aguarde alguns minutos antes de pedir outro e-mail.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
  otp_expired: 'Este link expirou. Solicite um novo e-mail.',
  flow_state_not_found: 'Abra o link no mesmo navegador em que solicitou o e-mail.',
  bad_code_verifier: 'Abra o link no mesmo navegador em que solicitou o e-mail.',
}

export function authError(error) {
  if (/^invalid login credentials$/i.test(error?.message ?? '')) return authMessages.invalid_credentials
  if (/^email not confirmed$/i.test(error?.message ?? '')) return authMessages.email_not_confirmed
  if (error?.code === 'auth_unavailable') return error.message
  return authMessages[error?.code] ?? (error?.status === 429
    ? authMessages.over_request_rate_limit
    : 'Não foi possível concluir a autenticação. Tente novamente.')
}

export function authClient() {
  if (!supabase) throw Object.assign(new Error('O acesso à conta está indisponível. Confira a configuração do Supabase.'), { code: 'auth_unavailable' })
  return supabase
}

export async function verifyAdministrator(session, client = authClient(), dataClient = supabaseForSession(session.access_token)) {
  const { data: identity, error: identityError } = await client.auth.getUser(session.access_token)
  if (identityError) throw identityError
  if (!identity.user || identity.user.id !== session.user.id) return false
  const { data, error } = await dataClient.rpc('is_admin')
  if (error) throw error
  return data === true
}

export function emailRedirect(path, checkout = false) {
  const url = new URL(path, window.location.origin)
  if (checkout) url.searchParams.set('voltar', 'checkout')
  return url.href
}
