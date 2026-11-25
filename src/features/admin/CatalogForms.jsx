import { useEffect, useRef, useState } from 'react'
import { Button, FormField, LoadingState, Modal } from '../../components/ui'
import { ProductMedia } from '../catalog/CatalogPage'
import { categoryInput, imageTypes, isRewardProduct, priceInput, productInput, validateProductImage } from './catalogData'

function Feedback({ message }) {
  return message && <p className="notice" role="alert">{message}</p>
}

export function CategoryForm({ category, busy, error, onClose, onSave }) {
  const [validation, setValidation] = useState('')
  function submit(event) {
    event.preventDefault()
    setValidation('')
    try { onSave(categoryInput(new FormData(event.currentTarget))) }
    catch (failure) { setValidation(failure.message) }
  }
  return <Modal title={category?.id ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}>
    <form className="stack" onSubmit={submit}>
      <FormField label="Nome"><input name="name" maxLength={100} defaultValue={category?.name} required autoFocus /></FormField>
      <FormField label="Ordem de exibição"><input name="display_order" type="number" min="0" max="2147483647" step="1" defaultValue={category?.display_order ?? 0} required /></FormField>
      <label className="choice"><input type="checkbox" name="available" defaultChecked={category?.available ?? true} /> Categoria ativa</label>
      <Feedback message={validation || error} />
      <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar categoria'}</Button>
    </form>
  </Modal>
}

function useImagePreview() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [validating, setValidating] = useState(false)
  const [imageError, setImageError] = useState('')
  const selection = useRef(0)

  useEffect(() => () => { selection.current++ }, [])
  useEffect(() => {
    if (!file) { setPreview(''); return }
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  async function choose(candidate) {
    const version = ++selection.current
    setFile(null)
    setImageError('')
    setValidating(Boolean(candidate))
    if (!candidate) return
    try {
      await validateProductImage(candidate)
      const objectUrl = URL.createObjectURL(candidate)
      try {
        const image = new Image()
        image.src = objectUrl
        await image.decode()
      } catch {
        throw new Error('Não foi possível abrir essa imagem. Selecione outro arquivo.')
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
      if (selection.current === version) setFile(candidate)
    } catch (failure) {
      if (selection.current === version) setImageError(failure.message)
    } finally {
      if (selection.current === version) setValidating(false)
    }
  }

  return { file, preview, validating, imageError, choose }
}

export function ProductForm({ product, categories, currentImage, isReward, busy, error, onClose, onSave }) {
  const image = useImagePreview()
  const [validation, setValidation] = useState('')
  function submit(event) {
    event.preventDefault()
    if (image.validating || image.imageError) return
    setValidation('')
    try {
      const fields = productInput(new FormData(event.currentTarget))
      if (isReward && !isRewardProduct(fields)) throw new Error('Desvincule o produto da recompensa antes de mudar seu tamanho ou sua elegibilidade.')
      onSave(fields, image.file)
    } catch (failure) { setValidation(failure.message) }
  }
  return <Modal title={product?.id ? 'Editar produto' : 'Novo produto'} onClose={onClose}>
    <form className="stack" onSubmit={submit}>
      <FormField label="Nome"><input name="name" maxLength={100} defaultValue={product?.name} required autoFocus /></FormField>
      <FormField label="Descrição"><textarea name="description" maxLength={500} rows={3} defaultValue={product?.description} required /></FormField>
      <FormField label="Categoria"><select name="category_id" defaultValue={product?.category_id ?? ''} required>
        <option value="" disabled>Selecione uma categoria</option>
        {categories.map(category => <option key={category.id} value={category.id}>{category.name}{category.available ? '' : ' (desativada)'}</option>)}
      </select></FormField>
      <div className="field-grid">
        <FormField label="Preço em reais"><input name="price" inputMode="decimal" maxLength={12} placeholder="0,00" defaultValue={product ? priceInput(product.price_cents) : ''} required /></FormField>
        <FormField label="Tamanho ou volume"><input name="size" maxLength={40} placeholder="Ex.: 300 ml" defaultValue={product?.size ?? ''} /></FormField>
      </div>
      <div className="image-preview"><ProductMedia product={{ name: product?.name ?? 'Prévia do produto', image: image.preview || currentImage }} /></div>
      <FormField label="Foto do produto"><input type="file" accept={Object.keys(imageTypes).join(',')} disabled={busy} onChange={event => {
        const candidate = event.currentTarget.files[0]
        if (candidate) image.choose(candidate)
        event.currentTarget.value = ''
      }} /></FormField>
      <p>JPEG, PNG ou WebP de até 5 MiB.</p>
      {image.validating && <LoadingState>Conferindo a imagem…</LoadingState>}
      {image.file && <Button secondary disabled={busy} onClick={() => image.choose(null)}>Descartar nova foto</Button>}
      {image.imageError && <Button secondary onClick={() => image.choose(null)}>Limpar erro da foto</Button>}
      <label className="choice"><input type="checkbox" name="published" defaultChecked={product?.published ?? true} /> Publicado no cardápio</label>
      <label className="choice"><input type="checkbox" name="available" defaultChecked={product?.available ?? true} /> Disponível para venda</label>
      <label className="choice"><input type="checkbox" name="earns_stamps" defaultChecked={product?.earns_stamps ?? false} /> Elegível para carimbos em compras pagas</label>
      <Feedback message={image.imageError || validation || error} />
      {busy && <LoadingState>{image.file ? 'Enviando a foto e salvando o produto…' : 'Salvando o produto…'}</LoadingState>}
      <Button type="submit" disabled={busy || image.validating || Boolean(image.imageError)}>Salvar produto</Button>
    </form>
  </Modal>
}
