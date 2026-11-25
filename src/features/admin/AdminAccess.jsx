import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import { beijo } from '../../assets/mascote'
import { ActionLink, Button, FormField, LoadingState, Notice, PageHeading } from '../../components/ui'
import { authClient, authError, emailRedirect, verifyAdministrator } from '../../lib/auth'
import { useAuth } from '../account/AuthProvider'

function useAdminStatus(scope) {
  const { session, loading, recovery } = useAuth()
  const [result, setResult] = useState(null)
  const [revision, setRevision] = useState(0)
  const recheck = () => setRevision(value => value + 1)

  useEffect(() => {
    if (!session || recovery) return
    let active = true
    verifyAdministrator(session).then(
      granted => { if (active) setResult({ session, scope, revision, status: granted ? 'allowed' : 'denied' }) },
      () => { if (active) setResult({ session, scope, revision, status: 'error' }) },
    )
    return () => { active = false }
  }, [session, recovery, scope, revision])

  useEffect(() => {
    if (!session || recovery) return
    window.addEventListener('focus', recheck)
    return () => window.removeEventListener('focus', recheck)
  }, [session, recovery])

  const current = result?.session === session && result?.scope === scope && result?.revision === revision
  const background = result?.session === session && result?.scope === scope && result?.status === 'allowed'
  return {
    status: loading ? 'checking' : recovery ? 'recovery' : !session ? 'signed-out' : current ? result.status : background ? 'allowed' : 'checking',
    recheck,
  }
}

export function AdminAccess() {
  const { pathname } = useLocation()
  const { status, recheck } = useAdminStatus(pathname)
  if (status === 'checking') return <LoadingState>Verificando acesso ao painel…</LoadingState>
  if (status === 'recovery') return <Navigate replace to="/admin/redefinir-senha" />
  if (status === 'error') return <main className="shell content stack">
    <Notice>Não foi possível verificar o acesso administrativo.</Notice>
    <Button onClick={recheck}>Tentar novamente</Button>
    <ActionLink to="/admin/login" secondary>Voltar ao login</ActionLink>
  </main>
  return status === 'allowed' ? <Outlet /> : <Navigate replace to="/admin/login" />
}

export function AdminLogin() {
  const [params] = useSearchParams()
  const { status, recheck } = useAdminStatus('login')
  const [visible, setVisible] = useState(false)
  const [recovery, setRecovery] = useState(() => params.get('recuperar') === '1')
  const [feedback, setFeedback] = useState(null)
  const [busy, setBusy] = useState(false)
  if (status === 'recovery') return <Navigate replace to="/admin/redefinir-senha" />
  if (status === 'allowed' && !recovery) return <Navigate replace to="/admin" />

  async function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = data.get('email').trim().toLowerCase()
    setBusy(true)
    setFeedback(null)
    try {
      const { auth } = authClient()
      if (recovery) {
        const { error } = await auth.resetPasswordForEmail(email, { redirectTo: emailRedirect('/admin/redefinir-senha') })
        if (error) throw error
        setFeedback({ text: 'Se houver uma conta para esse e-mail, você receberá um link para redefinir a senha.' })
      } else {
        const { error } = await auth.signInWithPassword({ email, password: data.get('password') })
        if (error) throw error
      }
    } catch (error) {
      setFeedback({ error: true, text: authError(error) })
    } finally {
      setBusy(false)
    }
  }

  return <section className="narrow">
    <PageHeading title={recovery ? 'Recuperar senha' : 'Acesso administrativo'} />
    <form className="panel stack" onSubmit={submit} onChange={() => setFeedback(null)}>
      <img className="admin-avatar" src={beijo} alt="Biju, mascote da marca" width="112" />
      <FormField label="E-mail"><input type="email" name="email" required autoComplete="username" /></FormField>
      {!recovery && <>
        <FormField label="Senha"><input name="password" type={visible ? 'text' : 'password'} required autoComplete="current-password" /></FormField>
        <Button secondary onClick={() => setVisible(value => !value)}>{visible ? 'Ocultar senha' : 'Mostrar senha'}</Button>
        {status === 'checking' && <LoadingState>Verificando acesso ao painel…</LoadingState>}
        {status === 'denied' && <p role="alert" className="notice">Sua conta não tem acesso administrativo.</p>}
        {status === 'error' && <div className="stack">
          <Notice>Não foi possível verificar o acesso administrativo.</Notice>
          <Button secondary onClick={recheck}>Verificar novamente</Button>
        </div>}
      </>}
      {feedback && <p role={feedback.error ? 'alert' : 'status'} className="notice">{feedback.text}</p>}
      <Button type="submit" disabled={busy || (!recovery && status === 'checking')}>{recovery ? 'Recuperar acesso' : 'Entrar no painel'}</Button>
      <Button secondary onClick={() => { setRecovery(value => !value); setFeedback(null) }}>{recovery ? 'Voltar ao login' : 'Recuperar senha'}</Button>
    </form>
  </section>
}
