import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { paoDeMel } from '../../assets/mascote'
import { ActionLink, Button, EmptyState, LoadingState, Notice, QuantityControl, StatusBadge } from '../../components/ui'
import { money } from '../../lib/money'
import { useStore } from './StoreProvider'
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
      {product.size && !product.name.toLowerCase().includes(product.size.toLowerCase()) && <p>{product.size}</p>}
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
  const { catalog, groups, settings, loading, error, reload } = useStore()
  const { addProduct } = useCart()
  const selected = groups.some(group => group.id === category) ? category : ''
  const visible = groups.filter(group => !selected || group.id === selected).map(group => ({
    ...group, products: catalog.filter(product => product.category === group.id),
  })).filter(group => group.products.length)
  return <>
    <section className="menu-hero">
      <div className="hero-copy">
        <StatusBadge tone={settings.open ? 'positive' : 'warning'}>{loading ? 'Consultando a loja' : error ? 'Loja indisponível' : settings.open ? 'Loja aberta' : 'Loja fechada'}</StatusBadge>
        <h1>Cardápio Biju’s Doce</h1>
        <p>Escolha seu açaí na garrafa ou um doce para entrega ou retirada.</p>
        <a className="button" href="#produtos">Ver produtos</a>
      </div>
      <img src={paoDeMel} alt="Biju segurando um pão de mel" width="1280" height="1229" fetchPriority="high" />
    </section>
    {!loading && !error && !settings.open && <Notice>A loja está fechada. O cardápio continua disponível para consulta.</Notice>}
    <section id="produtos" className="catalog-section" aria-labelledby="catalog-title">
      <h2 id="catalog-title">Escolha seu pedido</h2>
      {groups.length > 0 && <CategoryFilter categories={groups} selected={selected} onSelect={setCategory} />}
      {loading ? <LoadingState>Carregando o cardápio…</LoadingState> : error ? <EmptyState title="Não foi possível carregar o cardápio">
        <Button secondary onClick={reload}>Tentar novamente</Button>
      </EmptyState> : visible.length ? visible.map(group => <section className="stack-small" key={group.id} aria-label={group.name}>
        {!selected && <h3>{group.name}</h3>}
        <div className="catalog-grid">
          {group.products.map(product => <ProductCard key={product.id} product={product} open={settings.open} onAdd={addProduct} />)}
        </div>
      </section>) : <EmptyState title={selected ? 'Nenhum produto nesta categoria' : 'Nenhum produto publicado ainda'} />}
    </section>
  </>
}

export function ProductPage() {
  const { id } = useParams()
  const { catalog, settings, loading, error } = useStore()
  const product = catalog.find(item => item.id === id && item.active !== false)
  if (loading) return <LoadingState>Carregando o produto…</LoadingState>
  if (error) return <EmptyState title="Não foi possível consultar o produto"><ActionLink to="/">Voltar ao cardápio</ActionLink></EmptyState>
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
        {product.size && !product.name.toLowerCase().includes(product.size.toLowerCase()) && <p>{product.size}</p>}
        <p className="price">{money(product.price)} por unidade</p>
        <QuantityControl quantity={quantity} onChange={delta => setQuantity(value => Math.max(1, value + delta))} label={product.name} />
        <Button disabled={!open || !product.available} onClick={() => addProduct(product.id, quantity)}>
          {!open ? 'Loja fechada' : product.available ? 'Adicionar ao carrinho' : 'Esgotado'}
        </Button>
      </div>
    </article>
  </div>
}
