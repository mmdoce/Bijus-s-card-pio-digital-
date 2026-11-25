import { useCallback, useMemo, useState } from 'react'
import { Button, EmptyState, FormField, LoadingState, PageHeading } from '../../components/ui'
import { money } from '../../lib/money'
import { supabaseForSession } from '../../lib/supabase'
import { useAuth } from '../account/AuthProvider'
import { useOrderPolling } from '../orders/useOrderPolling'
import { currentFinancePeriod, financePeriod } from './financeDates'

export function AdminFinance() {
  const { session } = useAuth()
  const token = session?.access_token
  const client = useMemo(() => token ? supabaseForSession(token) : null, [token])
  const [dates, setDates] = useState(currentFinancePeriod)
  const [period, setPeriod] = useState(() => financePeriod(dates))
  const [message, setMessage] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await client.rpc('admin_financial_summary', period)
    if (error) throw error
    return data
  }, [client, period])
  const { result, refresh } = useOrderPolling(load, Boolean(client))

  function filter(event) {
    event.preventDefault()
    try {
      setPeriod(financePeriod(dates))
      setMessage('')
    } catch (error) { setMessage(error.message) }
  }

  const data = result?.data
  return <section className="stack">
    <PageHeading title="Financeiro" />
    <form className="panel stack-small" onSubmit={filter}>
      <div className="actions">
        <FormField label="De"><input required type="date" value={dates.start} onChange={event => setDates({ ...dates, start: event.target.value })} /></FormField>
        <FormField label="Até"><input required type="date" value={dates.end} onChange={event => setDates({ ...dates, end: event.target.value })} /></FormField>
      </div>
      {message && <p role="alert">{message}</p>}
      <div className="actions"><Button type="submit">Aplicar período</Button></div>
    </form>
    {!result && <LoadingState>Consultando financeiro…</LoadingState>}
    {result?.error && <EmptyState title="Não foi possível consultar o financeiro"><Button secondary onClick={refresh}>Tentar novamente</Button></EmptyState>}
    {data && <dl className="panel stack-small">
      <div><dt>Recebimentos confirmados</dt><dd><strong>{money(data.received_cents)}</strong></dd></div>
      <div><dt>Reembolsos registrados</dt><dd><strong>{money(data.refunded_cents)}</strong></dd></div>
      <div><dt>Recebimentos líquidos</dt><dd><strong>{money(data.received_cents - data.refunded_cents)}</strong></dd></div>
      <div><dt>Pendente ou em revisão</dt><dd><strong>{money(data.pending_cents)}</strong></dd></div>
      <div><dt>Pedidos cancelados</dt><dd><strong>{data.canceled_orders}</strong></dd></div>
    </dl>}
  </section>
}
