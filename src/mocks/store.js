export const categories = [
  { id: 'acai', name: 'Açaís' },
  { id: 'doces', name: 'Doces' },
]

export const products = [
  { id: 'acai-300', category: 'acai', name: 'Açaí 300 ml', size: '300 ml', description: 'Açaí cremoso na garrafa, servido gelado.', price: 1400, available: true },
  { id: 'acai-500', category: 'acai', name: 'Açaí 500 ml', size: '500 ml', description: 'Uma porção maior do nosso açaí cremoso.', price: 2100, available: true },
  { id: 'brownie', category: 'doces', name: 'Brownie de chocolate', description: 'Casquinha fina e interior macio.', price: 900, available: true },
  { id: 'brigadeiro', category: 'doces', name: 'Brigadeiro de colher', description: 'Brigadeiro cremoso com granulado.', price: 800, available: false },
]

export const neighborhoods = [
  { id: 'centro', name: 'Centro', fee: 500 },
  { id: 'jardim', name: 'Jardim das Flores', fee: 750 },
]

export const exampleOrder = {
  id: 'exemplo',
  number: 'BD-1001',
  token: 'demonstracao',
  status: 'REVISAO_MANUAL',
  financialStatus: 'EXPIRADO',
  payment: 'pix',
  accountId: null,
  createdAt: new Date('2025-01-01T15:00:00Z').getTime(),
  productsTotal: 2800,
  stamps: 2,
  items: [{ product: products[0], quantity: 2 }],
  customer: 'Cliente demonstrativo',
  method: 'delivery',
  receipt: { name: 'Cliente demonstrativo', phone: '(11) 99000-0000', district: 'Centro', street: 'Rua de Exemplo', streetNumber: '123' },
  deliveryFee: 500,
  total: 3300,
}

export const storeSettings = { open: false, contact: '' }
