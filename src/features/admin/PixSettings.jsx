import { useEffect, useState } from 'react'
import { Button, FormField, Notice } from '../../components/ui'
import { pixKeyTypes } from '../../lib/pix'
import { useDemoStore } from '../../mocks/DemoStore'

export function PixSettings() {
  const { readPixReceiver, savePixReceiver } = useDemoStore()
  const [fields, setFields] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const receiver = await readPixReceiver()
        if (active) setFields(receiver)
      } catch {
        if (active) setFeedback({ error: true, text: 'Não foi possível carregar os dados de pagamento.' })
      }
    }
    void load()
    return () => { active = false }
  }, [readPixReceiver])

  function change(event) {
    const { name, value } = event.target
    setFields(previous => ({ ...previous, [name]: value, ...(name === 'type' ? { key: '' } : {}) }))
    setFeedback(null)
  }

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await savePixReceiver(fields)
      setFields(await readPixReceiver())
      setFeedback({ text: 'Dados de pagamento salvos nesta sessão demonstrativa.' })
    } catch (error) {
      setFeedback({ error: true, text: error.message })
    } finally {
      setBusy(false)
    }
  }

  return <form className="panel stack" onSubmit={save}>
    <h2>Dados de pagamento</h2>
    <Notice>Configuração simulada. Use valores de teste. Os QR Codes desta sessão usam uma chave fictícia de domínio .invalid.</Notice>
    {fields && <>
      <FormField label="Tipo de chave Pix"><select name="type" value={fields.type} onChange={change}>
        {Object.entries(pixKeyTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></FormField>
      <FormField label="Chave Pix"><input name="key" value={fields.key} onChange={change} required maxLength={100} autoComplete="off" /></FormField>
      <FormField label="Nome do recebedor"><input name="name" value={fields.name} onChange={change} required maxLength={25} /></FormField>
      <FormField label="Cidade do recebedor"><input name="city" value={fields.city} onChange={change} required maxLength={15} /></FormField>
      <Button type="submit" disabled={busy}>Salvar dados de pagamento</Button>
    </>}
    {feedback && <p className="notice" role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
  </form>
}
