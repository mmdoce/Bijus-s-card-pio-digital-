# Bijus-s-card-pio-digital-
Sistema de visualização de cardápio da marca e lançamento de pedidos da parte do cliente, com gestão de operação da produção e salvamento de dados de compra do cliente, a fim de facilitar recompra e ativar programa de fidelidade 

## Desenvolvimento local

Use Node.js 22.12+ na linha 22 ou Node.js 24+.

```sh
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite. A demonstração funciona sem variáveis de ambiente.

Use `npm run build` para gerar `dist/` e `npm run preview` para conferir o build localmente.
O catálogo, as taxas e o pedido em `/pedido/demonstracao` usam dados fictícios.
Abra `/admin/login` em desenvolvimento e use a conta fictícia indicada na própria página. O painel usa `/admin`; o atalho no cardápio e o acesso demonstrativo são exclusivos do modo de desenvolvimento.

Para testar um pedido, abra a loja em Configurações e use o cardápio e o painel na mesma aba. O carrinho acompanha a navegação, inclusive durante o cadastro. Pedidos, contas, fotos e alterações no catálogo ficam em memória. A loja começa fechada em um navegador sem configuração. A abertura ou o fechamento persiste após recarregar. Use apenas dados fictícios e trate o QR Code Pix como demonstração.

Execute `npm test` para rodar os testes das regras de pedidos, Pix e fidelidade.

- [Requisitos](docs/requirements.md)
- [Arquitetura](docs/architecture.md)
- [Proposta de banco de dados](docs/database.md)
