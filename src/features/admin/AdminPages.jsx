import { PageHeading } from '../../components/ui'
import { AdminExistingOrder, ExistingOrders } from '../orders/ExistingOrders'

const pages = {
  orders: 'Visão geral',
  history: 'Histórico de pedidos',
}
export function AdminPage({ section = 'orders' }) {
  if (section === 'order') return <AdminExistingOrder />
  return <section className="stack">
    <PageHeading title={pages[section]} />
    <ExistingOrders admin />
  </section>
}
