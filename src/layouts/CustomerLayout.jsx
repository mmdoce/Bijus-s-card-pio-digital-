import { Link, NavLink, Outlet } from 'react-router'
import { Button } from '../components/ui'
import { useCart } from '../features/cart/CartProvider'

function CustomerLinks({ count }) {
  return <>
    <NavLink to="/" end>Cardápio</NavLink>
    <NavLink to="/perfil">Minha conta</NavLink>
    <NavLink className="cart-link" to="/carrinho">Carrinho <span aria-live="polite">{count}</span></NavLink>
  </>
}

export function CustomerBottomNav({ count }) {
  return <nav className="bottom-nav" aria-label="Navegação principal"><CustomerLinks count={count} /></nav>
}

export function CustomerLayout() {
  const { count, toast, dismissToast } = useCart()
  return <div className="customer-layout">
    <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
    <header className="site-header">
      <div className="shell header-row">
        <Link className="wordmark" to="/">Biju’s Doce</Link>
        <nav className="desktop-nav" aria-label="Navegação principal"><CustomerLinks count={count} /></nav>
      </div>
    </header>
    <main id="conteudo" className="shell content"><Outlet /></main>
    <footer className="shell footer"><span>Biju’s Doce</span></footer>
    <CustomerBottomNav count={count} />
    <div className={toast ? 'cart-toast' : undefined}>
      <div role="status">{toast && <span key={toast.id}><span className="toast-check" aria-hidden="true">✓</span> {toast.product} no carrinho.</span>}</div>
      {toast && <Button secondary aria-label="Fechar confirmação do carrinho" onClick={dismissToast}>×</Button>}
    </div>
  </div>
}
