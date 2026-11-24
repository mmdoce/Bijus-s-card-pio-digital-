import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ActionLink, Button, EmptyState, FormField, Notice, PageHeading } from '../../components/ui'
import { money } from '../../lib/money'
import { customerFields, paymentLabel, quoteOrder } from '../../lib/orders'
import { useDemoStore } from '../../mocks/DemoStore'
import { CustomerFields } from '../account/CustomerFields'
import { useCart } from '../cart/CartProvider'

export function CheckoutPage() {
  const { items, clear } = useCart()
  const { areas, settings, profile, balance, placeOrder } = useDemoStore()
  const [method, setMethod] = useState('pickup')
  const [payment, setPayment] = useState('pix')
  const [districtId, setDistrictId] = useState(profile?.district ?? '')
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const activeAreas = areas.filter(area => area.active !== false)
  const delivery = method === 'delivery'
  const fee = delivery ? activeAreas.find(area => area.id === districtId)?.fee : 0
  const quote = quoteOrder(items, fee ?? 0, balance)
  const canOrder = settings.open && items.every(({ product }) => product.available && product.active !== false)

  function submit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    try {
      const order = placeOrder({ items, method, payment, customer: customerFields(data), notes: data.get('notes').trim() })
      clear()
      navigate((order.expiresAt ? '/pagamento/' : '/pedido/') + order.token, { replace: true })
    } catch (failure) {
      setError(failure.message)
    }
  }

  return <section>
    <PageHeading title="Checkout" />
    {!items.length || !canOrder ? <EmptyState title={!items.length ? 'Seu carrinho está vazio' : 'Checkout indisponível'}>
      <ActionLink to="/carrinho">Voltar ao carrinho</ActionLink>
    </EmptyState> : <form className="checkout-grid" onSubmit={submit}>
      <div className="panel stack">
        <Notice>Demonstração local. Use dados fictícios. Nenhuma cobrança real será gerada.</Notice>
        {!profile && <aside className="notice stack-small">
          <p>Seu próximo açaí pode ser grátis! Crie sua conta, acumule carimbos e ganhe uma garrafa de 300 ml a cada 9 açaís pagos.</p>
          <div className="actions"><ActionLink to="/cadastro?voltar=checkout" secondary>Criar conta</ActionLink><ActionLink to="/login?voltar=checkout" secondary>Entrar</ActionLink></div>
        </aside>}
        <fieldset className="stack">
          <legend>Como quer receber?</legend>
          <label className="choice"><input type="radio" name="method" checked={!delivery} onChange={() => setMethod('pickup')} /> Retirada gratuita</label>
          <label className="choice"><input type="radio" name="method" checked={delivery} onChange={() => setMethod('delivery')} /> Entrega</label>
        </fieldset>
        <h2>Seus dados</h2>
        <CustomerFields profile={profile ?? {}} address={delivery} requiredAddress={delivery} areas={activeAreas} onDistrict={setDistrictId} />
        <FormField label="Observações (opcional)"><textarea name="notes" rows={3} maxLength={500} /></FormField>
      </div>
      <aside className="panel stack checkout-summary">
        <h2>Resumo do pedido</h2>
        <ul className="divided">{items.map(({ product, quantity }) => <li className="line-item" key={product.id}><span>{quantity} × {product.name}</span><strong>{money(product.price * quantity)}</strong></li>)}</ul>
        <p className="total"><span>Subtotal</span><strong>{money(quote.productsTotal)}</strong></p>
        {quote.reward && <p className="total"><span>Recompensa de 300 ml</span><strong>−{money(quote.discount)}</strong></p>}
        <p className="total"><span>Entrega</span><strong>{fee === undefined ? 'Selecione o bairro' : money(fee)}</strong></p>
        {fee !== undefined && <p className="total checkout-total"><span>Total</span><strong>{money(quote.total)}</strong></p>}
        {fee === undefined || quote.total > 0 ? <fieldset className="stack">
          <legend>Forma de pagamento</legend>
          <label className="choice"><input type="radio" name="payment" checked={payment === 'pix'} onChange={() => setPayment('pix')} /> Pix antecipado</label>
          <label className="choice"><input type="radio" name="payment" checked={payment === 'receipt'} onChange={() => setPayment('receipt')} /> {paymentLabel('receipt', method)}</label>
        </fieldset> : <p>Sem valor a pagar.</p>}
        {error && <p className="notice" role="alert">{error}</p>}
        <Button type="submit" disabled={fee === undefined}>Fazer pedido</Button>
      </aside>
    </form>}
  </section>
}
