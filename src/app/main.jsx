import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { AppRoutes } from './routes'
import { CartProvider } from '../features/cart/CartProvider'
import { DemoStoreProvider } from '../mocks/DemoStore'
import '../styles/index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <DemoStoreProvider>
        <CartProvider>
          <AppRoutes />
        </CartProvider>
      </DemoStoreProvider>
    </BrowserRouter>
  </StrictMode>,
)
