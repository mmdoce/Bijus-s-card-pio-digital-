import { useState } from 'react'
import { NavLink, Navigate, useNavigate, useSearchParams } from 'react-router'
import { beijo } from '../../assets/mascote'
import { ActionLink, Button, EmptyState, FormField, Notice, PageHeading } from '../../components/ui'
import { brazilianPhone, customerFields } from '../../lib/orders'
import { useDemoStore } from '../../mocks/DemoStore'
import { OrderCard } from '../orders/OrderPages'
import { CustomerFields } from './CustomerFields'

function validate(fields) {
  if (!fields.name || !brazilianPhone(fields.phone)) throw new Error('Informe seu nome e um WhatsApp válido com DDD.')
  if ([fields.district, fields.street, fields.streetNumber, fields.complement, fields.reference].some(Boolean)
    && !(fields.district && fields.street && fields.streetNumber)) throw new Error('Preencha bairro, rua e número para salvar o endereço.')
}

export function AuthPage({ title }) {
  const { authenticate } = useDemoStore()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const register = title === 'Criar conta'
  const recovery = title === 'Recuperar senha'
  const checkout = params.get('voltar') === 'checkout'
  const suffix = checkout ? '?voltar=checkout' : ''

  async function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setError('')
    setBusy(true)
    try {
      const fields = register ? customerFields(data) : null
      if (fields) validate(fields)
      await authenticate({ email: data.get('email').trim().toLowerCase(), password: data.get('password'), fields })
      navigate(checkout ? '/checkout' : '/perfil', { replace: true })
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="narrow">
    <PageHeading title={title} />
    <div className="panel stack">
      <Notice>{recovery ? 'A recuperação por e-mail depende do Supabase Auth.' : 'Conta demonstrativa temporária. Use dados fictícios.'}</Notice>
      {!recovery && <form className="stack" onSubmit={submit}>
        {register && <CustomerFields address={false} />}
        <FormField label="E-mail"><input name="email" type="email" required maxLength={150} autoComplete="email" /></FormField>
        <FormField label="Senha"><input name="password" type="password" required minLength={register ? 8 : undefined} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} /></FormField>
        {error && <p className="notice" role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>{title}</Button>
      </form>}
      <div className="actions">
        {title !== 'Entrar' && <ActionLink to={'/login' + suffix} secondary>Entrar</ActionLink>}
        {!register && <ActionLink to={'/cadastro' + suffix} secondary>Criar conta</ActionLink>}
        {!recovery && <ActionLink to={'/recuperar-senha' + suffix} secondary>Recuperar senha</ActionLink>}
        {checkout && <ActionLink to="/checkout" secondary>Voltar ao checkout</ActionLink>}
      </div>
    </div>
  </section>
}

export function ProfilePage({ section = 'profile' }) {
  const { profile, myOrders, balance, areas, saveProfile, logout } = useDemoStore()
  const [feedback, setFeedback] = useState('')
  if (!profile) return <Navigate to="/login" replace />
  const titles = { profile: 'Minha conta', orders: 'Meus pedidos', loyalty: 'Fidelidade' }
  const rewards = Math.floor(balance / 9)
  const stamps = balance % 9

  function submit(event) {
    event.preventDefault()
    try {
      const fields = customerFields(new FormData(event.currentTarget))
      validate(fields)
      saveProfile(fields)
      setFeedback('Dados salvos nesta demonstração.')
    } catch (failure) {
      setFeedback(failure.message)
    }
  }

  return <section>
    <PageHeading title={titles[section]}>Perfil demonstrativo</PageHeading>
    <nav className="profile-nav" aria-label="Área do cliente">
      <NavLink to="/perfil" end>Dados e endereços</NavLink><NavLink to="/perfil/pedidos">Histórico</NavLink><NavLink to="/perfil/fidelidade">Fidelidade</NavLink>
      <Button secondary onClick={logout}>Sair da conta</Button>
    </nav>
    {section === 'profile' && <form key={profile.id} className="panel stack" onSubmit={submit} onChange={() => setFeedback('')}>
      <p>{profile.email}</p>
      <CustomerFields profile={profile} areas={areas.filter(area => area.active !== false || area.id === profile.district)} />
      <Button type="submit">Salvar alterações</Button>
      {feedback && <p className="notice" role="status">{feedback}</p>}
    </form>}
    {section === 'orders' && (myOrders.length ? <div className="stack">{myOrders.map(order => <OrderCard key={order.id} order={order} to={'/pedido/' + order.token} />)}</div>
      : <EmptyState title="Nenhum pedido na sua conta"><ActionLink to="/">Ver cardápio</ActionLink></EmptyState>)}
    {section === 'loyalty' && <div className="panel loyalty-card">
      <div className="stack">
        <h2>Cartão de carimbos</h2>
        <p><strong>{stamps} de 9</strong> carimbos no próximo cartão</p>
        {rewards > 0 && <p>Recompensas disponíveis de 300 ml <strong>{rewards}</strong></p>}
        <ol className="stamps" aria-label="Carimbos de fidelidade">
          {Array.from({ length: 9 }, (_, index) => <li key={index} className={index < stamps ? 'earned' : ''} aria-label={'Carimbo ' + (index + 1) + (index < stamps ? ' recebido' : ' pendente')}>{index + 1}</li>)}
        </ol>
        <p>Cada unidade paga de açaí vale um carimbo. Com nove, ganhe uma garrafa de açaí de <strong>300 ml</strong> na próxima compra elegível.</p>
      </div>
      <img src={beijo} alt="" width="190" loading="lazy" />
    </div>}
  </section>
}
