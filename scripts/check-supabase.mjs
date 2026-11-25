import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { readSupabaseConfig } from '../src/lib/supabase.js'

async function check() {
  let env
  try {
    env = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'))
  } catch {
    console.error('Crie o .env.local usando os campos do .env.example.')
    return 1
  }

  const config = readSupabaseConfig(env)
  if (!config) {
    console.error('Preencha VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.local. Use a chave com prefixo sb_publishable_.')
    return 1
  }

  try {
    const response = await fetch(new URL('/auth/v1/settings', config.url), {
      headers: { apikey: config.publishableKey },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    })
    if (response.ok) {
      console.log(`Supabase Auth respondeu HTTP ${response.status} em ${new URL(config.url).host}.`)
      return 0
    }
    console.error(`Supabase respondeu HTTP ${response.status}. Confira a URL e a Publishable Key do mesmo projeto.`)
  } catch {
    console.error('Falha de comunicação com o Supabase. Confira a conectividade, o DNS e os certificados da rede.')
  }
  return 1
}

process.exitCode = await check()
