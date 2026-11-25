import { createClient } from '@supabase/supabase-js'

export function readSupabaseConfig(env = {}) {
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey } = env
  const key = publishableKey?.trim()
  if (!url?.trim() || !key || !/^sb_publishable_[\w-]+$/.test(key)) return null

  let endpoint
  try {
    endpoint = new URL(url.trim())
  } catch {
    return null
  }

  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
  const allowedProtocol = endpoint.protocol === 'https:' || (endpoint.protocol === 'http:' && loopback)
  if (!allowedProtocol || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) return null

  return { url: endpoint.origin, publishableKey: key }
}

const config = readSupabaseConfig(import.meta.env)

export const supabase = config ? createClient(config.url, config.publishableKey, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export function supabaseForSession(accessToken) {
  return createClient(config.url, config.publishableKey, { accessToken: async () => accessToken })
}
