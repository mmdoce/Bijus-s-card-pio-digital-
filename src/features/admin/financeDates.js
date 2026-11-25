const zone = 'America/Sao_Paulo'
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, dateStyle: 'short' })

export function currentFinancePeriod(now = new Date()) {
  const end = dateFormat.format(now)
  return { start: end.slice(0, 8) + '01', end }
}

export function financePeriod({ start, end }) {
  if (![start, end].every(date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) || start > end) {
    throw new Error('Informe um período válido.')
  }
  const from = new Date(start + 'T00:00:00-03:00')
  const until = new Date(end + 'T00:00:00-03:00')
  if (!Number.isFinite(+from) || !Number.isFinite(+until) || dateFormat.format(from) !== start || dateFormat.format(until) !== end) {
    throw new Error('Informe datas válidas.')
  }
  until.setUTCDate(until.getUTCDate() + 1)
  return { p_from: from.toISOString(), p_until: until.toISOString() }
}
