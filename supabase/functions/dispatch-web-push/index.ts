import { createClient } from 'npm:@supabase/supabase-js@2.119.2'
import webpush from 'npm:web-push@3.6.7'
import { timingSafeEqual } from 'node:crypto'

const messages: Record<string, string> = {
  new_order: 'Chegou um novo pedido!',
  manual_review: 'O Pix expirou e o pedido precisa de revisão.',
  paid: 'Recebemos seu pagamento!',
  preparing: 'Estamos preparando seu pedido com carinho!',
  pickup: 'Seu pedido está prontinho para retirada!',
  delivery: 'Sua delícia está a caminho!',
  completed: 'Pedido concluído. Obrigada pela preferência!',
  canceled: 'Seu pedido foi cancelado. Se precisar, fale com a Biju’s Doce.',
  expired: 'O prazo do Pix terminou. Nossa equipe vai conferir seu pedido.',
  reward: 'Tem uma nova recompensa esperando por você!',
}

type Delivery = {
  event_id: string
  subscription_id: string
  lease: string
  endpoint: string | null
  p256dh: string
  auth_secret: string
  audience: 'admin' | 'customer' | 'guest'
  kind: string
  order_id: string | null
  started_preparing: boolean
}

const endpointPattern = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)?notify\.windows\.com|([a-z0-9-]+\.)?push\.apple\.com)\/[A-Za-z0-9_/?=.%:+&~-]+$/

function authorized(header: string | null) {
  const secret = Deno.env.get('WEB_PUSH_DISPATCH_SECRET')
  if (!secret || secret.length < 32 || !header) return false
  const encode = new TextEncoder()
  const expected = encode.encode('Bearer ' + secret)
  const actual = encode.encode(header)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

async function deliver(row: Delivery, vapidDetails: { subject: string; publicKey: string; privateKey: string }) {
  if (!row.endpoint || !endpointPattern.test(row.endpoint) || !Object.hasOwn(messages, row.kind)) return 'failed'
  const audience = row.audience === 'admin' ? 'admin' : 'customer'
  const url = row.kind === 'reward' ? '/perfil/fidelidade'
    : (audience === 'admin' ? '/admin/pedidos/' : '/pedido/') + row.order_id
  const body = messages[row.kind] + (row.started_preparing ? ' Já estamos preparando seu pedido!' : '')
  let details
  try {
    details = webpush.generateRequestDetails(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_secret } },
      JSON.stringify({ id: row.event_id, audience, body, url }),
      { vapidDetails, TTL: 3600, urgency: 'high', topic: row.event_id.replaceAll('-', '') },
    )
  } catch {
    return 'failed'
  }
  try {
    const response = await fetch(details.endpoint, {
      method: 'POST', headers: details.headers, body: details.body,
      redirect: 'error', signal: AbortSignal.timeout(8000),
    })
    void response.body?.cancel().catch(() => {})
    if (response.ok) return 'sent'
    if ([404, 410].includes(response.status)) return 'expired'
    return response.status === 429 || response.status >= 500 ? 'retry' : 'failed'
  } catch {
    return 'retry'
  }
}

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  if (!authorized(request.headers.get('Authorization'))) return new Response(null, { status: 401 })

  const subject = Deno.env.get('WEB_PUSH_VAPID_SUBJECT')
  const publicKey = Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY')
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default
  if (!subject || !publicKey || !privateKey || !url || !serviceRole) return new Response(null, { status: 503 })
  const client = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error: expiration } = await client.rpc('expire_pix_orders', { p_limit: 25 })
  const { data, error } = await client.rpc('claim_web_push')
  if (error) return new Response(null, { status: 503 })

  const rows = data as Delivery[]
  let errors = expiration ? 1 : 0
  for (let offset = 0; offset < rows.length; offset += 5) {
    await Promise.all(rows.slice(offset, offset + 5).map(async row => {
      const result = await deliver(row, { subject, publicKey, privateKey })
      const { error: finish } = await client.rpc('finish_web_push', {
        p_event: row.event_id, p_subscription: row.subscription_id, p_lease: row.lease, p_result: result,
      })
      if (finish) errors++
    }))
  }
  return Response.json({ processed: rows.length, errors }, { status: errors ? 503 : 200 })
})
