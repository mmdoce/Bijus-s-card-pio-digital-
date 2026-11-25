import { useState } from 'react'
import { NavLink, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { beijo } from '../../assets/mascote'
import { ActionLink, Button, EmptyState, FormField, LoadingState, Notice, PageHeading } from '../../components/ui'
import { authClient, authError, emailRedirect } from '../../lib/auth'
import { customerFields } from '../../lib/orders'
import { useStore } from '../catalog/StoreProvider'
import { useAuth } from './AuthProvider'
import { CustomerFields } from './CustomerFields'
import { contactDetails, saveCustomerAddress, saveCustomerContact } from './customerData'
import { useCustomerData } from './useCustomerData'

export function AuthPage({ title }) {
  const { recovery: resetting } = useAuth()
  const [params] = useSearchParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const [feedback, setFeedback] = useState(null)
  const [busy, setBusy] = useState(false)
  const register = title === 'Criar conta'
  const recovery = title === 'Recuperar senha'
  const checkout = params.get('voltar') === 'checkout'
  const suffix = checkout ? '?voltar=checkout' : ''
  const returnTo = ['/perfil', '/perfil/pedidos', '/perfil/fidelidade'].includes(state?.returnTo) ? state.returnTo : '/perfil'

  async function submit(event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const email = fields.get('email').trim().toLowerCase()
    const password = fields.get('password')
    let contact
    if (register) {
      try {
        contact = contactDetails(customerFields(fields))
      } catch (error) {
        setFeedback({ error: true, text: error.message })
        return
      }
    }
    setBusy(true)
    setFeedback(null)
    try {
      const { auth } = authClient()
      if (recovery) {
        const { error } = await auth.resetPasswordForEmail(email, { redirectTo: emailRedirect('/redefinir-senha', checkout) })
        if (error) throw error
        setFeedback({ text: 'Se houver uma conta para esse e-mail, você receberá um link para redefinir a senha.' })
        return
      }
      if (register) {
        const { data, error } = await auth.signUp({
          email, password, options: { data: contact, emailRedirectTo: emailRedirect('/confirmar-email', checkout) },
        })
        if (error) throw error
        if (!data.session) {
          setFeedback({ text: 'Confira sua caixa de entrada para confirmar o e-mail. Abra o link neste navegador.' })
          return
        }
      } else {
        const { error } = await auth.signInWithPassword({ email, password })
        if (error) throw error
      }
      navigate(checkout ? '/checkout' : returnTo, { replace: true })
    } catch (error) {
      setFeedback({ error: true, text: authError(error) })
    } finally {
      setBusy(false)
    }
  }

  if (resetting) return <Navigate to="/redefinir-senha" replace />
  return <section className="narrow">
    <PageHeading title={title} />
    <div className="panel stack">
      {recovery && <Notice>Informe o e-mail da sua conta para receber um link de redefinição.</Notice>}
      <form className="stack" onSubmit={submit}>
        {register && <CustomerFields address={false} />}
        <FormField label="E-mail"><input name="email" type="email" required maxLength={150} autoComplete="email" /></FormField>
        {!recovery && <FormField label="Senha"><input name="password" type="password" required minLength={register ? 8 : undefined} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} /></FormField>}
        {feedback && <p className="notice" role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Aguarde…' : title}</Button>
      </form>
      <div className="actions">
        {title !== 'Entrar' && <ActionLink to={'/login' + suffix} secondary>Entrar</ActionLink>}
        {!register && <ActionLink to={'/cadastro' + suffix} secondary>Criar conta</ActionLink>}
        {!recovery && <ActionLink to={'/recuperar-senha' + suffix} secondary>Recuperar senha</ActionLink>}
        {checkout && <ActionLink to="/checkout" secondary>Voltar ao checkout</ActionLink>}
      </div>
    </div>
  </section>
}

export function ConfirmEmailPage() {
  const { user, loading, linkError } = useAuth()
  const [params] = useSearchParams()
  const customer = useCustomerData()
  const checkout = params.get('voltar') === 'checkout'
  if (loading || customer.loading) return <LoadingState>Confirmando seu e-mail…</LoadingState>
  if (user && !linkError) return <Navigate to={checkout ? '/checkout' : '/perfil'} replace />
  return <section className="narrow">
    <PageHeading title="Confirmação de e-mail" />
    <EmptyState title="Confirme o e-mail pelo link recebido">
      <Notice>{linkError ? authError({ code: linkError }) : 'Abra o link de confirmação no mesmo navegador em que iniciou o cadastro.'}</Notice>
      <ActionLink to={checkout ? '/login?voltar=checkout' : '/login'}>Ir para o login</ActionLink>
    </EmptyState>
  </section>
}

export function PasswordResetPage({ admin = false }) {
  const { loading, recovery, user, linkError, finishRecovery } = useAuth()
  const [params] = useSearchParams()
  const [status, setStatus] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const suffix = params.get('voltar') === 'checkout' ? '?voltar=checkout' : ''
  const login = admin ? '/admin/login' : '/login' + suffix
  if (loading) return <LoadingState>Verificando o link…</LoadingState>

  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = form.get('password')
    if (password !== form.get('confirmation')) {
      setStatus('As senhas precisam ser iguais.')
      return
    }
    setBusy(true)
    setStatus('')
    try {
      const { auth } = authClient()
      const { error } = await auth.updateUser({ password })
      if (error) throw error
      setSaved(true)
      const signOut = await auth.signOut({ scope: 'local' })
      if (signOut.error) {
        setStatus('A senha foi salva, mas não foi possível encerrar a sessão. Entre novamente com a nova senha.')
        return
      }
      finishRecovery()
    } catch (error) {
      setStatus(authError(error))
    } finally {
      setBusy(false)
    }
  }

  return <section className="narrow">
    <PageHeading title="Redefinir senha" />
    <div className="panel stack">
      {saved ? <><Notice>{status || 'Senha atualizada. Entre novamente com a nova senha.'}</Notice><ActionLink to={login}>Ir para o login</ActionLink></>
        : recovery && user && !linkError ? <form className="stack" onSubmit={submit}>
          <FormField label="Nova senha"><input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></FormField>
          <FormField label="Confirme a nova senha"><input name="confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={128} /></FormField>
          {status && <p role="alert" className="notice">{status}</p>}
          <Button type="submit" disabled={busy}>Salvar nova senha</Button>
        </form> : <>
          <Notice>{linkError ? authError({ code: linkError }) : 'Abra o link recebido no mesmo navegador em que solicitou a recuperação.'}</Notice>
          <ActionLink to={admin ? '/admin/login?recuperar=1' : '/recuperar-senha' + suffix}>Solicitar novo link</ActionLink>
        </>}
    </div>
  </section>
}

