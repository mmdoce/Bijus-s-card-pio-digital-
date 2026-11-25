import { useCallback, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { ActionLink, Button, EmptyState, FormField, LoadingState, Modal, Notice, PageHeading, StatusBadge } from '../../components/ui'
import { money } from '../../lib/money'
import { isOrderId, orderError, performOrderAction } from '../../lib/orderData'
import { brazilianPhone, financeLabels, nextStatuses, paymentLabel, statusLabels, whatsappMessage } from '../../lib/orders'
import { supabaseForSession } from '../../lib/supabase'
import { useAuth } from '../account/AuthProvider'
import { useAcknowledgeOrder } from '../notifications/NotificationCenter'
import { OrderCard, OrderStatus } from './OrderPages'
import { useOrderPolling } from './useOrderPolling'

const one = value => Array.isArray(value) ? value[0] : value
const pageSize = 50

function useOrders(admin, orderId, page = 0) {
  const { session, user } = useAuth()
  const token = session?.access_token
  const userId = user?.id
  const client = useMemo(() => token && userId ? supabaseForSession(token) : null, [token, userId])
  const load = useCallback(async () => {
    const columns = 'id,public_number,customer_name,status,total_cents'
    let query = client.from('orders').select(orderId
      ? columns + ',customer_phone,receipt_method,street,street_number,district,complement,reference,notes,delivery_fee_cents,products_cents,discount_cents,order_items(id,product_name,quantity,unit_price_cents,subtotal_cents,is_reward),payments(method,status,expires_at,refund_reason,refund_reference),order_status_history(revision,reason)'
      : columns + (admin ? ',payments(method,status,expires_at)' : ''))
    if (!admin) query = query.eq('customer_id', userId)
    query = orderId ? query.eq('id', orderId).maybeSingle()
      : query.order('created_at', { ascending: false }).order('id').range(page * pageSize, (page + 1) * pageSize)
    const { data, error } = await query
    if (error) throw error
    if (admin && data) {
      const due = (Array.isArray(data) ? data : [data]).filter(order => {
        const payment = one(order.payments)
        return order.status === 'AGUARDANDO_PAGAMENTO' && payment?.status === 'PENDENTE'
          && payment.expires_at && Date.parse(payment.expires_at) <= Date.now()
      })
      await Promise.allSettled(due.map(async order => {
        const changed = await performOrderAction(client, order.id, 'expire', null, null, crypto.randomUUID())
        order.status = changed.status
        one(order.payments).status = changed.financial_status
      }))
    }
    return data
  }, [client, userId, admin, orderId, page])
  return { ...useOrderPolling(load, Boolean(client && (!orderId || isOrderId(orderId)))), client }
}

export function ExistingOrders({ admin = false }) {
  const [page, setPage] = useState(0)
  const { result } = useOrders(admin, undefined, page)
  return <div className="stack">
    {!result ? <LoadingState>Carregando pedidos…</LoadingState> : result.error
      ? <EmptyState title="Não foi possível consultar os pedidos" />
      : !result.data.length ? <EmptyState title={admin ? 'Nenhum pedido registrado' : 'Nenhum pedido na sua conta'} />
      : result.data.slice(0, pageSize).map(order => <OrderCard key={order.id} to={(admin ? '/admin/pedidos/' : '/pedido/') + order.id}
        order={{ number: 'BD-' + order.public_number, customer: order.customer_name, total: order.total_cents, status: order.status }} />)}
    {(page > 0 || result?.data?.length > pageSize) && <div className="actions">
      <Button secondary disabled={page === 0} onClick={() => setPage(value => value - 1)}>Pedidos mais recentes</Button>
      <Button secondary disabled={!(result?.data?.length > pageSize)} onClick={() => setPage(value => value + 1)}>Pedidos anteriores</Button>
    </div>}
  </div>
}

export function AdminExistingOrder() {
  const { id } = useParams()
  const { result, refresh, client } = useOrders(true, id)
  useAcknowledgeOrder(result?.data?.id)
  const [dialog, setDialog] = useState(null)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const attempt = useRef(null)
  const locked = useRef(false)
  if (!isOrderId(id)) return <EmptyState title="Pedido indisponível" />
  if (!result) return <LoadingState>Consultando o pedido…</LoadingState>
  if (result.error || !result.data) return <EmptyState title={result.error ? 'Não foi possível consultar o pedido' : 'Pedido indisponível'}>
    <ActionLink to="/admin/historico">Voltar ao histórico</ActionLink>
  </EmptyState>
  const order = result.data
  const payment = one(order.payments)
  const view = { number: 'BD-' + order.public_number, customer: order.customer_name, status: order.status, method: order.receipt_method,
    payment: payment?.method, financialStatus: payment?.status }
  const actions = nextStatuses(view)
  if (payment && ['PENDENTE', 'EXPIRADO'].includes(payment.status) && !['CONCLUIDO', 'CANCELADO'].includes(order.status)) actions.unshift('confirm')
  if (payment?.status === 'CONFIRMADO') actions.push('refund')
  const label = action => ({ confirm: 'Confirmar recebimento', refund: 'Registrar reembolso', CANCELADO: 'Cancelar pedido' })[action] ?? statusLabels[action]
  const cancellation = order.order_status_history?.find(event => event.reason.startsWith('CANCELADO: '))?.reason.slice(11)
  const mobile = brazilianPhone(order.customer_phone ?? '')

  async function submit(event) {
    event.preventDefault()
    if (locked.current) return
    const data = new FormData(event.currentTarget)
    const reason = data.get('reason')?.trim()
    const reference = data.get('reference')?.trim()
    if (['CANCELADO', 'refund'].includes(dialog) && !reason) { setFailure('Informe o motivo.'); return }
    const signature = JSON.stringify([id, dialog, reason, reference])
    if (attempt.current?.signature !== signature) attempt.current = { signature, requestId: crypto.randomUUID() }
    locked.current = true
    setBusy(true)
    setFailure('')
    try {
      await performOrderAction(client, id, dialog, reason, reference, attempt.current.requestId)
      attempt.current = null
      setMessage(whatsappMessage(view, dialog))
      setDialog(null)
      refresh()
    } catch (error) {
      setFailure(error instanceof Error ? error.message : orderError(error).message)
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  return <section className="stack">
    <PageHeading title={'Pedido ' + view.number}>{order.customer_name}</PageHeading>
    <div className="panel stack">
      <div className="actions"><OrderStatus status={order.status} />{payment && <StatusBadge>{financeLabels[payment.status]}</StatusBadge>}</div>
      <p>WhatsApp {order.customer_phone}</p>
      <p>{order.receipt_method === 'delivery'
        ? `Entrega em ${order.street}, ${order.street_number} · ${order.district}`
        : 'Retirada na loja'}</p>
      {order.complement && <p>Complemento {order.complement}</p>}
      {order.reference && <p>Referência {order.reference}</p>}
      {order.notes && <p>Observações {order.notes}</p>}
      <ul>{order.order_items.map(item => <li key={item.id}>{item.quantity} × {item.product_name} · {money(item.unit_price_cents)} por unidade · {money(item.subtotal_cents)}{item.is_reward && ' · recompensa'}</li>)}</ul>
      <p>Subtotal <strong>{money(order.products_cents)}</strong></p>
      {order.discount_cents > 0 && <p>Desconto <strong>{money(order.discount_cents)}</strong></p>}
      <p>Taxa de entrega <strong>{money(order.delivery_fee_cents)}</strong></p>
      <p>Total <strong>{money(order.total_cents)}</strong></p>
      {payment && order.total_cents > 0 && <p>{paymentLabel(payment.method, order.receipt_method)}</p>}
      {cancellation && <p>Motivo do cancelamento {cancellation}</p>}
      {payment?.refund_reason && <p>Motivo do reembolso {payment.refund_reason}{payment.refund_reference && ' · ' + payment.refund_reference}</p>}
      <div className="actions">{actions.map(action => <Button secondary key={action} onClick={() => { setFailure(''); setDialog(action) }}>{label(action)}</Button>)}</div>
    </div>
    <ActionLink to="/admin/historico" secondary>Voltar ao histórico</ActionLink>
    {dialog && <Modal title={label(dialog)} onClose={() => { if (!busy) setDialog(null) }}>
      <form className="stack" onSubmit={submit}>
        {dialog === 'confirm' && <Notice>Confirme somente após verificar o recebimento.</Notice>}
        {dialog === 'refund' && <Notice>Registre o reembolso já realizado. O botão atualiza o pedido e a fidelidade.</Notice>}
        {['CANCELADO', 'refund'].includes(dialog) && <FormField label="Motivo"><textarea name="reason" maxLength={500} required /></FormField>}
        {dialog === 'refund' && <FormField label="Referência do reembolso (opcional)"><input name="reference" maxLength={150} /></FormField>}
        {failure && <p className="notice" role="alert">{failure}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Confirmar ação'}</Button>
      </form>
    </Modal>}
    {message !== null && <WhatsAppMessage value={message} change={setMessage} phone={mobile} />}
  </section>
}

function WhatsAppMessage({ value, change, phone }) {
  const [feedback, setFeedback] = useState('')
  return <Modal title="Mensagem para o cliente" onClose={() => change(null)}>
    <FormField label="Mensagem de WhatsApp"><textarea rows={4} value={value} onChange={event => change(event.target.value)} /></FormField>
    <div className="actions">
      <Button secondary disabled={!value.trim()} onClick={async () => {
        try { await navigator.clipboard.writeText(value); setFeedback('Mensagem copiada.') }
        catch { setFeedback('Selecione o texto para copiar.') }
      }}>Copiar mensagem</Button>
      {phone && value.trim() && <a className="button" href={'https://wa.me/' + phone + '?text=' + encodeURIComponent(value)} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>}
    </div>
    {feedback && <p role="status">{feedback}</p>}
  </Modal>
}
