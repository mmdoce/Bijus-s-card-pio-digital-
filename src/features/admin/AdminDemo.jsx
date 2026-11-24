import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { ActionLink, Button, EmptyState, FormField, Modal, Notice, PageHeading, StatusBadge } from '../../components/ui'
import { money } from '../../lib/money'
import { brazilianPhone, financeLabels, nextStatuses, paymentLabel, statusLabels, whatsappMessage } from '../../lib/orders'
import { useDemoStore } from '../../mocks/DemoStore'
import { ProductMedia } from '../catalog/CatalogPage'
import { OrderCard, OrderStatus, OrderTimeline } from '../orders/OrderPages'
import { PixSettings } from './PixSettings'

export function AdminDashboard({ history = false }) {
  const { adminOrders: orders } = useDemoStore()
  const visible = [...orders].reverse().filter(order => history || !['CONCLUIDO', 'CANCELADO'].includes(order.status))
  const paid = orders.filter(order => order.financialStatus === 'CONFIRMADO')
  const revenue = paid.reduce((sum, order) => sum + order.total, 0)
  const sold = new Map()
  for (const { items, reward } of paid) {
    for (const { product, quantity } of items) {
      const paidQuantity = quantity - Number(reward && product.id === 'acai-300')
      if (!paidQuantity) continue
      const previous = sold.get(product.id)
      sold.set(product.id, { name: product.name, quantity: (previous?.quantity ?? 0) + paidQuantity })
    }
  }
  const bestSellers = [...sold.values()].sort((a, b) => b.quantity - a.quantity)
  const metrics = [
    ['Faturamento recebido', money(revenue)], ['Pedidos pagos', paid.length],
    ['Cancelamentos', orders.filter(order => order.status === 'CANCELADO').length],
    ['Ticket médio', money(paid.length ? Math.round(revenue / paid.length) : 0)],
  ]
  return <section className="stack">
    <PageHeading title={history ? 'Histórico de pedidos' : 'Visão geral'} />
    {!history && <>
      <dl className="metrics">{metrics.map(([label, value]) => <div className="panel" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <section className="panel stack"><h2>Produtos mais vendidos</h2>
        {bestSellers.length ? <ol className="divided">{bestSellers.map(({ name, quantity }) => (
          <li key={name} className="line-item"><span>{name}</span><strong>{quantity} un.</strong></li>
        ))}</ol> : <p>Nenhum item pago registrado.</p>}
      </section>
      <h2>Pedidos em andamento</h2>
    </>}
    {visible.length ? visible.map(order => <OrderCard key={order.id} order={order} to={'/admin/pedidos/' + order.id} />)
      : <EmptyState title="Nenhum pedido por aqui" />}
  </section>
}

export function AdminOrderDetail() {
  const { id } = useParams()
  const { adminOrders: orders } = useDemoStore()
  const order = orders.find(item => item.id === id)
  if (!order) return <EmptyState title="Pedido indisponível"><ActionLink to="/admin">Voltar aos pedidos</ActionLink></EmptyState>
  return <OrderDetails key={id} order={order} />
}

function OrderDetails({ order }) {
  const { changeOrder } = useDemoStore()
  const [suggestion, setSuggestion] = useState(null)
  const [expiryDismissed, setExpiryDismissed] = useState(false)
  const [error, setError] = useState('')
  const { receipt } = order
  const statuses = nextStatuses(order)
  const confirmable = order.status !== 'CANCELADO' && ['PENDENTE', 'EXPIRADO'].includes(order.financialStatus)
  const expirySuggestion = order.status === 'REVISAO_MANUAL' && !expiryDismissed ? whatsappMessage(order, 'REVISAO_MANUAL') : null

  function apply(action) {
    try {
      const updated = changeOrder(order.id, action)
      setError('')
      setExpiryDismissed(true)
      setSuggestion(whatsappMessage(updated, action))
    } catch (failure) {
      setError(failure.message)
    }
  }

  return <section className="stack">
    <ActionLink to="/admin" secondary>Voltar aos pedidos</ActionLink>
    <PageHeading title={'Pedido ' + order.number}>{new Date(order.createdAt).toLocaleString('pt-BR')}</PageHeading>
    <div className="checkout-grid">
      <div className="panel stack">
        <h2>Andamento</h2>
        <div><OrderStatus status={order.status} /></div>
        <OrderTimeline order={order} />
        {statuses.length > 0 && <form className="stack" key={order.status + order.financialStatus} onSubmit={event => {
          event.preventDefault()
          apply(new FormData(event.currentTarget).get('status'))
        }}>
          <FormField label="Novo status"><select name="status" required defaultValue="">
            <option value="" disabled>Selecione uma opção</option>
            {statuses.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select></FormField>
          <Button type="submit">Salvar status</Button>
        </form>}
        {error && <p role="alert" className="notice">{error}</p>}
      </div>
      <div className="panel stack">
        <h2>Pagamento</h2>
        <p>{order.total > 0 ? paymentLabel(order.payment, order.method) : 'Sem cobrança'}</p>
        <p>Status financeiro <strong>{financeLabels[order.financialStatus]}</strong></p>
        <p className="total"><span>Produtos</span><strong>{money(order.productsTotal)}</strong></p>
        {order.reward && <p className="total"><span>Recompensa</span><strong>−{money(order.discount)}</strong></p>}
        <p className="total"><span>Taxa de entrega</span><strong>{money(order.deliveryFee)}</strong></p>
        <p className="total"><span>Total</span><strong>{money(order.total)}</strong></p>
        {confirmable && <Button onClick={() => apply('confirm')}>Confirmar recebimento do pagamento</Button>}
      </div>
      <div className="panel stack-small">
        <h2>Cliente</h2>
        <p><strong>{order.customer}</strong></p>
        <p>WhatsApp {receipt.phone}</p>
        <p>{order.accountId ? 'Cliente cadastrado' : 'Visitante'}</p>
      </div>
      <div className="panel stack-small">
        <h2>Recebimento</h2>
        {order.method === 'delivery' ? <>
          <p>Entrega · {receipt.district}</p>
          <p>{receipt.street}, {receipt.streetNumber}</p>
          {receipt.complement && <p>Complemento · {receipt.complement}</p>}
          {receipt.reference && <p>Referência · {receipt.reference}</p>}
        </> : <p>Retirada na loja</p>}
        <p>Taxa de entrega <strong>{money(order.deliveryFee)}</strong></p>
      </div>
    </div>
    <section className="panel stack">
      <h2>Produtos</h2>
      <ul className="divided">{order.items.map(({ product, quantity }) => <li key={product.id} className="admin-order-item">
        <ProductMedia product={product} />
        <div className="stack-small">
          <h3>{product.name}</h3>
          <p>{product.description}</p>
          {product.size && <p>Tamanho · {product.size}</p>}
          <p>{quantity} un. × {money(product.price)} · Subtotal <strong>{money(product.price * quantity)}</strong></p>
        </div>
      </li>)}</ul>
      {order.notes && <p><strong>Observações</strong> · {order.notes}</p>}
      {order.reward && <p><strong>Recompensa de fidelidade</strong> · 1 açaí de 300 ml</p>}
    </section>
    {(suggestion || expirySuggestion) && <WhatsAppModal key={suggestion ?? expirySuggestion} order={order} text={suggestion ?? expirySuggestion} onClose={() => {
      setExpiryDismissed(true)
      setSuggestion(null)
    }} />}
  </section>
}

function WhatsAppModal({ order, text, onClose }) {
  const [message, setMessage] = useState(text)
  const [feedback, setFeedback] = useState('')
  const phone = brazilianPhone(order.receipt.phone)
  return <Modal title="Mensagem pelo WhatsApp" onClose={onClose}>
    <p><strong>{order.customer}</strong> · {order.receipt.phone}</p>
    <FormField label="Mensagem sugerida"><textarea rows={5} value={message} onChange={event => {
      setMessage(event.target.value)
      setFeedback('')
    }} /></FormField>
    <div className="actions">
      {phone && message.trim() && <a className="button" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}>Enviar pelo WhatsApp</a>}
      <Button secondary disabled={!message.trim()} onClick={async () => {
        try {
          await navigator.clipboard.writeText(message)
          setFeedback('Mensagem copiada.')
        } catch {
          setFeedback('Selecione e copie a mensagem no campo acima.')
        }
      }}>Copiar mensagem</Button>
      <Button secondary onClick={onClose}>Agora não</Button>
    </div>
    {feedback && <p role="status">{feedback}</p>}
  </Modal>
}

const sections = {
  catalog: { title: 'Produtos', singular: 'produto' },
  groups: { title: 'Categorias', singular: 'categoria' },
  areas: { title: 'Bairros e taxas', singular: 'bairro' },
}

const imageTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxImageSize = 5 * 1024 * 1024

export function AdminCollection({ collection }) {
  const store = useDemoStore()
  const [editing, setEditing] = useState(null)
  const [image, setImage] = useState(null)
  const [preview, setPreview] = useState('')
  const [imageError, setImageError] = useState('')
  const [checkingImage, setCheckingImage] = useState(false)
  const { title, singular } = sections[collection]
  const entries = store[collection]
  const products = collection === 'catalog'

  useEffect(() => {
    if (!image) return
    let active = true
    const url = URL.createObjectURL(image)
    const candidate = new Image()
    candidate.src = url
    candidate.decode().then(() => {
      if (active) setPreview(url)
    }).catch(() => {
      if (active) setImageError('O arquivo selecionado não pôde ser aberto como imagem.')
    }).finally(() => {
      if (active) setCheckingImage(false)
    })
    return () => {
      active = false
      URL.revokeObjectURL(url)
    }
  }, [image])

  function clearSelection() {
    setImage(null)
    setPreview('')
    setImageError('')
    setCheckingImage(false)
  }

  function edit(entry) {
    setEditing(entry)
    clearSelection()
  }

  function submit(event) {
    event.preventDefault()
    if (imageError || checkingImage) return
    const fields = new FormData(event.currentTarget)
    const name = fields.get('name').trim()
    if (!name) {
      event.currentTarget.elements.name.setCustomValidity('Informe um nome.')
      event.currentTarget.reportValidity()
      return
    }
    const entry = { ...editing, id: editing.id ?? crypto.randomUUID(), name }
    if (products) Object.assign(entry, {
      category: fields.get('category'), price: Math.round(Number(fields.get('price')) * 100),
      description: fields.get('description').trim(), available: fields.has('available'), active: fields.has('active'),
      size: fields.get('size').trim(), image: image ? URL.createObjectURL(image) : editing.image,
    })
    if (collection === 'areas') Object.assign(entry, {
      fee: Math.round(Number(fields.get('fee')) * 100), active: fields.has('active'),
    })
    store.save(collection, entry)
    edit(null)
  }
  return <section className="stack">
    <div className="admin-heading"><PageHeading title={title} /><Button onClick={() => edit({})}>Adicionar {singular}</Button></div>
    {entries.length ? <ul className="panel divided">{entries.map(entry => <li className="line-item" key={entry.id}>
      <div><strong>{entry.name}</strong>
        {products && <p>{money(entry.price)} · {entry.active === false ? 'Inativo' : entry.available ? 'Disponível' : 'Esgotado'}</p>}
        {collection === 'areas' && <p>{money(entry.fee)} · {entry.active === false ? 'Inativo' : 'Ativo'}</p>}
      </div>
      <Button secondary aria-label={'Editar ' + entry.name} onClick={() => edit(entry)}>Editar</Button>
    </li>)}</ul> : <EmptyState title="Nenhum registro" />}
    {editing && <Modal title={(editing.id ? 'Editar ' : 'Adicionar ') + singular} onClose={() => edit(null)}>
      <form className="stack" onSubmit={submit}>
        <FormField label="Nome"><input name="name" autoFocus required maxLength={100} defaultValue={editing.name} onInput={event => event.currentTarget.setCustomValidity('')} /></FormField>
        {products && <>
          <FormField label="Categoria"><select name="category" required defaultValue={editing.category ?? ''}>
            <option value="">Selecione uma categoria</option>{store.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select></FormField>
          <FormField label="Descrição"><textarea name="description" required maxLength={500} defaultValue={editing.description} /></FormField>
          <FormField label="Tamanho (opcional)"><input name="size" maxLength={40} defaultValue={editing.size} /></FormField>
          <CurrencyField label="Preço" name="price" value={editing.price} />
          <div className="image-preview"><ProductMedia product={{ ...editing, image: preview || editing.image }} /></div>
          <FormField label="Foto do produto (JPG, PNG ou WebP, até 5 MB)"><input type="file" accept={imageTypes.join(',')} onChange={event => {
            const file = event.target.files[0]
            if (!file) return
            event.target.value = ''
            clearSelection()
            if (!imageTypes.includes(file.type) || file.size > maxImageSize || !file.size) {
              setImageError('Selecione uma imagem JPG, PNG ou WebP de até 5 MB.')
              return
            }
            setCheckingImage(true)
            setImage(file)
          }} /></FormField>
          {imageError && <Button secondary onClick={clearSelection}>Descartar seleção</Button>}
          {(preview || editing.image) && <Button secondary onClick={() => {
            clearSelection()
            setEditing(previous => ({ ...previous, image: undefined }))
          }}>Remover foto</Button>}
          {checkingImage && <p role="status">Verificando imagem…</p>}
          {imageError && <p role="alert" className="notice">{imageError}</p>}
          <label className="choice"><input type="checkbox" name="available" defaultChecked={editing.available !== false} /> Disponível para compra</label>
        </>}
        {collection === 'areas' && <CurrencyField label="Taxa de entrega" name="fee" value={editing.fee} />}
        {collection !== 'groups' && <label className="choice"><input type="checkbox" name="active" defaultChecked={editing.active !== false} /> Ativo</label>}
        <Button type="submit" disabled={Boolean(imageError) || checkingImage}>Salvar</Button>
      </form>
    </Modal>}
  </section>
}

function CurrencyField({ label, name, value }) {
  return <FormField label={label + ' (R$)'}><input name={name} type="number" min="0" max="99999.99" step="0.01" required defaultValue={value === undefined ? '' : value / 100} /></FormField>
}

export function AdminSettings() {
  const { settings, setOpen, setContact } = useDemoStore()
  const [feedback, setFeedback] = useState('')
  const [contactFeedback, setContactFeedback] = useState('')

  function change(open) {
    try {
      setOpen(open)
      setFeedback(open ? 'Loja aberta para novos pedidos.' : 'Loja fechada para novos pedidos.')
    } catch (failure) {
      setFeedback(failure.message)
    }
  }

  return <section className="narrow stack">
    <PageHeading title="Configurações" />
    <div className="panel stack">
      <h2>Funcionamento</h2>
      <div><StatusBadge tone={settings.open ? 'positive' : 'warning'}>{settings.open ? 'Loja aberta' : 'Loja fechada'}</StatusBadge></div>
      <div className="actions">
        <Button disabled={settings.open} onClick={() => change(true)}>Abrir loja</Button>
        <Button secondary disabled={!settings.open} onClick={() => change(false)}>Fechar loja por hoje</Button>
      </div>
      <div role="status">{feedback && <Notice>{feedback}</Notice>}</div>
    </div>
    <PixSettings />
    <form className="panel stack" onSubmit={event => {
      event.preventDefault()
      const phone = new FormData(event.currentTarget).get('contact').trim()
      if (phone && !brazilianPhone(phone)) {
        setContactFeedback('Informe um telefone válido com DDD.')
        return
      }
      setContact(phone)
      setContactFeedback('Contato salvo nesta demonstração.')
    }}>
      <h2>Contato da loja</h2>
      <FormField label="Telefone de contato"><input name="contact" type="tel" maxLength={24} defaultValue={settings.contact} onChange={() => setContactFeedback('')} /></FormField>
      <Button type="submit">Salvar contato</Button>
      {contactFeedback && <p role="status">{contactFeedback}</p>}
    </form>
  </section>
}
