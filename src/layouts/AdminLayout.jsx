import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router'
import { Button } from '../components/ui'
import { useDemoStore } from '../mocks/DemoStore'

const menuUrl = import.meta.env.VITE_PUBLIC_MENU_URL

function MenuLink({ className }) {
  return menuUrl ? <a className={className} href={menuUrl}>Ver cardápio</a> : <Link className={className} to="/">Ver cardápio</Link>
}

const adminLinks = [
  ['', 'Pedidos'], ['produtos', 'Produtos'], ['categorias', 'Categorias'],
  ['bairros', 'Bairros e taxas'], ['historico', 'Histórico'], ['configuracoes', 'Configurações'],
]

export function AdminSidebar() {
  const { adminLogout, enableSound, soundEnabled } = useDemoStore()
  const [soundError, setSoundError] = useState('')
  return <aside className="admin-sidebar">
    <Link className="wordmark" to="/admin">Biju’s Doce</Link>
    <nav aria-label="Painel demonstrativo">{adminLinks.map(([path, label]) => <NavLink key={path} end to={'/admin' + (path ? '/' + path : '')}>{label}</NavLink>)}</nav>
    <MenuLink className="admin-exit" />
    <Button secondary disabled={soundEnabled} onClick={async () => {
      try {
        await enableSound()
        setSoundError('')
      } catch {
        setSoundError('O navegador bloqueou a reprodução do alerta.')
      }
    }}>{soundEnabled ? 'Som ativado' : 'Ativar alerta sonoro'}</Button>
    {soundError && <p role="alert">{soundError}</p>}
    <Button secondary onClick={adminLogout}>Sair do painel</Button>
  </aside>
}

export function AdminLayout({ demo = false }) {
  const { newOrders, dismissNewOrders } = useDemoStore()
  return demo ? <div className="admin-layout">
    <a className="skip-link" href="#admin-content">Ir para o conteúdo</a>
    <AdminSidebar />
    <main id="admin-content" className="admin-content">
      <p className="demo-label">Painel demonstrativo · alterações temporárias</p>
      {newOrders > 0 && <div className="notice line-item">
        <p role="alert">{newOrders === 1 ? '1 novo pedido' : `${newOrders} novos pedidos`}</p>
        <Button secondary onClick={dismissNewOrders}>Dispensar aviso</Button>
      </div>}
      <Outlet />
    </main>
  </div> : <>
    <header className="site-header"><div className="shell header-row"><Link className="wordmark" to="/admin/login">Biju’s Doce</Link><MenuLink /></div></header>
    <main className="shell content"><Outlet /></main>
  </>
}
