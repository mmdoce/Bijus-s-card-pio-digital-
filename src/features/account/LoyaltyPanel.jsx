import { useCallback, useMemo } from 'react'
import { beijo } from '../../assets/mascote'
import { EmptyState, LoadingState } from '../../components/ui'
import { supabaseForSession } from '../../lib/supabase'
import { useOrderPolling } from '../orders/useOrderPolling'
import { useAuth } from './AuthProvider'

export function LoyaltyPanel() {
  const { session, user } = useAuth()
  const token = session?.access_token
  const id = user?.id
  const client = useMemo(() => token && id ? supabaseForSession(token) : null, [token, id])
  const load = useCallback(async () => {
    const [account, rewards] = await Promise.all([
      client.from('loyalty_accounts').select('stamp_balance').eq('profile_id', id).maybeSingle(),
      client.from('loyalty_rewards').select('id', { count: 'exact', head: true }).eq('profile_id', id).eq('state', 'available'),
    ])
    if (account.error || rewards.error) throw account.error ?? rewards.error
    return { stamps: account.data?.stamp_balance ?? 0, rewards: rewards.count ?? 0 }
  }, [client, id])
  const { result } = useOrderPolling(load, Boolean(client))
  if (!result) return <LoadingState>Consultando seus carimbos…</LoadingState>
  if (result.error) return <EmptyState title="Não foi possível consultar seus carimbos" />
  const { stamps, rewards } = result.data
  return <section className="panel stack">
    <img src={beijo} alt="" width="112" />
    <h2>Cartão de carimbos</h2>
    <p>{stamps < 0 ? `Saldo compensatório: ${stamps} carimbos` : `${stamps} de 9 carimbos`}</p>
    <p>{rewards} {rewards === 1 ? 'recompensa disponível' : 'recompensas disponíveis'}.</p>
    <p>Cada unidade paga de açaí elegível vale um carimbo. Com nove, ganhe uma garrafa de 300 ml na próxima compra elegível.</p>
  </section>
}
