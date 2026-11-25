import { EmptyState, LoadingState, Notice, PageHeading, StatusBadge } from '../../components/ui'
import { useStore } from '../catalog/StoreProvider'

const pages = {
  orders: ['Visão geral', 'Pedidos e faturamento indisponíveis nesta etapa'],
  history: ['Histórico de pedidos', 'Histórico indisponível nesta etapa'],
  order: ['Detalhes do pedido', 'Nenhum pedido disponível para consulta'],
  areas: ['Bairros e taxas', 'Cadastro de bairros indisponível nesta etapa'],
}

export function AdminPage({ section = 'orders' }) {
  const [title, message] = pages[section]
  return <section className="stack">
    <PageHeading title={title} />
    <EmptyState title={message} />
  </section>
}

export function AdminSettings() {
  const { settings, loading, error } = useStore()
  return <section className="narrow stack">
    <PageHeading title="Configurações" />
    <section className="panel stack">
      <h2>Funcionamento</h2>
      {loading ? <LoadingState>Consultando o funcionamento…</LoadingState> : error
        ? <Notice>Não foi possível consultar o estado da loja.</Notice>
        : <StatusBadge tone={settings.open ? 'positive' : 'warning'}>{settings.open ? 'Loja aberta' : 'Loja fechada'}</StatusBadge>}
      <Notice>A gestão do funcionamento ficará disponível em uma próxima etapa.</Notice>
    </section>
    <section className="panel stack"><h2>Dados de pagamento</h2><Notice>O cadastro da configuração Pix ficará disponível em uma próxima etapa.</Notice></section>
  </section>
}
