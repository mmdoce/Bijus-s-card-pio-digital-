import { useEffect, useState } from 'react'
import { ActionLink, Button } from '../../components/ui'
import { statusLabels } from '../../lib/orders'
import { finalOrderVisibility, isFinalOrder, trackingView } from '../../lib/orderTracking'
import { useDemoStore } from '../../mocks/DemoStore'
import { OrderStatus } from './OrderPages'

export function ActiveOrderBar() {
  const { activeOrders, dismissOrder, customerSoundEnabled, toggleCustomerSound } = useDemoStore()
  const [audioError, setAudioError] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now)
  const visible = activeOrders.filter(order => !isFinalOrder(order) || order.finishedAt + finalOrderVisibility > now)
  const nextHideAt = Math.min(...visible.filter(isFinalOrder).map(order => order.finishedAt + finalOrderVisibility))

  useEffect(() => {
    if (!Number.isFinite(nextHideAt)) return
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, nextHideAt - Date.now()))
    return () => clearTimeout(timer)
  }, [nextHideAt, now])

  if (!visible.length) return null

  async function toggleSound() {
    setBusy(true)
    setAudioError('')
    try {
      await toggleCustomerSound()
    } catch {
      setAudioError('O navegador não permitiu ativar o som. Tente novamente pelo botão.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="active-order-bar" aria-label="Acompanhamento de pedidos">
    <div className="shell stack-small">
      <div className="active-order-heading">
        <h2>Seus pedidos</h2>
        <Button secondary disabled={busy} onClick={toggleSound}>
          {customerSoundEnabled ? 'Desativar sons' : 'Ativar sons'}
        </Button>
      </div>
      {audioError && <p role="alert">{audioError}</p>}
      <ul className="active-order-list">
        {visible.map(order => {
          const view = trackingView(order)
          const terminal = isFinalOrder(order)
          return <li key={order.id} className="active-order">
            <span className="active-order-icon" aria-hidden="true">{view.icon}</span>
            <div className="stack-small">
              <div className="active-order-heading" aria-live="polite">
                <strong>Pedido {order.number}</strong>
                <OrderStatus status={order.status} />
              </div>
              <p>{view.message}</p>
              {view.paymentMessage && <p><strong>{view.paymentMessage}</strong></p>}
              <progress value={view.progress} max={view.steps} aria-label={'Progresso do pedido ' + order.number} aria-valuetext={statusLabels[order.status]} />
              <div className="actions">
                <ActionLink to={(order.status === 'AGUARDANDO_PAGAMENTO' ? '/pagamento/' : '/pedido/') + order.token} secondary>Ver detalhes</ActionLink>
                {terminal && <Button secondary aria-label={'Dispensar pedido ' + order.number} onClick={() => dismissOrder(order.id)}>Dispensar</Button>}
              </div>
            </div>
          </li>
        })}
      </ul>
    </div>
  </section>
}
