import { useState } from 'react'
import { NotificationSettings } from '../notifications/NotificationCenter'
import { Button, EmptyState, FormField, LoadingState, Modal, Notice, PageHeading, StatusBadge } from '../../components/ui'
import { pixKeyTypes } from '../../lib/pix'
import { pixInput, readSettings, savePixSettings, saveStoreState } from './settingsData'
import { useSettingsResource } from './useSettingsResource'

export function AdminSettings() {
  const { data, loading, error, busy, feedback, setFeedback, change, retry } = useSettingsResource(readSettings)
  const [confirm, setConfirm] = useState(null)

  async function saveState() {
    const open = confirm
    const saved = await change(client => saveStoreState(client, data.store.id, open),
      (current, store) => ({ ...current, store }),
      open ? 'Loja aberta.' : 'Loja fechada.', true)
    if (saved) setConfirm(null)
  }

  function savePix(event) {
    event.preventDefault()
    let fields
    try {
      fields = pixInput(new FormData(event.currentTarget))
    } catch (failure) {
      setFeedback({ message: failure.message, error: true })
      return
    }
    void change(client => savePixSettings(client, data.pix.id, fields),
      (current, pix) => ({ ...current, pix }), 'Dados do Pix salvos.')
  }

  function close() {
    if (busy) return
    setConfirm(null)
    setFeedback(null)
  }

  const feedbackMessage = feedback && <p className="notice" role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>
  return <section className="narrow stack">
    <PageHeading title="Configurações" />
    {loading && <LoadingState>Carregando as configurações…</LoadingState>}
    {error && <EmptyState title="Não foi possível consultar as configurações"><Button secondary onClick={retry}>Tentar novamente</Button></EmptyState>}
    {data && <>
      {confirm === null && feedbackMessage}
      <section className="panel stack">
        <h2>Funcionamento</h2>
        <StatusBadge tone={data.store.is_open ? 'positive' : 'warning'}>{data.store.is_open ? 'Loja aberta' : 'Loja fechada'}</StatusBadge>
        <div className="actions">
          <Button disabled={busy || data.store.is_open} onClick={() => { setFeedback(null); setConfirm(true) }}>Abrir loja</Button>
          <Button secondary disabled={busy || !data.store.is_open} onClick={() => { setFeedback(null); setConfirm(false) }}>Fechar loja</Button>
        </div>
        <Notice>O cardápio permanece visível com a loja fechada. A abertura é sempre manual.</Notice>
      </section>
      <PixForm key={data.pix.id + ':' + data.pix.pix_key_type} pix={data.pix} onSubmit={savePix} busy={busy} />
    </>}
    <NotificationSettings />
    {confirm !== null && <Modal title={confirm ? 'Abrir loja' : 'Fechar loja'} onClose={close}>
      <p>{confirm ? 'O cardápio mostrará a loja aberta. Quando o checkout estiver habilitado no servidor, clientes poderão enviar novos pedidos.' : 'O cardápio permanecerá visível e os pedidos existentes continuarão acessíveis.'}</p>
      {feedbackMessage}
      <div className="actions">
        <Button secondary disabled={busy} onClick={close}>Cancelar</Button>
        <Button disabled={busy} onClick={saveState}>{busy ? 'Salvando…' : confirm ? 'Confirmar abertura' : 'Confirmar fechamento'}</Button>
      </div>
    </Modal>}
  </section>
}

function PixForm({ pix, onSubmit, busy }) {
  const [type, setType] = useState(pix.pix_key_type ?? '')
  const [key, setKey] = useState(pix.pix_key ?? '')
  const [showKey, setShowKey] = useState(false)
  return <form className="panel stack" onSubmit={onSubmit}>
    <h2>Dados de pagamento</h2>
    <FormField label="Tipo de chave Pix"><select name="type" value={type} required disabled={busy} onChange={event => {
      setType(event.target.value)
      setKey('')
    }}>
      <option value="" disabled>Selecione o tipo de chave</option>
      {Object.entries(pixKeyTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></FormField>
    <FormField label="Chave Pix"><input name="key" type={showKey ? 'text' : 'password'} autoComplete="off" maxLength={100} required value={key} onChange={event => setKey(event.target.value)} /></FormField>
    <Button secondary onClick={() => setShowKey(value => !value)}>{showKey ? 'Ocultar chave' : 'Mostrar chave'}</Button>
    <FormField label="Nome do recebedor"><input name="name" defaultValue={pix.receiver_name ?? ''} maxLength={25} required /></FormField>
    <FormField label="Cidade do recebedor"><input name="city" defaultValue={pix.receiver_city ?? ''} maxLength={15} required /></FormField>
    <Button type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Salvar dados do Pix'}</Button>
  </form>
}
