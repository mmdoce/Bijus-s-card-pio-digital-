export const statusLabels = {
  AGUARDANDO_PAGAMENTO: 'Aguardando pagamento',
  REVISAO_MANUAL: 'Pagamento expirado · revisão manual',
  PAGAMENTO_EXPIRADO: 'Pagamento expirado · revisão manual',
  PAGAMENTO_CONFIRMADO: 'Pagamento confirmado',
  EM_PREPARO: 'Em preparo',
  PRONTO: 'Pronto para retirada',
  PRONTO_ENTREGA: 'Pronto para entrega',
  SAIU_PARA_ENTREGA: 'Saiu para entrega',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
}

export const financeLabels = {
  PENDENTE: 'Pendente', EXPIRADO: 'Expirado', CONFIRMADO: 'Confirmado', ISENTO: 'Sem valor a receber', CANCELADO: 'Cancelado', REEMBOLSADO: 'Reembolsado',
}

export function paymentLabel(payment, method) {
  if (payment === 'pix') return 'Pix antecipado'
  return method === 'delivery' ? 'Pagamento na entrega' : 'Pagamento na retirada'
}

export function deliveryFeeFor(method, districtId, areas) {
  if (method === 'pickup') return 0
  if (method !== 'delivery' || !districtId) return undefined
  return areas.find(area => area.id === districtId && area.available !== false && area.active !== false)?.fee
}

export function brazilianPhone(value) {
  const digits = value.replace(/\D/g, '')
  const local = digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits
  return /^[1-9]{2}[2-9]\d{7,8}$/.test(local) ? '55' + local : ''
}

export function customerFields(data) {
  return Object.fromEntries(['name', 'phone', 'district', 'street', 'streetNumber', 'complement', 'reference']
    .map(field => [field, String(data.get(field) ?? '').trim()]))
}

export function nextStatuses(order) {
  const completion = ['CONFIRMADO', 'ISENTO'].includes(order.financialStatus) ? ['CONCLUIDO'] : []
  const cancel = order.financialStatus !== 'CONFIRMADO' ? ['CANCELADO'] : []
  switch (order.status) {
    case 'AGUARDANDO_PAGAMENTO':
    case 'REVISAO_MANUAL': return cancel
    case 'EM_PREPARO': return order.method === 'delivery' ? ['PRONTO_ENTREGA', 'SAIU_PARA_ENTREGA', ...cancel] : ['PRONTO', ...cancel]
    case 'PRONTO_ENTREGA': return ['SAIU_PARA_ENTREGA', ...cancel]
    case 'PRONTO':
    case 'SAIU_PARA_ENTREGA': return [...completion, ...cancel]
    default: return []
  }
}

export function whatsappMessage(order, event) {
  const greeting = `Olá, ${order.customer}! `
  const number = '#' + order.number
  const messages = {
    confirm: `Seu pagamento do pedido ${number} foi confirmado.`,
    EM_PREPARO: `Seu pedido ${number} está sendo preparado com muito carinho pela Biju's Doce!`,
    PRONTO: `Seu pedido ${number} está prontinho e já pode ser retirado!`,
    PRONTO_ENTREGA: `Seu pedido ${number} está prontinho e aguarda saída para entrega!`,
    SAIU_PARA_ENTREGA: `Seu pedido ${number} saiu para entrega. Em breve chegará até você!`,
    CONCLUIDO: 'Esperamos que tenha gostado do seu pedido. Até a próxima!',
    REVISAO_MANUAL: `O prazo de pagamento do seu pedido ${number} terminou. Caso já tenha realizado o Pix, entre em contato conosco.`,
    CANCELADO: `Seu pedido ${number} foi cancelado. Se precisar de ajuda, fale com a Biju's Doce.`,
    refund: `O reembolso do pedido ${number} foi registrado pela Biju's Doce.`,
  }
  if (event === 'CONCLUIDO') return `Obrigada pela preferência, ${order.customer}! ${messages[event]}`
  return greeting + messages[event] + (event === 'confirm' && order.payment === 'pix' ? ' Logo começaremos a preparar seu pedido!' : '')
}
