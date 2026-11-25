import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { entrega } from '../../assets/mascote'
import { ActionLink, Button, EmptyState, FormField, LoadingState, Notice, PageHeading, StatusBadge } from '../../components/ui'
import { money } from '../../lib/money'
import { financeLabels, paymentLabel, statusLabels } from '../../lib/orders'
import { getOrder, isOrderId, orderView } from '../../lib/orderData'
import { pushGuestOrders } from '../notifications/pushData'
import { PushSettings } from '../notifications/PushSettings'
import { isPrivateTrackingToken, readTrackingSession, rememberGuestOrder } from '../../lib/orderTracking'
import { supabase, supabaseForSession } from '../../lib/supabase'
import { useAuth } from '../account/AuthProvider'
import { useStore } from '../catalog/StoreProvider'
import { useOrderPolling } from './useOrderPolling'

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
    <Notice>O prazo é da loja. Ao terminar, o pedido segue para revisão manual. Esse prazo não determina a validade bancária do Pix.</Notice>
    <p>Tempo restante <strong>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</strong></p>
    {seconds > 0 && <>
      {qr && <img src={qr} alt="QR Code do Pix" width="240" height="240" />}
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
  const { token } = useParams()
  const { session, user, loading } = useAuth()
  const { settings } = useStore()
  const legacy = isPrivateTrackingToken(token)
  const privateToken = legacy ? token : (readTrackingSession().guests[token] ?? pushGuestOrders()[token])
  const accessToken = privateToken ? null : user && session?.access_token
  const client = useMemo(() => supabase && (privateToken || accessToken) ? supabaseForSession(accessToken) : null, [accessToken, privateToken])
  const load = useCallback(async () => {
    const data = await getOrder(client, token, privateToken)
    if (legacy && data?.id) {
      try { rememberGuestOrder(data.id, privateToken) } catch { return { data, legacy: true } }
    }
    return { data }
  }, [client, token, privateToken, legacy])
  const valid = legacy || isOrderId(token)
  const { result } = useOrderPolling(load, Boolean(valid && client))
  if (!valid) return <EmptyState title="Pedido indisponível"><ActionLink to="/">Ver cardápio</ActionLink></EmptyState>
  if (!privateToken && !user && !loading) return <EmptyState title="Entre para consultar seu pedido"><ActionLink to="/login">Entrar</ActionLink></EmptyState>
  if (!supabase) return <EmptyState title="Não foi possível consultar o pedido"><ActionLink to="/">Ver cardápio</ActionLink></EmptyState>
  if (!result) return <LoadingState>Consultando o pedido…</LoadingState>
  if (result.error || !result.data?.data) return <EmptyState title={result.error ? 'Não foi possível consultar o pedido' : 'Pedido indisponível'}>
    <ActionLink to="/">Ver cardápio</ActionLink>
  </EmptyState>
  const order = orderView(result.data.data)
  if (legacy && !result.data.legacy) return <Navigate replace to={(payment ? '/pagamento/' : '/pedido/') + order.id} />
  return <OrderDetails settings={settings} payment={payment} allowPayment order={{ ...order, token }} />
}

export function OrderDetails({ order, settings, payment = false, allowPayment = false }) {
  const { token } = order
  const showPix = allowPayment && payment && order.payment === 'pix' && order.status === 'AGUARDANDO_PAGAMENTO' && order.pixPayload
  const showPixGuidance = allowPayment && order.payment === 'pix' && ['AGUARDANDO_PAGAMENTO', 'REVISAO_MANUAL'].includes(order.status)
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
            {order.method === 'delivery' ? receipt && <p>{receipt.street}, {receipt.streetNumber} · {receipt.district}</p> : <p>Retirada na loja, sem taxa.</p>}
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
          <summary>Notificações do pedido</summary>
          <PushSettings audience="customer" />
          <ActionLink secondary to="/notificacoes">Configurar sons</ActionLink>
        </details>}
        {showPix ? <ActionLink to={'/pedido/' + token}>Ver acompanhamento</ActionLink>
          : allowPayment && order.status === 'AGUARDANDO_PAGAMENTO' && order.pixPayload ? <ActionLink to={'/pagamento/' + token}>Ver Pix</ActionLink>
            : <ActionLink to="/" secondary>Voltar ao cardápio</ActionLink>}
      </aside>
    </div>
  </section>
}
