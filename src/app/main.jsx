import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { AppRoutes } from './routes'
import { CartProvider } from '../features/cart/CartProvider'
import { AuthProvider } from '../features/account/AuthProvider'
import { StoreProvider } from '../features/catalog/StoreProvider'
import '../styles/index.css'
import { startAudioUnlock } from '../lib/orderSound'

startAudioUnlock()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <StoreProvider>
          <CartProvider>
            <AppRoutes />
          </CartProvider>
        </StoreProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
