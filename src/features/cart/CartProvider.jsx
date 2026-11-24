import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useDemoStore } from '../../mocks/DemoStore'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [quantities, setQuantities] = useState({})
  const [toast, setToast] = useState(null)
  const toastId = useRef(0)
  const { catalog, settings } = useDemoStore()
  const items = catalog
    .filter(product => quantities[product.id] > 0)
    .map(product => ({ product, quantity: quantities[product.id] }))
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = items.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0)

  function changeQuantity(id, delta) {
    if (delta > 0 && (!settings.open || !catalog.some(product => product.id === id && product.active !== false && product.available))) return
    setQuantities(previous => {
      const next = { ...previous }
      const quantity = (previous[id] ?? 0) + delta
      if (quantity > 0) next[id] = quantity
      else delete next[id]
      return next
    })
    return true
  }

  function addProduct(id, quantity) {
    if (quantity > 0 && changeQuantity(id, quantity)) {
      setToast({ id: ++toastId.current, product: catalog.find(item => item.id === id).name })
    }
  }

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(current => current === toast ? null : current), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  return <CartContext.Provider value={{ items, count, subtotal, changeQuantity, addProduct, toast, dismissToast: () => setToast(null), clear: () => setQuantities({}) }}>{children}</CartContext.Provider>
}

export function useCart() {
  return useContext(CartContext)
}
