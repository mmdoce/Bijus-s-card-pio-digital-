import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { paoDeMel } from '../../assets/mascote'
import { ActionLink, Button, EmptyState, Notice, QuantityControl, StatusBadge } from '../../components/ui'
import { money } from '../../lib/money'
import { useDemoStore } from '../../mocks/DemoStore'
import { useCart } from '../cart/CartProvider'

export function CategoryFilter({ categories, selected, onSelect }) {
  return <div className="filters" role="group" aria-label="Filtrar por categoria">
    {[{ id: '', name: 'Todos' }, ...categories].map(option => (
      <button key={option.id} type="button" aria-pressed={selected === option.id} onClick={() => onSelect(option.id)}>{option.name}</button>
    ))}
  </div>
}

export function ProductMedia({ product }) {
  return product.image
    ? <img className="product-image" src={product.image} alt={product.name} loading="lazy" />
    : <img className="product-image photo-placeholder" src={paoDeMel} alt="Imagem padrão da Biju’s Doce" loading="lazy" />
}

export function ProductCard({ product, open, onAdd }) {
  return <article className="panel product">
    <Link className="media-link" to={'/produto/' + product.id} aria-label={'Ver detalhes de ' + product.name}><ProductMedia product={product} /></Link>
    <div className="product-body">
      <h3><Link to={'/produto/' + product.id}>{product.name}</Link></h3>
      <p>{product.description}</p>
      <div className="product-actions">
        <strong>{money(product.price)}</strong>
        <Button disabled={!open || !product.available} aria-label={open && product.available ? 'Adicionar ' + product.name : undefined} onClick={() => onAdd(product.id, 1)}>
          {product.available ? 'Adicionar' : 'Esgotado'}
        </Button>
      </div>
    </div>
  </article>
}

export function CatalogPage() {
  const [category, setCategory] = useState('')
  const { catalog, groups, settings } = useDemoStore()
  const { addProduct } = useCart()
  const visible = catalog.filter(product => product.active !== false && (!category || product.category === category))
  return <>
    <section className="menu-hero">
      <div className="hero-copy">
        <StatusBadge tone={settings.open ? 'positive' : 'warning'}>{settings.open ? 'Loja aberta' : 'Loja fechada'}</StatusBadge>
        <h1>Cardápio Biju’s Doce</h1>
        <p>Escolha seu açaí na garrafa ou um doce para entrega ou retirada.</p>
        <a className="button" href="#produtos">Ver produtos</a>
      </div>
      <img src={paoDeMel} alt="Biju segurando um pão de mel" width="1280" height="1229" fetchPriority="high" />
    </section>
    {!settings.open && <Notice>A loja está fechada. O cardápio continua disponível para consulta.</Notice>}
    <section id="produtos" className="catalog-section" aria-labelledby="catalog-title">
      <h2 id="catalog-title">Escolha seu pedido</h2>
      <CategoryFilter categories={groups} selected={category} onSelect={setCategory} />
      {visible.length ? <div className="catalog-grid">
        {visible.map(product => <ProductCard key={product.id} product={product} open={settings.open} onAdd={addProduct} />)}
      </div> : <EmptyState title="Nenhum produto nesta categoria" />}
    </section>
  </>
}

export function ProductPage() {
  const { id } = useParams()
  const { catalog, settings } = useDemoStore()
  const product = catalog.find(item => item.id === id && item.active !== false)
  return product ? <ProductDetail key={id} product={product} open={settings.open} /> : <EmptyState title="Produto indisponível"><ActionLink to="/">Voltar ao cardápio</ActionLink></EmptyState>
}

function ProductDetail({ product, open }) {
  const [quantity, setQuantity] = useState(1)
  const { addProduct } = useCart()
  return <div className="stack">
    <ActionLink to="/" secondary>Voltar ao cardápio</ActionLink>
    <article className="panel product-detail">
      <ProductMedia product={product} />
      <div className="stack">
        <h1>{product.name}</h1>
        <p>{product.description}</p>
        <p className="price">{money(product.price)} por unidade</p>
        <QuantityControl quantity={quantity} onChange={delta => setQuantity(value => Math.max(1, value + delta))} label={product.name} />
        <Button disabled={!open || !product.available} onClick={() => addProduct(product.id, quantity)}>
          {!open ? 'Loja fechada' : product.available ? 'Adicionar ao carrinho' : 'Esgotado'}
        </Button>
      </div>
    </article>
  </div>
}
