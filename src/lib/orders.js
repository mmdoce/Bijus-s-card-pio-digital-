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
  PENDENTE: 'Pendente', EXPIRADO: 'Expirado', CONFIRMADO: 'Confirmado', ISENTO: 'Sem valor a receber', CANCELADO: 'Cancelado',
}

export function paymentLabel(payment, method) {
  if (payment === 'pix') return 'Pix antecipado'
  return method === 'delivery' ? 'Pagamento na entrega' : 'Pagamento na retirada'
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

export function expireOrder(order, now) {
  if (order.status !== 'AGUARDANDO_PAGAMENTO' || now < order.expiresAt) return order
  return { ...order, revision: (order.revision ?? 0) + 1, status: 'REVISAO_MANUAL', financialStatus: 'EXPIRADO' }
}

export function loyaltyBalance(orders, accountId) {
  return orders.filter(order => order.accountId === accountId).reduce((balance, order) => {
    const paid = order.financialStatus === 'CONFIRMADO'
    const reserved = order.reward && !['REVISAO_MANUAL', 'CANCELADO'].includes(order.status)
    return balance + (paid ? order.stamps : 0) - (reserved ? 9 : 0)
  }, 0)
}

export function quoteOrder(items, deliveryFee, balance) {
  const reward = balance >= 9 && items.some(({ product }) => product.id === 'acai-300')
  const productsTotal = items.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0)
  const discount = reward ? items.find(({ product }) => product.id === 'acai-300').product.price : 0
  const stamps = items.reduce((sum, { product, quantity }) => sum + (product.category === 'acai' && product.price > 0 ? quantity : 0), 0) - Number(reward && discount > 0)
  return { productsTotal, discount, reward, total: productsTotal - discount + deliveryFee, stamps }
}

export function createOrder({ items, method, payment, customer, notes }, { catalog, areas, open, orders, accountId, now, id, token }) {
  if (!open) throw new Error('A loja está fechada para novos pedidos.')
  if (!['delivery', 'pickup'].includes(method) || !['pix', 'receipt'].includes(payment)) throw new Error('Selecione o recebimento e a forma de pagamento.')
  if (!customer.name || !brazilianPhone(customer.phone)) throw new Error('Informe seu nome e um WhatsApp válido com DDD.')
  const area = areas.find(item => item.id === customer.district && item.active !== false)
  if (method === 'delivery' && (!area || !customer.street || !customer.streetNumber)) throw new Error('Preencha bairro, rua e número para entrega.')
  const deliveryFee = method === 'delivery' ? area.fee : 0
  const snapshot = items.map(({ product: { id: productId }, quantity }) => {
    const product = catalog.find(item => item.id === productId && item.active !== false && item.available)
    if (!product || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Revise os produtos disponíveis no carrinho.')
    return { product: { ...product }, quantity }
  })
  if (!snapshot.length) throw new Error('Seu carrinho está vazio.')
  const quote = quoteOrder(snapshot, deliveryFee, accountId ? loyaltyBalance(orders, accountId) : 0)
  const advance = payment === 'pix' && quote.total > 0
  const receipt = method === 'delivery' ? { ...customer, district: area.name } : { name: customer.name, phone: customer.phone }
  return {
    ...quote, id, token, number: 'BD-' + (1001 + orders.length), createdAt: now, revision: 0,
    accountId, customer: customer.name, receipt, items: snapshot, method, payment, notes, deliveryFee,
    status: advance ? 'AGUARDANDO_PAGAMENTO' : 'EM_PREPARO',
    financialStatus: quote.total ? 'PENDENTE' : 'ISENTO',
    expiresAt: advance ? now + 300_000 : null,
  }
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

export function updateOrder(order, action, orders, now) {
  const current = expireOrder(order, now)
  if (action !== 'confirm') {
    if (!nextStatuses(current).includes(action)) throw new Error('A mudança de status não está disponível.')
    const final = ['CONCLUIDO', 'CANCELADO'].includes(action)
    return {
      ...current, revision: (current.revision ?? 0) + 1, status: action,
      financialStatus: action === 'CANCELADO' ? 'CANCELADO' : current.financialStatus,
      ...(final ? { finishedAt: now } : {}),
    }
  }
  if (current.status === 'CANCELADO' || !['PENDENTE', 'EXPIRADO'].includes(current.financialStatus)) {
    throw new Error('Este pedido não tem pagamento para confirmar.')
  }
  if (current.reward && current.financialStatus === 'EXPIRADO' && loyaltyBalance(orders.map(item => expireOrder(item, now)), current.accountId) < 9) {
    throw new Error('A recompensa liberada no vencimento já foi usada. Revise o pedido antes de confirmar.')
  }
  return {
    ...current, revision: (current.revision ?? 0) + 1, financialStatus: 'CONFIRMADO', paidAt: now,
    status: current.payment === 'pix' ? 'EM_PREPARO' : current.status,
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
  }
  if (event === 'CONCLUIDO') return `Obrigada pela preferência, ${order.customer}! ${messages[event]}`
  return greeting + messages[event] + (event === 'confirm' && order.payment === 'pix' ? ' Logo começaremos a preparar seu pedido!' : '')
}
