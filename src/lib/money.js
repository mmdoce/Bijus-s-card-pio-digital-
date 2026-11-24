const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function money(cents) {
  return formatter.format(cents / 100)
}
