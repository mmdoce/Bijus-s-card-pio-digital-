import { FormField } from '../../components/ui'
import { money } from '../../lib/money'

export function CustomerFields({ profile = {}, contact = true, address = true, preserveAddress = false, requiredAddress = false, areas = [], onDistrict }) {
  return <>
    {contact && <div className="field-grid">
      <FormField label="Nome completo"><input name="name" autoComplete="name" required maxLength={100} defaultValue={profile.name} /></FormField>
      <FormField label="Telefone WhatsApp"><input name="phone" type="tel" autoComplete="tel" required maxLength={24} defaultValue={profile.phone} /></FormField>
    </div>}
    {(address || preserveAddress) && <fieldset disabled={!address} hidden={!address} className={address ? 'stack' : undefined}>
      <legend>Endereço</legend>
      <FormField label="Bairro"><select name="district" required={requiredAddress} defaultValue={profile.district ?? ''} onChange={event => onDistrict?.(event.target.value)}>
        <option value="">Selecione um bairro</option>
        {areas.map(area => <option key={area.id} value={area.id}>{area.name}{requiredAddress && ' · ' + money(area.fee)}</option>)}
      </select></FormField>
      <div className="field-grid">
        <FormField label="Rua"><input name="street" autoComplete="address-line1" required={requiredAddress} maxLength={120} defaultValue={profile.street} /></FormField>
        <FormField label="Número"><input name="streetNumber" required={requiredAddress} maxLength={20} defaultValue={profile.streetNumber} /></FormField>
        <FormField label="Complemento"><input name="complement" autoComplete="address-line2" maxLength={100} defaultValue={profile.complement} /></FormField>
        <FormField label="Referência"><input name="reference" maxLength={160} defaultValue={profile.reference} /></FormField>
      </div>
    </fieldset>}
  </>
}
