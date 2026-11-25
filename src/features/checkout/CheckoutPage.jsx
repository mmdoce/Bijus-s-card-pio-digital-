import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ActionLink, Button, EmptyState, FormField, LoadingState, Notice, PageHeading } from '../../components/ui'
import { money } from '../../lib/money'
import { brazilianPhone, customerFields, deliveryFeeFor, paymentLabel } from '../../lib/orders'
import { checkoutPayload, failedBeforeOrderCreation, finishOrderAttempt, orderItemsInput, placeOrder, prepareOrderAttempt, quoteOrder, readOrderAttempt } from '../../lib/orderData'
import { addGuestPushOrder } from '../notifications/pushData'
import { rememberGuestOrder } from '../../lib/orderTracking'
import { supabase, supabaseForSession } from '../../lib/supabase'
import { useAuth } from '../account/AuthProvider'
import { CustomerFields } from '../account/CustomerFields'
import { useCustomerData } from '../account/useCustomerData'
import { useCart } from '../cart/CartProvider'
import { useStore } from '../catalog/StoreProvider'

export function CheckoutPage() {
  const { items, consume } = useCart()
  const { areas, settings, loading, error } = useStore()
  const { user, session, loading: checkingSession, sessionError } = useAuth()
  const { profile, address } = useCustomerData()
  const [method, setMethod] = useState('pickup')
  const [payment, setPayment] = useState('pix')
  const [selectedDistrict, setDistrictId] = useState(null)
  const districtId = selectedDistrict ?? address?.delivery_area_id ?? ''
  const activeAreas = areas.filter(area => area.available !== false && area.active !== false)
  const delivery = method === 'delivery'
  const fee = deliveryFeeFor(method, districtId, activeAreas)
  const canOrder = settings.open && items.every(({ product }) => product.available && product.active !== false)
  const scope = user?.id ?? 'guest'
  const token = user ? session?.access_token : null
  const client = useMemo(() => supabase && !checkingSession && !sessionError ? supabaseForSession(token) : null, [token, checkingSession, sessionError])
  const navigate = useNavigate()
  const signature = JSON.stringify(orderItemsInput(items))
  const quoteKey = JSON.stringify([method, delivery ? districtId : null, signature])
  const [valuation, setValuation] = useState(null)
  const [revision, setRevision] = useState(0)
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const pending = client ? readOrderAttempt(scope) : null
  const canQuote = Boolean(client && items.length && canOrder && fee !== undefined && !pending)
  const current = valuation?.key === quoteKey && valuation?.client === client && valuation?.revision === revision ? valuation : null
  const quote = current?.data
  const selectedPayment = quote?.pix_available ? payment : 'receipt'

  useEffect(() => {
    if (!canQuote) return
    let active = true
    quoteOrder(client, method, districtId, JSON.parse(signature)).then(
      data => { if (active) setValuation({ data, key: quoteKey, client, revision }) },
      problem => { if (active) setValuation({ error: problem.message, key: quoteKey, client, revision }) },
    )
    return () => { active = false }
  }, [canQuote, client, method, districtId, signature, quoteKey, revision])

  async function submit(event) {
    event?.preventDefault()
    if (lock.current || !client || (!pending && (!quote || !canQuote))) return
    setFailure('')
    lock.current = true
    setBusy(true)
    let attempt
    try {
      if (pending) attempt = pending
      else {
        const fields = new FormData(event.currentTarget)
        const customer = customerFields(fields)
        const phone = brazilianPhone(customer.phone)
        if (!customer.name || !phone) throw new Error('Informe seu nome e um WhatsApp válido com DDD.')
        if (delivery && (customer.district !== districtId || !customer.street || !customer.streetNumber)) throw new Error('Preencha o bairro atendido, a rua e o número.')
        attempt = prepareOrderAttempt(scope, checkoutPayload({
          items: JSON.parse(signature), method, payment: selectedPayment,
          customer: { ...customer, phone: '+' + phone }, notes: fields.get('notes'), total: quote.total_cents,
        }))
      }
      const order = await placeOrder(client, attempt)
      if (scope === 'guest') {
        rememberGuestOrder(order.id, order.tracking_token)
        void addGuestPushOrder(client, order.id, order.tracking_token).catch(() => {})
      }
      finishOrderAttempt(scope)
      consume(attempt.p_items)
      navigate((order.status === 'AGUARDANDO_PAGAMENTO' && order.pix_payload ? '/pagamento/' : '/pedido/') + order.id, { replace: true })
    } catch (problem) {
      if (attempt && failedBeforeOrderCreation(problem)) {
        finishOrderAttempt(scope)
        setRevision(value => value + 1)
      }
      setFailure(problem.message)
    } finally {
      setBusy(false)
      lock.current = false
    }
  }
  const guestLinks = !user && <div className="actions"><ActionLink to="/cadastro?voltar=checkout" secondary>Criar conta</ActionLink><ActionLink to="/login?voltar=checkout" secondary>Entrar</ActionLink></div>

  return <section>
    <PageHeading title="Checkout" />
    {failure && <p className="notice" role="alert">{failure}</p>}
    {pending ? <EmptyState title="Confirme a tentativa anterior">
      <p>Retome para verificar se o pedido foi criado. A mesma tentativa evita duplicação.</p>
      <Button disabled={busy} onClick={() => submit()}>{busy ? 'Verificando…' : 'Retomar pedido'}</Button>
    </EmptyState> : loading || checkingSession ? <LoadingState>Consultando a loja…</LoadingState> : error || sessionError ? <EmptyState title="Não foi possível consultar o checkout">
      <ActionLink to="/carrinho">Voltar ao carrinho</ActionLink>
    </EmptyState> : !items.length || !canOrder ? <EmptyState title={!items.length ? 'Seu carrinho está vazio' : 'Checkout indisponível'}>
      {!settings.open && <Notice>A loja está fechada.</Notice>}
      <ActionLink to="/carrinho">Voltar ao carrinho</ActionLink>
      {guestLinks}
    </EmptyState> : <form className="checkout-grid" onSubmit={submit}>
      <div className="panel stack">
        {!user && <aside className="notice stack-small">
          <p>Você pode continuar como visitante ou entrar para usar os dados da sua conta.</p>
          {guestLinks}
        </aside>}
        <fieldset className="stack">
          <legend>Como quer receber?</legend>
          <label className="choice"><input type="radio" name="method" checked={!delivery} onChange={() => setMethod('pickup')} /> Retirada gratuita</label>
          <label className="choice"><input type="radio" name="method" checked={delivery} disabled={!activeAreas.length} onChange={() => setMethod('delivery')} /> Entrega</label>
          {!activeAreas.length && <p>A entrega está indisponível. A retirada permanece gratuita.</p>}
        </fieldset>
        <h2>Seus dados</h2>
        <CustomerFields key={profile?.id ?? 'guest'} profile={{
          ...profile, district: districtId, street: address?.street, streetNumber: address?.street_number,
          complement: address?.complement, reference: address?.reference,
        }} address={delivery} preserveAddress requiredAddress={delivery} areas={activeAreas} onDistrict={setDistrictId} />
        <FormField label="Observações (opcional)"><textarea name="notes" rows={3} maxLength={500} /></FormField>
      </div>
      <aside className="panel stack checkout-summary">
        <h2>Resumo do pedido</h2>
        <ul className="divided">{items.map(({ product, quantity }) => <li className="line-item" key={product.id}><span>{quantity} × {product.name}</span><strong>{money(product.price * quantity)}</strong></li>)}</ul>
        {canQuote && !current && <LoadingState>Calculando o total no servidor…</LoadingState>}
        {current?.error && <><Notice>{current.error}</Notice><Button secondary onClick={() => setRevision(value => value + 1)}>Recalcular</Button></>}
        {fee === undefined && <Notice>Selecione um bairro atendido para calcular a entrega.</Notice>}
        {quote && <>
          <p className="total"><span>Subtotal</span><strong>{money(quote.products_cents)}</strong></p>
          {quote.discount_cents > 0 && <p className="total"><span>Recompensa de 300 ml</span><strong>−{money(quote.discount_cents)}</strong></p>}
          <p className="total"><span>Entrega</span><strong>{money(quote.delivery_fee_cents)}</strong></p>
          <p className="total checkout-total"><span>Total</span><strong>{money(quote.total_cents)}</strong></p>
        </>}
        {quote && (quote.total_cents > 0 ? <fieldset className="stack">
          <legend>Forma de pagamento</legend>
          {quote.pix_available && <label className="choice"><input type="radio" name="payment" checked={selectedPayment === 'pix'} onChange={() => setPayment('pix')} /> Pix antecipado</label>}
          <label className="choice"><input type="radio" name="payment" checked={selectedPayment === 'receipt'} onChange={() => setPayment('receipt')} /> {paymentLabel('receipt', method)}</label>
        </fieldset> : <p>Sem valor a pagar.</p>)}
        <Button type="submit" disabled={!quote || !canQuote || busy}>{busy ? 'Enviando…' : 'Fazer pedido'}</Button>
      </aside>
    </form>}
  </section>
}
