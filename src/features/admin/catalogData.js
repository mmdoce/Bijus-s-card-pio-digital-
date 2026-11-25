export const imageTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const maxImageSize = 5 * 1024 * 1024
class CatalogInputError extends Error {}

export function priceInCents(value) {
  const input = value?.trim() ?? ''
  const normalized = /^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(input) ? input.replaceAll('.', '') : input
  const parts = /^(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(normalized)
  if (!parts) throw new CatalogInputError('Informe um preço entre R$ 0,00 e R$ 99.999,99, com até duas casas decimais.')
  return Number(parts[1]) * 100 + Number((parts[2] ?? '').padEnd(2, '0'))
}

export function priceInput(cents) {
  return Math.trunc(cents / 100) + ',' + String(cents % 100).padStart(2, '0')
}

function requiredText(value, max, label) {
  const text = value?.trim()
  if (!text || text.length > max) throw new CatalogInputError(`Informe ${label}, com até ${max} caracteres.`)
  return text
}

export function categoryInput(form) {
  const order = form.get('display_order')
  if (!/^\d+$/.test(order) || Number(order) > 2147483647) throw new CatalogInputError('A ordem deve ser um número inteiro de 0 a 2.147.483.647.')
  return { name: requiredText(form.get('name'), 100, 'o nome da categoria'), display_order: Number(order), available: form.has('available') }
}

export function productInput(form) {
  const size = form.get('size')?.trim() || null
  if (size && size.length > 40) throw new CatalogInputError('Informe um tamanho com até 40 caracteres.')
  return {
    name: requiredText(form.get('name'), 100, 'o nome do produto'),
    description: requiredText(form.get('description'), 500, 'a descrição do produto'),
    category_id: requiredText(form.get('category_id'), 36, 'a categoria do produto'),
    price_cents: priceInCents(form.get('price')),
    size, published: form.has('published'), available: form.has('available'), earns_stamps: form.has('earns_stamps'),
  }
}

export function isRewardProduct(product) {
  return Boolean(product.earns_stamps && /^300\s*ml$/i.test(product.size?.trim() ?? ''))
}

export async function validateProductImage(file) {
  if (!Object.hasOwn(imageTypes, file.type)) throw new CatalogInputError('Selecione uma imagem JPEG, PNG ou WebP.')
  if (!file.size || file.size > maxImageSize) throw new CatalogInputError('A imagem deve ter entre 1 byte e 5 MiB.')
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const matches = (signature, offset = 0) => signature.every((byte, index) => header[index + offset] === byte)
  const isValid = file.type === 'image/jpeg' ? matches([255, 216, 255])
    : file.type === 'image/png' ? matches([137, 80, 78, 71, 13, 10, 26, 10])
      : matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8)
  if (!isValid) throw new CatalogInputError('O conteúdo da imagem não corresponde ao formato do arquivo.')
}

export function catalogError(error) {
  if (error instanceof CatalogInputError) return error.message
  if (error?.code === '23505') return 'Já existe um cadastro com esse nome.'
  if (['23503', '23001'].includes(error?.code)) return 'Há registros vinculados. Atualize a lista ou desative o cadastro.'
  if (error?.code === '42501' || ['401', '403'].includes(String(error?.statusCode ?? error?.status))) {
    return 'A operação não está autorizada. Confira sua sessão e as permissões do painel.'
  }
  return 'Não foi possível concluir a operação. Confira a conexão e atualize a lista antes de tentar novamente.'
}

export async function readAdminCatalog(client) {
  const results = await Promise.all([
    client.from('categories').select('id,name,display_order,available').order('display_order').order('name'),
    client.from('products').select('id,category_id,name,description,price_cents,size,image_path,available,published,earns_stamps').order('name'),
    client.from('store_settings').select('id,reward_product_id').single(),
  ])
  const failure = results.find(result => result.error)
  if (failure) throw failure.error
  return { categories: results[0].data, products: results[1].data, store: results[2].data }
}

export async function saveCategory(client, id, fields) {
  const table = client.from('categories')
  const query = id ? table.update(fields).eq('id', id) : table.insert(fields)
  const { error } = await query.select('id').single()
  if (error) throw error
}

export async function deleteCategory(client, id) {
  const { error } = await client.from('categories').delete().eq('id', id).select('id').single()
  if (error?.code === '42501') throw new CatalogInputError('A exclusão está indisponível neste ambiente. Você pode desativar a categoria.')
  if (['23503', '23001'].includes(error?.code)) throw new CatalogInputError('A categoria possui produtos vinculados. Desative a categoria para ocultá-la do cardápio.')
  if (error) throw error
}

export async function setRewardProduct(client, storeId, product) {
  if (product && !isRewardProduct(product)) throw new CatalogInputError('Selecione um produto elegível com tamanho 300 ml.')
  const { error } = await client.from('store_settings').update({ reward_product_id: product?.id ?? null })
    .eq('id', storeId).select('id').single()
  if (error) throw error
}

async function discardImage(bucket, path) {
  try {
    await bucket.remove([path])
  } catch {
    // O caminho pode continuar protegido pelo histórico ou precisar de revisão operacional.
  }
}

export async function saveProduct(client, product, fields, file, newPath = () => crypto.randomUUID()) {
  const bucket = client.storage.from('product-images')
  const previousPath = product?.image_path
  let uploadedPath
  if (file) {
    await validateProductImage(file)
    uploadedPath = 'products/' + newPath() + '.' + imageTypes[file.type]
    const { error } = await bucket.upload(uploadedPath, file, { upsert: false, contentType: file.type })
    if (error) throw new CatalogInputError('Não foi possível enviar a foto. Confira o formato, o tamanho e sua conexão.')
  }

  const table = client.from('products')
  const values = uploadedPath ? { ...fields, image_path: uploadedPath } : fields
  let query = product ? table.update(values).eq('id', product.id) : table.insert(values)
  if (product && uploadedPath) query = previousPath ? query.eq('image_path', previousPath) : query.is('image_path', null)
  const { error } = await query.select('id').single()
  if (error) {
    if (product && uploadedPath && error.code === 'PGRST116') {
      await discardImage(bucket, uploadedPath)
      throw new CatalogInputError('O produto ou a foto mudou desde que o formulário foi aberto. Atualize a lista antes de tentar novamente.')
    }
    if (uploadedPath && /^[0-9A-Z]{5}$/.test(error.code ?? '')) await discardImage(bucket, uploadedPath)
    else if (uploadedPath) {
      const check = await client.from('products').select('id').eq('image_path', uploadedPath).maybeSingle()
      if (check.data) {
        if (previousPath) await discardImage(bucket, previousPath)
        return
      }
      throw new CatalogInputError('Não foi possível confirmar o cadastro. Recarregue a lista antes de tentar novamente. A foto pode precisar de revisão.')
    }
    throw error
  }

  if (uploadedPath && previousPath) await discardImage(bucket, previousPath)
}
