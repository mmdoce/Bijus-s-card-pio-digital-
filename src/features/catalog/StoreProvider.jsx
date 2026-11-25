import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const StoreContext = createContext(null)
const empty = { catalog: [], groups: [], areas: [], settings: { open: false } }

async function readStore() {
  const results = await Promise.all([
    supabase.from('categories').select('id,name').eq('available', true).order('display_order').order('name'),
    supabase.from('products').select('id,category_id,name,description,price_cents,image_path,size,available').eq('published', true).order('name'),
    supabase.from('delivery_areas').select('id,name,fee_cents').eq('available', true).order('name'),
    supabase.from('store_settings').select('is_open,contact_phone').single(),
  ])
  if (results.some(result => result.error)) throw new Error('Não foi possível consultar o cardápio.')
  const [groups, products, areas, settings] = results.map(result => result.data)
  const activeCategories = new Set(groups.map(group => group.id))
  return {
    groups,
    areas: areas.map(area => ({ ...area, fee: area.fee_cents })),
    catalog: products.filter(product => activeCategories.has(product.category_id)).map(product => ({
      ...product, category: product.category_id, price: product.price_cents,
      image: product.image_path ? supabase.storage.from('product-images').getPublicUrl(product.image_path).data.publicUrl : undefined,
    })),
    settings: { open: settings.is_open, contact: settings.contact_phone },
  }
}

export function StoreProvider({ children }) {
  const [state, setState] = useState({ ...empty, loading: Boolean(supabase), error: !supabase })
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => {
    if (!supabase) return
    setState(previous => ({ ...previous, loading: true, error: false }))
    setRevision(value => value + 1)
  }, [])

  useEffect(() => {
    window.addEventListener('focus', reload)
    return () => window.removeEventListener('focus', reload)
  }, [reload])

  useEffect(() => {
    if (!supabase) return
    let active = true
    readStore().then(
      data => { if (active) setState({ ...data, loading: false, error: false }) },
      () => { if (active) setState({ ...empty, loading: false, error: true }) },
    )
    return () => { active = false }
  }, [revision])

  return <StoreContext.Provider value={{ ...state, reload }}>{children}</StoreContext.Provider>
}

export function useStore() {
  return useContext(StoreContext)
}
