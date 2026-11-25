import { useState } from 'react'
import { Button, EmptyState, FormField, LoadingState, Modal, PageHeading, StatusBadge } from '../../components/ui'
import { money } from '../../lib/money'
import { priceInput } from './catalogData'
import { areaInput, readAreas, saveArea } from './settingsData'
import { useSettingsResource } from './useSettingsResource'

export function AdminAreas() {
  const { data, loading, error, busy, feedback, setFeedback, change, retry } = useSettingsResource(readAreas)
  const [editing, setEditing] = useState(null)

  function edit(area) {
    setFeedback(null)
    setEditing({ area })
  }

  function close() {
    if (busy) return
    setEditing(null)
    setFeedback(null)
  }

  function save(id, fields, message) {
    return change(client => saveArea(client, id, fields),
      (areas, area) => [...areas.filter(item => item.id !== area.id), area].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      message, true)
  }

  async function submit(event) {
    event.preventDefault()
    let fields
    try {
      fields = areaInput(new FormData(event.currentTarget))
    } catch (failure) {
      setFeedback({ message: failure.message, error: true })
      return
    }
    if (await save(editing.area?.id, fields, 'Bairro salvo.')) setEditing(null)
  }

  return <section className="stack">
    <header className="admin-heading">
      <PageHeading title="Bairros e taxas" />
      {data && <Button disabled={busy} onClick={() => edit(null)}>Novo bairro</Button>}
    </header>
    {!editing && feedback && <p className="notice" role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
    {loading && <LoadingState>Carregando os bairros…</LoadingState>}
    {error && <EmptyState title="Não foi possível consultar os bairros"><Button secondary onClick={retry}>Tentar novamente</Button></EmptyState>}
    {data && (data.length ? <ul className="panel divided">
      {data.map(area => <li className="line-item" key={area.id}>
        <div className="stack-small">
          <h3>{area.name}</h3><p>{money(area.fee_cents)}</p>
          <StatusBadge tone={area.available ? 'positive' : 'warning'}>{area.available ? 'Ativo' : 'Desativado'}</StatusBadge>
        </div>
        <div className="actions">
          <Button secondary disabled={busy} aria-label={'Editar ' + area.name} onClick={() => edit(area)}>Editar</Button>
          <Button secondary disabled={busy} onClick={() => save(area.id, { available: !area.available }, area.available ? 'Bairro desativado.' : 'Bairro ativado.')}>
            {area.available ? 'Desativar' : 'Ativar'}
          </Button>
        </div>
      </li>)}
    </ul> : <EmptyState title="Nenhum bairro cadastrado"><p>Cadastre o primeiro bairro para calcular a taxa de entrega.</p></EmptyState>)}
    {editing && <Modal title={editing.area ? 'Editar bairro' : 'Novo bairro'} onClose={close}>
      <AreaForm area={editing.area} onSubmit={submit} busy={busy} feedback={feedback} />
    </Modal>}
  </section>
}

function AreaForm({ area, onSubmit, busy, feedback }) {
  const [fee, setFee] = useState(priceInput(area?.fee_cents ?? 300))
  return <form className="stack" onSubmit={onSubmit}>
    <FormField label="Nome do bairro"><input name="name" defaultValue={area?.name ?? ''} maxLength={100} autoFocus required /></FormField>
    <FormField label="Taxa de entrega em reais"><input name="fee" maxLength={12} inputMode="decimal" value={fee} onChange={event => setFee(event.target.value)} required /></FormField>
    <div className="actions">
      <Button secondary disabled={busy} onClick={() => setFee('3,00')}>Usar R$ 3,00</Button>
      <Button secondary disabled={busy} onClick={() => setFee('6,00')}>Usar R$ 6,00</Button>
    </div>
    <label className="choice"><input name="available" type="checkbox" defaultChecked={area?.available ?? true} /> Bairro atendido</label>
    {feedback && <p className="notice" role="alert">{feedback.message}</p>}
    <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar bairro'}</Button>
  </form>
}
