import { Route, Routes } from 'react-router'
import { ActionLink, PageHeading } from '../components/ui'
import { AuthPage, ProfilePage } from '../features/account/AccountPages'
import { AdminAccess, AdminLogin } from '../features/admin/AdminAccess'
import { AdminCollection, AdminDashboard, AdminOrderDetail, AdminSettings } from '../features/admin/AdminDemo'
import { CartPage } from '../features/cart/CartPage'
import { CatalogPage, ProductPage } from '../features/catalog/CatalogPage'
import { CheckoutPage } from '../features/checkout/CheckoutPage'
import { OrderPage } from '../features/orders/OrderPages'
import { AdminLayout } from '../layouts/AdminLayout'
import { CustomerLayout } from '../layouts/CustomerLayout'

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<CustomerLayout />}>
        <Route index element={<CatalogPage />} />
        <Route path="produto/:id" element={<ProductPage />} />
        <Route path="carrinho" element={<CartPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="pagamento/:token" element={<OrderPage payment />} />
        <Route path="pedido/:token" element={<OrderPage />} />
        <Route path="login" element={<AuthPage key="login" title="Entrar" />} />
        <Route path="cadastro" element={<AuthPage key="register" title="Criar conta" />} />
        <Route path="recuperar-senha" element={<AuthPage key="recovery" title="Recuperar senha" />} />
        <Route path="perfil" element={<ProfilePage />} />
        <Route path="perfil/pedidos" element={<ProfilePage section="orders" />} />
        <Route path="perfil/fidelidade" element={<ProfilePage section="loyalty" />} />
        <Route path="*" element={<><PageHeading title="Página não encontrada" /><ActionLink to="/">Voltar ao cardápio</ActionLink></>} />
      </Route>
      <Route path="admin" element={<AdminLayout />}>
        <Route path="login" element={<AdminLogin />} />
      </Route>
      <Route path="admin" element={<AdminAccess />}>
        {import.meta.env.DEV && <Route element={<AdminLayout demo />}>
          <Route index element={<AdminDashboard />} />
          <Route path="pedidos/:id" element={<AdminOrderDetail />} />
          <Route path="produtos" element={<AdminCollection key="catalog" collection="catalog" />} />
          <Route path="categorias" element={<AdminCollection key="groups" collection="groups" />} />
          <Route path="bairros" element={<AdminCollection key="areas" collection="areas" />} />
          <Route path="historico" element={<AdminDashboard history />} />
          <Route path="configuracoes" element={<AdminSettings />} />
        </Route>}
        <Route path="*" element={<ActionLink to="/admin">Voltar aos pedidos</ActionLink>} />
      </Route>
    </Routes>
  )
}
