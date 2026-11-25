import { useState } from 'react'
import { ActionLink, Button, EmptyState, FormField, LoadingState, Notice, PageHeading } from '../../components/ui'
import { money } from '../../lib/money'
import { paymentLabel, quoteOrder } from '../../lib/orders'
import { useAuth } from '../account/AuthProvider'
import { CustomerFields } from '../account/CustomerFields'
import { useCustomerData } from '../account/useCustomerData'
import { useCart } from '../cart/CartProvider'
import { useStore } from '../catalog/StoreProvider'

export function CheckoutPage() {
  const { items } = useCart()
  const { areas, settings, loading, error } = useStore()
  const { user } = useAuth()
  const { profile, address } = useCustomerData()
  const [method, setMethod] = useState('pickup')
  const [payment, setPayment] = useState('pix')
  const [selectedDistrict, setDistrictId] = useState(null)
  const districtId = selectedDistrict ?? address?.delivery_area_id ?? ''
  const activeAreas = areas.filter(area => area.active !== false)
  const delivery = method === 'delivery'
  const fee = delivery ? activeAreas.find(area => area.id === districtId)?.fee : 0
  const quote = quoteOrder(items, fee ?? 0, 0)
  const canOrder = settings.open && items.every(({ product }) => product.available && product.active !== false)
  const guestLinks = !user && <div className="actions"><ActionLink to="/cadastro?voltar=checkout" secondary>Criar conta</ActionLink><ActionLink to="/login?voltar=checkout" secondary>Entrar</ActionLink></div>

  return <section>
    <PageHeading title="Checkout" />
    {loading ? <LoadingState>Consultando a loja…</LoadingState> : error ? <EmptyState title="Não foi possível consultar o checkout">
      <ActionLink to="/carrinho">Voltar ao carrinho</ActionLink>
    </EmptyState> : !items.length || !canOrder ? <EmptyState title={!items.length ? 'Seu carrinho está vazio' : 'Checkout indisponível'}>
      {!settings.open && <Notice>A loja está fechada.</Notice>}
      <ActionLink to="/carrinho">Voltar ao carrinho</ActionLink>
      {guestLinks}
    </EmptyState> : <form className="checkout-grid" onSubmit={event => event.preventDefault()}>
      <div className="panel stack">
        <Notice>O envio de pedidos e os pagamentos ficarão disponíveis em uma próxima etapa.</Notice>
        {!user && <aside className="notice stack-small">
          <p>Você pode continuar como visitante ou entrar para usar os dados da sua conta.</p>
          {guestLinks}
        </aside>}
        <fieldset className="stack">
          <legend>Como quer receber?</legend>
          <label className="choice"><input type="radio" name="method" checked={!delivery} onChange={() => setMethod('pickup')} /> Retirada gratuita</label>
          <label className="choice"><input type="radio" name="method" checked={delivery} onChange={() => setMethod('delivery')} /> Entrega</label>
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
        <p className="total"><span>Subtotal</span><strong>{money(quote.productsTotal)}</strong></p>
        {quote.reward && <p className="total"><span>Recompensa de 300 ml</span><strong>−{money(quote.discount)}</strong></p>}
        <p className="total"><span>Entrega</span><strong>{fee === undefined ? 'Selecione o bairro' : money(fee)}</strong></p>
        {fee !== undefined && <p className="total checkout-total"><span>Total</span><strong>{money(quote.total)}</strong></p>}
        {fee === undefined || quote.total > 0 ? <fieldset className="stack">
          <legend>Forma de pagamento</legend>
          <label className="choice"><input type="radio" name="payment" checked={payment === 'pix'} onChange={() => setPayment('pix')} /> Pix antecipado</label>
          <label className="choice"><input type="radio" name="payment" checked={payment === 'receipt'} onChange={() => setPayment('receipt')} /> {paymentLabel('receipt', method)}</label>
        </fieldset> : <p>Sem valor a pagar.</p>}
        <Button type="submit" disabled>Fazer pedido</Button>
      </aside>
    </form>}
  </section>
}