export function ProfilePage({ section = 'profile' }) {
  const { user } = useAuth()
  const customer = useCustomerData()
  const store = useStore()
  const [feedback, setFeedback] = useState(null)
  const [saving, setSaving] = useState(false)
  const titles = { profile: 'Minha conta', orders: 'Meus pedidos', loyalty: 'Fidelidade' }
  const address = customer.address
  const areas = store.areas
  const availableAddress = !address || areas.some(area => area.id === address.delivery_area_id)
  const fields = {
    ...customer.profile, district: address?.delivery_area_id, street: address?.street,
    streetNumber: address?.street_number, complement: address?.complement, reference: address?.reference,
  }

  async function submit(event, kind) {
    event.preventDefault()
    const values = customerFields(new FormData(event.currentTarget))
    setFeedback(null)
    if (kind === 'contact') {
      try { contactDetails(values) } catch (error) {
        setFeedback({ kind, text: error.message, error: true })
        return
      }
    }
    setSaving(true)
    try {
      if (kind === 'contact') await saveCustomerContact(user.id, values, customer.client)
      else await saveCustomerAddress({ userId: user.id, addressId: address?.id, fields: values }, customer.client)
      customer.reload()
      setFeedback({ kind, text: kind === 'contact' ? 'Dados salvos.' : 'Endereço salvo.' })
    } catch {
      setFeedback({ kind, text: 'Não foi possível salvar. Tente novamente.', error: true })
    } finally {
      setSaving(false)
    }
  }

  async function logout() {
    try {
      const { error } = await authClient().auth.signOut({ scope: 'local' })
      if (error) throw error
    } catch (error) {
      setFeedback({ kind: 'logout', text: authError(error), error: true })
    }
  }

  function message(kind) {
    return feedback?.kind === kind && <p className="notice" role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>
  }

  return <section>
    <PageHeading title={titles[section]} />
    <nav className="profile-nav" aria-label="Área do cliente">
      <NavLink to="/perfil" end>Dados e endereços</NavLink><NavLink to="/perfil/pedidos">Histórico</NavLink><NavLink to="/perfil/fidelidade">Fidelidade</NavLink>
      <Button secondary onClick={logout}>Sair da conta</Button>
    </nav>
    {message('logout')}
    {section === 'profile' && (customer.loading ? <LoadingState>Carregando seus dados…</LoadingState> : customer.error ? <EmptyState title="Não foi possível consultar sua conta">
      <Button secondary onClick={customer.reload}>Tentar novamente</Button>
    </EmptyState> : <div className="panel stack" key={user.id}>
      <p>{user.email}</p>
      <form className="stack" onSubmit={event => submit(event, 'contact')}>
        <CustomerFields profile={fields} address={false} />
        <Button type="submit" disabled={saving}>Salvar dados</Button>
        {message('contact')}
      </form>
      <form className="stack" onSubmit={event => submit(event, 'address')}>
        {store.loading ? <LoadingState>Carregando bairros…</LoadingState> : store.error ? <Notice>Não foi possível consultar os bairros.</Notice>
          : !areas.length && <Notice>Nenhum bairro disponível para cadastrar um endereço.</Notice>}
        {!availableAddress && <Notice>O bairro cadastrado está indisponível. Selecione outro para salvar.</Notice>}
        <CustomerFields key={address?.id ?? 'new'} contact={false} profile={availableAddress ? fields : { ...fields, district: '' }} areas={areas} requiredAddress />
        <Button type="submit" disabled={saving || !customer.profile || !areas.length}>Salvar endereço</Button>
        {!customer.profile && <p>Salve seus dados de contato para cadastrar um endereço.</p>}
        {message('address')}
      </form>
    </div>)}
    {section === 'orders' && <EmptyState title="Histórico indisponível nesta etapa"><ActionLink to="/">Ver cardápio</ActionLink></EmptyState>}
    {section === 'loyalty' && <EmptyState title="Cartão de carimbos indisponível nesta etapa" image={beijo}>
      <p>Cada unidade paga de açaí vale um carimbo. Com nove, ganhe uma garrafa de 300 ml na próxima compra elegível.</p>
    </EmptyState>}
  </section>
}
