import { preparando } from '../../assets/mascote'
import { ActionLink, EmptyState, LoadingState, Notice, PageHeading, QuantityControl } from '../../components/ui'
import { money } from '../../lib/money'
import { useStore } from '../catalog/StoreProvider'
import { useCart } from './CartProvider'

export function CartPage() {
  const { items, subtotal, changeQuantity } = useCart()
  const { settings, loading, error } = useStore()
  const canOrder = settings.open && items.every(({ product }) => product.available && product.active !== false)

  return <section className="narrow">
    <PageHeading title="Seu carrinho" />
    {loading ? <LoadingState>Carregando seu carrinho…</LoadingState> : error ? <Notice>Não foi possível conferir os produtos do carrinho.</Notice>
      : !items.length ? <EmptyState title="Seu carrinho está vazio" image={preparando}><ActionLink to="/">Ver cardápio</ActionLink></EmptyState> : (
      <div className="panel stack">
        <ul className="divided">
          {items.map(({ product, quantity }) => {
            const available = product.available && product.active !== false
            return <li className="line-item" key={product.id}>
              <div><strong>{product.name}</strong><p>{money(product.price * quantity)}</p>{!available && <p>Indisponível</p>}</div>
              <QuantityControl quantity={quantity} minimum={0} maximum={!available || !settings.open ? quantity : undefined}
                label={product.name} onChange={delta => changeQuantity(product.id, delta)} />
            </li>
          })}
        </ul>
        <p className="total"><span>Subtotal</span><strong>{money(subtotal)}</strong></p>
        {canOrder ? <ActionLink to="/checkout">Continuar para checkout</ActionLink>
          : <Notice>{settings.open ? 'Remova os produtos indisponíveis para continuar.' : 'A loja está fechada.'}</Notice>}
      </div>
    )}
  </section>
}
