import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { NotificationInbox, NotificationProvider } from '../features/notifications/NotificationCenter'
import { revokeBrowserPush } from '../features/notifications/pushData'
import { Button } from '../components/ui'
import { authClient, authError } from '../lib/auth'

const menuUrl = import.meta.env.VITE_PUBLIC_MENU_URL

function MenuLink({ className }) {
  return menuUrl ? <a className={className} href={menuUrl}>Ver cardápio</a> : <Link className={className} to="/">Ver cardápio</Link>
}

const adminLinks = [
  ['', 'Pedidos'], ['financeiro', 'Financeiro'], ['produtos', 'Produtos'], ['categorias', 'Categorias'],
  ['bairros', 'Bairros e taxas'], ['historico', 'Histórico'], ['configuracoes', 'Configurações'],
]

export function AdminSidebar() {
  const [error, setError] = useState('')
  return <aside className="admin-sidebar">
    <Link className="wordmark" to="/admin">Biju’s Doce</Link>
    <nav aria-label="Painel administrativo">{adminLinks.map(([path, label]) => <NavLink key={path} end to={'/admin' + (path ? '/' + path : '')}>{label}</NavLink>)}</nav>
    <MenuLink className="admin-exit" />
    <Button secondary onClick={async () => {
      try {
        const client = authClient()
        await revokeBrowserPush(client).catch(() => {})
        const { error } = await client.auth.signOut({ scope: 'local' })
        if (error) throw error
      } catch (error) {
        setError(authError(error))
      }
    }}>Sair do painel</Button>
    {error && <p role="alert">{error}</p>}
  </aside>
}

export function AdminLayout({ panel = false }) {
  return panel ? <NotificationProvider audience="admin"><div className="admin-layout">
    <a className="skip-link" href="#admin-content">Ir para o conteúdo</a>
    <AdminSidebar />
    <main id="admin-content" className="admin-content">
      <NotificationInbox />
      <Outlet />
    </main>
  </div></NotificationProvider> : <>
    <header className="site-header"><div className="shell header-row"><Link className="wordmark" to="/admin/login">Biju’s Doce</Link><MenuLink /></div></header>
    <main className="shell content"><Outlet /></main>
  </>
}
