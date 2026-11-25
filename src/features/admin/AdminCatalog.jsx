import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ActionLink, Button, EmptyState, FormField, LoadingState, Modal, Notice, PageHeading, StatusBadge } from '../../components/ui'
import { money } from '../../lib/money'
import { supabaseForSession } from '../../lib/supabase'
import { useAuth } from '../account/AuthProvider'
import { ProductMedia } from '../catalog/CatalogPage'
import { useStore } from '../catalog/StoreProvider'
import { CategoryForm, ProductForm } from './CatalogForms'
import { catalogError, deleteCategory, isRewardProduct, readAdminCatalog, saveCategory, saveProduct, setRewardProduct } from './catalogData'

export function AdminCatalog({ section }) {
  const { session } = useAuth()
  const client = useMemo(() => supabaseForSession(session.access_token), [session.access_token])
  const { reload: reloadPublic } = useStore()
  const [params, setParams] = useSearchParams()
  const [availability, setAvailability] = useState('')
  const [state, setState] = useState({ loading: true })
  const [revision, setRevision] = useState(0)
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const isCategories = section === 'categories'
  const title = isCategories ? 'Categorias' : 'Produtos'

  useEffect(() => {
    let alive = true
    setState({ loading: true })
    readAdminCatalog(client).then(
      data => { if (alive) setState({ data }) },
      error => { if (alive) setState({ error }) },
    )
    return () => { alive = false }
  }, [client, revision])

  async function run(operation, message) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setFeedback(null)
    try {
      await operation()
      setEditing(null)
      setRemoving(null)
      setFeedback({ message })
      setState({ loading: true })
      setRevision(value => value + 1)
      reloadPublic()
    } catch (error) {
      setFeedback({ message: catalogError(error), error: true })
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  function close() {
    if (inFlight.current) return
    setEditing(null)
    setRemoving(null)
    setFeedback(null)
  }

  const { categories = [], products = [], store } = state.data ?? {}
  const selected = params.get('categoria') ?? ''
  const visible = products.filter(product => (!selected || product.category_id === selected) && (
    !availability || (availability === 'active' && product.available)
    || (availability === 'inactive' && !product.available) || (availability === 'unpublished' && !product.published)
  ))
  const picture = path => path ? client.storage.from('product-images').getPublicUrl(path).data.publicUrl : undefined
  const error = feedback?.error ? feedback.message : ''

  return <section className="stack">
    <header className="admin-heading">
      <PageHeading title={title} />
      {state.data && <Button disabled={busy || (!isCategories && !categories.length)} onClick={() => { setFeedback(null); setEditing({ record: null }) }}>
        {isCategories ? 'Nova categoria' : 'Novo produto'}
      </Button>}
    </header>
    {!editing && !removing && feedback && <p className="notice" role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
    {state.loading && <LoadingState>Carregando {title.toLowerCase()}…</LoadingState>}
    {state.error && <EmptyState title={'Não foi possível carregar ' + title.toLowerCase()}>
      <Button secondary onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button>
    </EmptyState>}
    {state.data && (isCategories ? (
      categories.length ? <ul className="panel divided">
        {categories.map(category => {
          const linked = products.filter(product => product.category_id === category.id)
          return <li className="line-item" key={category.id}>
            <div className="stack-small">
              <h3>{category.name}</h3>
              <p>Ordem {category.display_order} · {linked.length} {linked.length === 1 ? 'produto' : 'produtos'}</p>
              <StatusBadge tone={category.available ? 'positive' : 'warning'}>{category.available ? 'Ativa' : 'Desativada'}</StatusBadge>
              {linked.length > 0 && <details><summary>Produtos vinculados</summary>
                <ul>{linked.map(product => <li key={product.id}>{product.name}</li>)}</ul>
                <ActionLink secondary to={'/admin/produtos?categoria=' + category.id}>Ver na gestão de produtos</ActionLink>
              </details>}
            </div>
            <div className="actions">
              <Button secondary disabled={busy} onClick={() => { setFeedback(null); setEditing({ record: category }) }} aria-label={'Editar ' + category.name}>Editar</Button>
              <Button secondary disabled={busy} onClick={() => run(() => saveCategory(client, category.id, { available: !category.available }),
                category.available ? 'Categoria desativada.' : 'Categoria ativada.')}>
                {category.available ? 'Desativar' : 'Ativar'}
              </Button>
              {!linked.length && <Button secondary disabled={busy} onClick={() => { setFeedback(null); setRemoving(category) }}>Excluir</Button>}
            </div>
          </li>
        })}
      </ul> : <EmptyState title="Nenhuma categoria cadastrada">
        <p>Cadastre a primeira categoria para organizar os produtos do cardápio.</p>
        <Button onClick={() => setEditing({ record: null })}>Cadastrar primeira categoria</Button>
      </EmptyState>
    ) : <>
      {products.length > 0 && <div className="panel field-grid">
        <FormField label="Filtrar por categoria"><select value={selected} onChange={event => setParams(event.target.value ? { categoria: event.target.value } : {}, { replace: true })}>
          <option value="">Todas as categorias</option>
          {categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select></FormField>
        <FormField label="Filtrar por disponibilidade"><select value={availability} onChange={event => setAvailability(event.target.value)}>
          <option value="">Todos os produtos</option><option value="active">Disponíveis</option>
          <option value="inactive">Indisponíveis</option><option value="unpublished">Desativados no cardápio</option>
        </select></FormField>
      </div>}
      {visible.length ? <ul className="panel divided">
        {visible.map(product => {
          const reward = store.reward_product_id === product.id
          return <li className="line-item" key={product.id}>
            <div className="catalog-admin-product">
              <div className="catalog-thumb"><ProductMedia product={{ ...product, image: picture(product.image_path) }} /></div>
              <div className="stack-small">
                <h3>{product.name}</h3>
                <p>{categories.find(category => category.id === product.category_id)?.name}{product.size && ' · ' + product.size}</p>
                <p>{product.description}</p>
                <strong>{money(product.price_cents)}</strong>
                <div className="actions">
                  <StatusBadge tone={product.published ? 'positive' : 'warning'}>{product.published ? 'Publicado' : 'Desativado'}</StatusBadge>
                  <StatusBadge tone={product.available ? 'positive' : 'warning'}>{product.available ? 'Disponível' : 'Indisponível'}</StatusBadge>
                  {reward ? <StatusBadge>Recompensa de 300 ml</StatusBadge> : product.earns_stamps && <StatusBadge>Elegível para carimbos</StatusBadge>}
                </div>
              </div>
            </div>
            <div className="actions">
              <Button secondary disabled={busy} onClick={() => { setFeedback(null); setEditing({ record: product }) }} aria-label={'Editar ' + product.name}>Editar</Button>
              <Button secondary disabled={busy} onClick={() => run(() => saveProduct(client, product, { available: !product.available }),
                product.available ? 'Produto marcado como indisponível.' : 'Produto marcado como disponível.')}>
                {product.available ? 'Marcar indisponível' : 'Marcar disponível'}
              </Button>
              <Button secondary disabled={busy} onClick={() => run(() => saveProduct(client, product, { published: !product.published }),
                product.published ? 'Produto desativado no cardápio.' : 'Produto publicado.')}>
                {product.published ? 'Desativar no cardápio' : 'Publicar no cardápio'}
              </Button>
              {(reward || isRewardProduct(product)) && <Button secondary disabled={busy} onClick={() =>
                run(() => setRewardProduct(client, store.id, reward ? null : product), reward ? 'Recompensa desvinculada.' : 'Recompensa de 300 ml definida.')}>
                {reward ? 'Desvincular recompensa' : 'Definir como recompensa'}
              </Button>}
            </div>
          </li>
        })}
      </ul> : <EmptyState title={products.length ? 'Nenhum produto neste filtro' : 'Nenhum produto cadastrado'}>
        {!products.length && (!categories.length ? <>
          <p>Cadastre a primeira categoria antes de adicionar um produto.</p>
          <ActionLink to="/admin/categorias">Cadastrar categoria</ActionLink>
        </> : <Button onClick={() => setEditing({ record: null })}>Cadastrar primeiro produto</Button>)}
      </EmptyState>}
      {products.length > 0 && <Notice>Para definir a recompensa, selecione um produto elegível com tamanho de 300 ml. Escolha o produto pelo cadastro, independentemente do nome comercial.</Notice>}
    </>)}
    {editing && (isCategories
      ? <CategoryForm category={editing.record} busy={busy} error={error} onClose={close} onSave={fields =>
        run(() => saveCategory(client, editing.record?.id, fields), 'Categoria salva.')} />
      : <ProductForm product={editing.record} categories={categories} busy={busy} error={error} onClose={close}
        currentImage={picture(editing.record?.image_path)} isReward={Boolean(editing.record && store?.reward_product_id === editing.record.id)}
        onSave={(fields, file) => run(() => saveProduct(client, editing.record, fields, file), 'Produto salvo.')} />)}
    {removing && <Modal title="Excluir categoria" onClose={close}>
      <p>Excluir a categoria <strong>{removing.name}</strong>? Essa ação é permanente. Você também pode desativá-la na lista.</p>
      {error && <p className="notice" role="alert">{error}</p>}
      <div className="actions">
        <Button secondary disabled={busy} onClick={close}>Cancelar</Button>
        <Button disabled={busy} onClick={() => run(() => deleteCategory(client, removing.id), 'Categoria excluída.')}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</Button>
      </div>
    </Modal>}
  </section>
}
