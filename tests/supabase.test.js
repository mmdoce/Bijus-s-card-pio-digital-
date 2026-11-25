import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readSupabaseConfig, supabase } from '../src/lib/supabase.js'

const vars = {
  VITE_SUPABASE_URL: 'https://example.supabase.co/',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
}

test('Cliente aceita uma URL HTTPS e chave publicável e fica indisponível sem ambiente Vite', () => {
  assert.equal(supabase, null)
  assert.deepEqual(readSupabaseConfig(vars), {
    url: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_example',
  })
  assert.ok(readSupabaseConfig({ ...vars, VITE_SUPABASE_URL: 'http://127.0.0.1:54321' }))
})

test('Configuração ausente, chave privilegiada e endpoint inseguro são rejeitados', () => {
  assert.equal(readSupabaseConfig(), null)
  assert.equal(readSupabaseConfig({ ...vars, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_example' }), null)
  assert.equal(readSupabaseConfig({ ...vars, VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJ.example.payload' }), null)
  assert.equal(readSupabaseConfig({ ...vars, VITE_SUPABASE_URL: 'http://example.supabase.co' }), null)
  assert.equal(readSupabaseConfig({ ...vars, VITE_SUPABASE_URL: 'https://user:pass@example.supabase.co' }), null)
})
