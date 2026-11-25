import { useCallback, useMemo } from 'react'
import { beijo } from '../../assets/mascote'
import { EmptyState, LoadingState } from '../../components/ui'
import { supabaseForSession } from '../../lib/supabase'
import { useOrderPolling } from '../orders/useOrderPolling'
import { useAuth } from './AuthProvider'

const movementLabels = {
  credit: 'Carimbos recebidos', refund: 'Carimbos ajustados por reembolso', issue: 'Recompensa conquistada',
  revoke: 'Recompensa removida', reserve: 'Recompensa reservada', release: 'Recompensa liberada',
  redeem: 'Recompensa resgatada', restore: 'Recompensa devolvida',
}
const dates = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' })

export function LoyaltyPanel() {
  const { session, user } = useAuth()
  const token = session?.access_token
  const id = user?.id
  const client = useMemo(() => token && id ? supabaseForSession(token) : null, [token, id])
  const load = useCallback(async () => {
    const [account, rewards, activity] = await Promise.all([
      client.from('loyalty_accounts').select('stamp_balance').eq('profile_id', id).maybeSingle(),
      client.from('loyalty_rewards').select('id', { count: 'exact', head: true }).eq('profile_id', id).eq('state', 'available'),
      client.from('loyalty_transactions').select('id,movement,delta,created_at').eq('profile_id', id)
        .order('created_at', { ascending: false }).order('id').limit(20),
    ])
    if (account.error || rewards.error || activity.error) throw account.error ?? rewards.error ?? activity.error
    return { stamps: account.data?.stamp_balance ?? 0, rewards: rewards.count ?? 0, activity: activity.data ?? [] }
  }, [client, id])
  const { result } = useOrderPolling(load, Boolean(client))
  if (!result) return <LoadingState>Consultando seus carimbos…</LoadingState>
  if (result.error) return <EmptyState title="Não foi possível consultar seus carimbos" />
  const { stamps, rewards, activity } = result.data
  return <section className="panel stack">
    <img src={beijo} alt="" width="112" />
    <h2>Cartão de carimbos</h2>
    <p>{stamps < 0 ? `Saldo compensatório: ${stamps} carimbos` : `${stamps} de 9 carimbos`}</p>
    <p>{rewards} {rewards === 1 ? 'recompensa disponível' : 'recompensas disponíveis'}.</p>
    <p>Cada unidade paga de açaí elegível vale um carimbo. Com nove, ganhe uma garrafa de 300 ml na próxima compra elegível.</p>
    <h3>Atividade recente</h3>
    {activity.length ? <ul className="stack-small">{activity.map(item => <li key={item.id}>
      <strong>{movementLabels[item.movement]}</strong>{item.delta !== 0 && ' · ' + (item.delta > 0 ? '+' : '') + item.delta}
      {' · '}<time dateTime={item.created_at}>{dates.format(new Date(item.created_at))}</time>
    </li>)}</ul> : <p>Seu histórico de carimbos vai aparecer aqui.</p>}
  </section>
}
