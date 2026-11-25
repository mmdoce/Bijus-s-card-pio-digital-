import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { entrega } from '../../assets/mascote'
import { ActionLink, Button, EmptyState, FormField, Notice, PageHeading, StatusBadge } from '../../components/ui'
import { money } from '../../lib/money'
import { financeLabels, paymentLabel, statusLabels } from '../../lib/orders'

export function OrderStatus({ status }) {
  const tone = ['CANCELADO', 'REVISAO_MANUAL', 'AGUARDANDO_PAGAMENTO'].includes(status) ? 'warning'
    : status === 'CONCLUIDO' ? 'positive' : 'neutral'
  return <StatusBadge tone={tone}>{statusLabels[status]}</StatusBadge>
}

export function OrderCard({ order, to }) {
  return <article className="panel order-card">
    <div className="stack-small"><h3><Link to={to}>Pedido {order.number}</Link></h3><p>{order.customer}</p></div>
    <OrderStatus status={order.status} />
    <strong>{money(order.total)}</strong>
    <ActionLink to={to} secondary>Ver detalhes</ActionLink>
  </article>
}

export function OrderTimeline({ order }) {
  const start = order.expiresAt || order.status === 'REVISAO_MANUAL' ? ['AGUARDANDO_PAGAMENTO'] : []
  const finish = order.method === 'delivery' ? ['PRONTO_ENTREGA', 'SAIU_PARA_ENTREGA'] : ['PRONTO']
  const steps = ['REVISAO_MANUAL', 'CANCELADO'].includes(order.status)
    ? [...start, order.status]
    : [...start, 'EM_PREPARO', ...finish, 'CONCLUIDO']
  const current = steps.indexOf(order.status)
  return <ol className="timeline" aria-label="Linha do tempo do pedido">
    {steps.map((status, index) => <li key={status} className={index <= current ? 'reached' : ''} aria-current={index === current ? 'step' : undefined}>{statusLabels[status]}</li>)}
  </ol>
}

function PixDetails({ order }) {
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.ceil((order.expiresAt - Date.now()) / 1000)))
  const [qr, setQr] = useState('')
  const [feedback, setFeedback] = useState('')
  const payload = order.pixPayload
  useEffect(() => {
    let active = true
    import('qrcode').then(({ default: encoder }) => encoder.toDataURL(payload, { width: 240 }))
      .then(url => { if (active) setQr(url) })
      .catch(() => { if (active) setFeedback('O QR Code está indisponível. O código continua abaixo.') })
    return () => { active = false }
  }, [payload])
  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.max(0, Math.ceil((order.expiresAt - Date.now()) / 1000))), 250)
    return () => clearInterval(timer)
  }, [order.expiresAt])

  return <div className="stack">
    <Notice>Pix demonstrativo com chave fictícia. Use somente para testar o fluxo.</Notice>
    <p>Tempo restante <strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong></p>
    {seconds > 0 && <>
      {qr && <img src={qr} alt="QR Code do Pix demonstrativo" width="240" height="240" />}
      <FormField label="Pix copia e cola"><textarea readOnly value={payload} rows={4} /></FormField>
      <Button secondary onClick={async () => {
        try {
          await navigator.clipboard.writeText(payload)
          setFeedback('Código copiado.')
        } catch {
          setFeedback('Selecione e copie o código no campo acima.')
        }
      }}>Copiar código</Button>
      {feedback && <p role="status">{feedback}</p>}
    </>}
  </div>
}

export function OrderPage({ payment = false }) {
  return <section className="narrow">
    <PageHeading title={payment ? 'Pagamento via Pix' : 'Acompanhamento do pedido'} />
    <EmptyState title={payment ? 'Pagamentos indisponíveis nesta etapa' : 'Acompanhamento indisponível nesta etapa'}>
      <ActionLink to="/">Voltar ao cardápio</ActionLink>
    </EmptyState>
  </section>
}

export function OrderDetails({ order, settings, payment = false }) {
  const { token } = order
  const showPix = payment && order.payment === 'pix' && order.status === 'AGUARDANDO_PAGAMENTO'
  const showPixGuidance = order.payment === 'pix' && ['AGUARDANDO_PAGAMENTO', 'REVISAO_MANUAL'].includes(order.status)
  const { receipt } = order

  return <section>
    <PageHeading title={showPix ? 'Pagamento via Pix' : 'Pedido ' + order.number} />
    <div className="checkout-grid">
      <div className="panel stack">
        <div><OrderStatus status={order.status} /></div>
        {showPix ? <PixDetails key={token} order={order} /> : <OrderTimeline order={order} />}
        {order.status === 'REVISAO_MANUAL' && <Notice>O prazo do Pix terminou. O pedido aguarda revisão da loja.</Notice>}
        {showPixGuidance && <div className="notice stack-small">
          <p>Já realizou o pagamento? Aguarde um pouquinho! Nossa equipe está conferindo o recebimento do seu Pix. Assim que o pagamento for confirmado, o status do seu pedido será atualizado automaticamente.</p>
          <p><strong>Caso já tenha pago, não realize outro pagamento.</strong></p>
        </div>}
        <div className="delivery-details">
          <img src={entrega} alt="" width="64" loading="lazy" />
          <div><h2>{order.method === 'delivery' ? 'Entrega' : 'Retirada'}</h2>
            {order.method === 'delivery' ? <p>{receipt.street}, {receipt.streetNumber} · {receipt.district}</p> : <p>Retirada na loja, sem taxa.</p>}
            {settings.contact && <p>Contato da loja <a href={'tel:' + settings.contact.replace(/[^+\d]/g, '')}>{settings.contact}</a></p>}
          </div>
        </div>
      </div>
      <aside className="panel stack checkout-summary">
        <h2>Resumo</h2>
        <ul className="divided">{order.items.map(({ product, quantity }) => <li className="line-item" key={product.id}>{quantity} × {product.name}</li>)}</ul>
        {order.reward && <p>Recompensa de fidelidade · 1 açaí de 300 ml</p>}
        {order.notes && <p><strong>Observações</strong> · {order.notes}</p>}
        <p className="total"><span>Entrega</span><strong>{money(order.deliveryFee)}</strong></p>
        <p className="total checkout-total"><span>Total</span><strong>{money(order.total)}</strong></p>
        <p>{order.total > 0 && paymentLabel(order.payment, order.method) + ' · '}{financeLabels[order.financialStatus]}</p>
        {!['CONCLUIDO', 'CANCELADO'].includes(order.status) && <details className="push-option">
          <summary>Ativar notificações</summary>
          <p>As notificações em segundo plano estarão disponíveis após a integração com o backend. Você já pode ativar sons enquanto o cardápio estiver aberto.</p>
        </details>}
        {showPix ? <ActionLink to={'/pedido/' + token}>Ver acompanhamento</ActionLink>
          : order.status === 'AGUARDANDO_PAGAMENTO' ? <ActionLink to={'/pagamento/' + token}>Ver Pix</ActionLink>
            : <ActionLink to="/" secondary>Voltar ao cardápio</ActionLink>}
      </aside>
    </div>
  </section>
}
