import { useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router'
import { beijo } from '../../assets/mascote'
import { Button, FormField, Notice, PageHeading } from '../../components/ui'
import { useDemoStore } from '../../mocks/DemoStore'

export function AdminAccess() {
  const { admin } = useDemoStore()
  return import.meta.env.DEV && admin ? <Outlet /> : <Navigate replace to="/admin/login" />
}

export function AdminLogin() {
  const { admin, adminLogin } = useDemoStore()
  const navigate = useNavigate()
  const [visible, setVisible] = useState(false)
  const [recovery, setRecovery] = useState(false)
  const [feedback, setFeedback] = useState('')
  if (admin) return <Navigate replace to="/admin" />

  function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (recovery) {
      setFeedback('A recuperação por e-mail depende da integração com o Supabase Auth.')
      return
    }
    if (!import.meta.env.DEV) {
      setFeedback('O acesso administrativo depende da integração com o Supabase Auth.')
      return
    }
    if (adminLogin(data.get('email').trim().toLowerCase(), data.get('password'))) navigate('/admin', { replace: true })
    else setFeedback('E-mail ou senha inválidos.')
  }

  return <section className="narrow">
    <PageHeading title={recovery ? 'Recuperar senha' : 'Acesso administrativo'} />
    <form className="panel stack" onSubmit={submit} onChange={() => setFeedback('')}>
      <img className="admin-avatar" src={beijo} alt="Biju, mascote da marca" width="112" />
      <Notice>Protótipo. A autenticação real depende do Supabase Auth.</Notice>
      {import.meta.env.DEV && !recovery && <p>Conta de desenvolvimento <strong>admin@demo.invalid</strong> · Senha <strong>BijuDemo123!</strong></p>}
      <FormField label="E-mail"><input type="email" name="email" required autoComplete="username" /></FormField>
      {!recovery && <>
        <FormField label="Senha"><input name="password" type={visible ? 'text' : 'password'} required autoComplete="current-password" /></FormField>
        <Button secondary onClick={() => setVisible(value => !value)}>{visible ? 'Ocultar senha' : 'Mostrar senha'}</Button>
      </>}
      {feedback && <p role="alert" className="notice">{feedback}</p>}
      <Button type="submit">{recovery ? 'Recuperar acesso' : 'Entrar no painel'}</Button>
      <Button secondary onClick={() => { setRecovery(value => !value); setFeedback('') }}>{recovery ? 'Voltar ao login' : 'Recuperar senha'}</Button>
    </form>
  </section>
}
