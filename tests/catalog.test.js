import assert from 'node:assert/strict'
import { test } from 'node:test'
import { categoryInput, isRewardProduct, maxImageSize, priceInCents, priceInput, productInput, saveProduct, validateProductImage } from '../src/features/admin/catalogData.js'

const png = new File([Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)], 'foto.png', { type: 'image/png' })

test('Preço em reais vira centavos exatos e respeita o intervalo do banco', () => {
  for (const [input, cents] of [['0', 0], ['0,01', 1], ['19,9', 1990], ['29.90', 2990], ['1.234,56', 123456], ['99.999,99', 9999999]]) {
    assert.equal(priceInCents(input), cents)
    assert.equal(priceInCents(priceInput(cents)), cents)
  }
  for (const invalid of ['', '-1,00', '14,999', '100.000,00', '1e3']) assert.throws(() => priceInCents(invalid))
})

test('Formulários usam somente os campos existentes e recompensa independe do nome', () => {
  const category = new FormData()
  category.set('name', ' Sobremesas ')
  category.set('display_order', '2')
  assert.deepEqual(categoryInput(category), { name: 'Sobremesas', display_order: 2, available: false })
  category.set('display_order', '2147483648')
  assert.throws(() => categoryInput(category))
  const input = new FormData()
  Object.entries({ name: 'Garrafa', description: 'Descrição', category_id: 'categoria', price: '14,90', size: '300 ml', published: 'on', earns_stamps: 'on' })
    .forEach(([key, value]) => input.set(key, value))
  const product = productInput(input)
  assert.deepEqual(product, { name: 'Garrafa', description: 'Descrição', category_id: 'categoria', price_cents: 1490,
    size: '300 ml', published: true, available: false, earns_stamps: true })
  assert.ok(isRewardProduct(product))
  assert.ok(!isRewardProduct({ name: 'Açaí 300 ml', size: '500 ml', earns_stamps: true }))
  assert.ok(!isRewardProduct({ ...product, earns_stamps: false }))
})

test('Imagem precisa ter formato, assinatura e tamanho válidos', async () => {
  await validateProductImage(png)
  await assert.rejects(validateProductImage(new File(['abc'], 'foto.svg', { type: 'image/svg+xml' })), /JPEG/)
  await assert.rejects(validateProductImage(new File(['abc'], 'foto.webp', { type: 'image/webp' })), /conteúdo/)
  await assert.rejects(validateProductImage(new File([new Uint8Array(maxImageSize + 1)], 'foto.png', { type: 'image/png' })), /5 MiB/)
})

function fixture({ error = null, saved = null } = {}) {
  const calls = []
  const storage = {
    upload: async (path, file, options) => { calls.push(['upload', path, options]); return {} },
    remove: async paths => { calls.push(['remove', paths[0]]); return { data: [] } },
  }
  const table = {
    update: values => { calls.push(['update', values]); return table },
    insert: values => { calls.push(['insert', values]); return table },
    eq: (field, value) => { calls.push(['eq', field, value]); return table },
    is: (field, value) => { calls.push(['is', field, value]); return table },
    select: () => table,
    single: async () => ({ error }),
    maybeSingle: async () => ({ data: saved }),
  }
  return { calls, client: { storage: { from: () => storage }, from: () => table } }
}

test('Substituição usa caminho único, sem sobrescrever, e só limpa a foto anterior após salvar', async () => {
  const { calls, client } = fixture()
  await saveProduct(client, { id: 'produto', image_path: 'products/anterior.png' }, { name: 'Produto' }, png, () => 'novo')
  assert.deepEqual(calls, [
    ['upload', 'products/novo.png', { upsert: false, contentType: 'image/png' }],
    ['update', { name: 'Produto', image_path: 'products/novo.png' }],
    ['eq', 'id', 'produto'], ['eq', 'image_path', 'products/anterior.png'], ['remove', 'products/anterior.png'],
  ])
})

test('Falha confirmada remove só o upload novo e resultado incerto preserva a imagem', async () => {
  const duplicate = fixture({ error: { code: '23505' } })
  await assert.rejects(saveProduct(duplicate.client, null, { name: 'Produto' }, png, () => 'novo'))
  assert.deepEqual(duplicate.calls.at(-1), ['remove', 'products/novo.png'])
  const concurrent = fixture({ error: { code: 'PGRST116' } })
  await assert.rejects(saveProduct(concurrent.client, { id: 'p' }, {}, png, () => 'novo'), /mudou/)
  assert.deepEqual(concurrent.calls.at(-1), ['remove', 'products/novo.png'])
  const ambiguous = fixture({ error: { code: '' } })
  await assert.rejects(saveProduct(ambiguous.client, null, {}, png, () => 'novo'), /foto pode precisar de revisão/)
  assert.ok(!ambiguous.calls.some(([action]) => action === 'remove'))
})
