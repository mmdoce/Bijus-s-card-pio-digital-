import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useStore } from '../catalog/StoreProvider'

const CartContext = createContext(null)
const cartKey = 'bijus-cart'

function readCart() {
  try {
    const data = JSON.parse(localStorage.getItem(cartKey))
    return Object.fromEntries(Object.entries(data ?? {}).filter(([id, quantity]) =>
      /^[a-f0-9-]{36}$/i.test(id) && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 99))
  } catch {
    return {}
  }
}

export function CartProvider({ children }) {
  const [quantities, setQuantities] = useState(readCart)
  const [toast, setToast] = useState(null)
  const toastId = useRef(0)
  const { catalog, settings } = useStore()
  const items = catalog
    .filter(product => quantities[product.id] > 0)
    .map(product => ({ product, quantity: quantities[product.id] }))
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  const subtotal = items.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0)

  function changeQuantity(id, delta) {
    if (delta > 0 && (!settings.open || !catalog.some(product => product.id === id && product.active !== false && product.available))) return
    setQuantities(previous => {
      const next = { ...previous }
      const quantity = Math.min(99, (previous[id] ?? 0) + delta)
      if (quantity > 0) next[id] = quantity
      else delete next[id]
      return next
    })
    return true
  }

  useEffect(() => {
    try { localStorage.setItem(cartKey, JSON.stringify(quantities)) } catch {
      // A navegação da sessão ainda mantém os itens em memória.
    }
  }, [quantities])

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
