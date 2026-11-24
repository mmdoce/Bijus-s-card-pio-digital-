import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createOrderSound } from '../lib/orderSound'
import { isFinalOrder, isPrivateTrackingToken, observeOrderChanges, readTrackingSession, trackedOrders, writeTrackingSession } from '../lib/orderTracking'
import { createOrder, expireOrder, loyaltyBalance, updateOrder } from '../lib/orders'
import { createDemoPixService } from '../lib/pix'
import { categories, exampleOrder, neighborhoods, products, storeSettings } from './store'

const DemoStoreContext = createContext(null)
const storeKey = 'bijus-demo-store-open'

function storeOpen() {
  return (localStorage.getItem(storeKey) ?? String(storeSettings.open)) === 'true'
}

async function passwordDigest(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2', hash: 'SHA-256', iterations: 100_000, salt: new TextEncoder().encode(salt),
  }, key, 256)
  return Array.from(new Uint8Array(bits)).join(',')
}

export function DemoStoreProvider({ children }) {
  const [catalog, setCatalog] = useState(products)
  const [groups, setGroups] = useState(categories)
  const [areas, setAreas] = useState(neighborhoods)
  const [settings, setSettings] = useState(() => ({ ...storeSettings, open: storeOpen() }))
  const [orders, setOrders] = useState([exampleOrder])
  const currentOrders = useRef(orders)
  const accounts = useRef([])
  const [profile, setProfile] = useState(null)
  const [admin, setAdmin] = useState(false)
  const [adminSound] = useState(() => createOrderSound({ notes: [660, 880], duration: 0.4 }))
  const [customerSound] = useState(() => createOrderSound({ notes: [523, 659], duration: 0.28 }))
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [customerSoundEnabled, setCustomerSoundEnabled] = useState(false)
  const [newOrders, setNewOrders] = useState(0)
  const [tracking, setTracking] = useState(readTrackingSession)
  const [pixService] = useState(createDemoPixService)
  const previousTracking = useRef(new Map())
  const customerOrders = useMemo(() => trackedOrders(orders, profile?.id, tracking.tokens), [orders, profile?.id, tracking.tokens])

  function commitOrders(next) {
    currentOrders.current = next
    setOrders(next)
  }

  useEffect(() => {
    function syncStore(event) {
      if (event.key === storeKey || event.key === null) setSettings(previous => ({ ...previous, open: storeOpen() }))
    }
    window.addEventListener('storage', syncStore)
    const timer = setInterval(() => {
      const now = Date.now()
      const next = currentOrders.current.map(order => expireOrder(order, now))
      if (next.some((order, index) => order !== currentOrders.current[index])) commitOrders(next)
    }, 1000)
    return () => {
      clearInterval(timer)
      window.removeEventListener('storage', syncStore)
    }
  }, [])

  useEffect(() => {
    writeTrackingSession(tracking)
  }, [tracking])

  useEffect(() => {
    const { snapshot, changed } = observeOrderChanges(previousTracking.current, customerOrders)
    previousTracking.current = snapshot
    if (changed) customerSound.play()
  }, [customerOrders, customerSound])

  const requireAdmin = useCallback(() => {
    if (!import.meta.env.DEV || !admin) throw new Error('Acesso administrativo demonstrativo necessário.')
  }, [admin])

  const readPixReceiver = useCallback(() => {
    requireAdmin()
    return pixService.readReceiver()
  }, [pixService, requireAdmin])

  const followGuestOrder = useCallback(token => {
    if (!isPrivateTrackingToken(token) || !currentOrders.current.some(order => order.token === token && !order.accountId)) return
    setTracking(previous => previous.tokens.includes(token) ? previous : { ...previous, tokens: [...previous.tokens, token] })
  }, [])

  function save(collection, entry) {
    requireAdmin()
    const update = { catalog: setCatalog, groups: setGroups, areas: setAreas }[collection]
    update(entries => entries.some(item => item.id === entry.id)
      ? entries.map(item => item.id === entry.id ? entry : item)
      : [...entries, entry])
  }

  function setOpen(open) {
    requireAdmin()
    localStorage.setItem(storeKey, String(open))
    setSettings(previous => ({ ...previous, open }))
  }

  function placeOrder(input) {
    const now = Date.now()
    const current = currentOrders.current.map(order => expireOrder(order, now))
    const order = createOrder(input, {
      catalog, areas, orders: current, open: storeOpen(), accountId: profile?.id ?? null,
      now, id: crypto.randomUUID(), token: crypto.randomUUID(),
    })
    if (order.expiresAt) order.pixPayload = pixService.createCharge(order)
    commitOrders([...current, order])
    if (!order.accountId) followGuestOrder(order.token)
    if (import.meta.env.DEV) {
      setNewOrders(count => count + 1)
      adminSound.play()
    }
    return order
  }

  function changeOrder(id, action) {
    requireAdmin()
    const current = currentOrders.current.find(order => order.id === id)
    if (!current) throw new Error('Pedido indisponível.')
    const next = updateOrder(current, action, currentOrders.current, Date.now())
    commitOrders(currentOrders.current.map(order => order.id === id ? next : order))
    return next
  }

  async function authenticate({ email, password, fields }) {
    const existing = accounts.current.find(account => account.profile.email === email)
    if (fields) {
      const id = crypto.randomUUID()
      const digest = await passwordDigest(password, id)
      if (accounts.current.some(account => account.profile.email === email)) throw new Error('Já existe uma conta local com esse e-mail.')
      const next = { ...fields, id, email }
      accounts.current.push({ profile: next, digest })
      setProfile(next)
    } else {
      if (!existing || await passwordDigest(password, existing.profile.id) !== existing.digest) throw new Error('E-mail ou senha inválidos.')
      setProfile(existing.profile)
    }
  }

  function saveProfile(fields) {
    const account = accounts.current.find(item => item.profile.id === profile?.id)
    if (!account) throw new Error('Entre na sua conta para salvar os dados.')
    account.profile = { ...fields, id: account.profile.id, email: account.profile.email }
    setProfile(account.profile)
  }

  function adminLogin(email, password) {
    const allowed = import.meta.env.DEV && email === 'admin@demo.invalid' && password === 'BijuDemo123!'
    if (allowed) setAdmin(true)
    return allowed
  }

  async function enableSound() {
    requireAdmin()
    setSoundEnabled(await adminSound.enable())
  }

  async function toggleCustomerSound() {
    if (customerSoundEnabled) {
      customerSound.disable()
      setCustomerSoundEnabled(false)
    } else if (await customerSound.enable()) {
      setCustomerSoundEnabled(true)
    } else {
      throw new Error('O áudio está bloqueado.')
    }
  }

  const value = {
    catalog, groups, areas, settings, admin, adminLogin, adminLogout: () => {
      adminSound.disable()
      setSoundEnabled(false)
      setAdmin(false)
    },
    readPixReceiver, savePixReceiver: fields => { requireAdmin(); pixService.saveReceiver(fields) },
    soundEnabled, enableSound, newOrders: admin ? newOrders : 0,
    customerSoundEnabled, toggleCustomerSound, followGuestOrder,
    activeOrders: customerOrders.filter(order => !isFinalOrder(order) || !tracking.dismissed.includes(order.id)).reverse(),
    dismissOrder: id => {
      if (customerOrders.some(order => order.id === id && isFinalOrder(order))) {
        setTracking(previous => previous.dismissed.includes(id) ? previous : { ...previous, dismissed: [...previous.dismissed, id] })
      }
    },
    dismissNewOrders: () => { requireAdmin(); setNewOrders(0) },
    adminOrders: admin ? orders : [],
    findOrder: token => orders.find(order => order.token === token && (!order.accountId || order.accountId === profile?.id)),
    profile, authenticate, logout: () => setProfile(null), saveProfile,
    myOrders: profile ? orders.filter(order => order.accountId === profile.id) : [],
    balance: profile ? loyaltyBalance(orders, profile.id) : 0,
    save, setOpen, setContact: contact => {
      requireAdmin()
      setSettings(previous => ({ ...previous, contact }))
    }, placeOrder, changeOrder,
  }
  return <DemoStoreContext.Provider value={value}>{children}</DemoStoreContext.Provider>
}

export function useDemoStore() {
  return useContext(DemoStoreContext)
}
