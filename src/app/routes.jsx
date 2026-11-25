import { Route, Routes } from 'react-router'
import { ActionLink, PageHeading } from '../components/ui'
import { AuthPage, ConfirmEmailPage, PasswordResetPage, ProfilePage } from '../features/account/AccountPages'
import { CustomerAccess } from '../features/account/AuthProvider'
import { AdminAccess, AdminLogin } from '../features/admin/AdminAccess'
import { AdminPage } from '../features/admin/AdminPages'
import { AdminSettings } from '../features/admin/AdminSettings'
import { AdminAreas } from '../features/admin/AdminAreas'
import { AdminCatalog } from '../features/admin/AdminCatalog'
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
        <Route path="confirmar-email" element={<ConfirmEmailPage />} />
        <Route path="redefinir-senha" element={<PasswordResetPage />} />
        <Route element={<CustomerAccess />}>
          <Route path="perfil" element={<ProfilePage />} />
          <Route path="perfil/pedidos" element={<ProfilePage section="orders" />} />
          <Route path="perfil/fidelidade" element={<ProfilePage section="loyalty" />} />
        </Route>
        <Route path="*" element={<><PageHeading title="Página não encontrada" /><ActionLink to="/">Voltar ao cardápio</ActionLink></>} />
      </Route>
      <Route path="admin" element={<AdminLayout />}>
        <Route path="login" element={<AdminLogin />} />
        <Route path="redefinir-senha" element={<PasswordResetPage admin />} />
      </Route>
      <Route path="admin" element={<AdminAccess />}>
        <Route element={<AdminLayout panel />}>
          <Route index element={<AdminPage />} />
          <Route path="pedidos/:id" element={<AdminPage section="order" />} />
          <Route path="produtos" element={<AdminCatalog key="products" section="products" />} />
          <Route path="categorias" element={<AdminCatalog key="categories" section="categories" />} />
          <Route path="bairros" element={<AdminAreas />} />
          <Route path="historico" element={<AdminPage section="history" />} />
          <Route path="configuracoes" element={<AdminSettings />} />
          <Route path="*" element={<ActionLink to="/admin">Voltar aos pedidos</ActionLink>} />
        </Route>
      </Route>
    </Routes>
  )
}
