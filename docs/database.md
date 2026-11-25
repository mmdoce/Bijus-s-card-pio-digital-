# Banco de dados

As sete migrações em `supabase/migrations` foram aplicadas ao projeto de produção `bijus-doce` (`cncaqtbptrjqguzqbmpr`) com a Supabase CLI 3.4.0. O frontend usa o Supabase Auth e as consultas reais de catálogo e conta.

```mermaid
erDiagram
  AUTH_USERS ||--o| PROFILES : identifica
  AUTH_USERS ||--o| ADMIN_USERS : autoriza
  AUTH_USERS o|--o{ ORDER_STATUS_HISTORY : atua
  PROFILES ||--o{ ADDRESSES : cadastra
  DELIVERY_AREAS ||--o{ ADDRESSES : atende
  CATEGORIES ||--o{ PRODUCTS : agrupa
  PRODUCTS o|--o| STORE_SETTINGS : configura_brinde
  PAYMENT_SETTINGS ||..o{ PAYMENTS : fornece_configuracao
  PROFILES o|--o{ ORDERS : faz
  DELIVERY_AREAS o|--o{ ORDERS : atende
  ORDERS ||--|{ ORDER_ITEMS : contem
  PRODUCTS ||--o{ ORDER_ITEMS : origina
  ORDERS ||--|| PAYMENTS : cobra
  ORDERS ||--o{ ORDER_STATUS_HISTORY : audita
  ORDERS ||--o| GUEST_ORDER_TOKENS : protege
  ORDERS o|--o| CHECKOUT_REQUESTS : idempotencia
  ORDERS ||--o{ ORDER_ACTIONS : idempotencia
  PROFILES ||--o| LOYALTY_ACCOUNTS : possui
  LOYALTY_ACCOUNTS ||--o{ LOYALTY_REWARDS : libera
  LOYALTY_ACCOUNTS ||--o{ LOYALTY_TRANSACTIONS : movimenta
  LOYALTY_REWARDS o|--o{ LOYALTY_TRANSACTIONS : registra
  ORDERS o|--o| LOYALTY_REWARDS : reserva_ou_resgata
  ORDERS ||--o{ LOYALTY_TRANSACTIONS : origina
  PROFILES o|--o{ PUSH_SUBSCRIPTIONS : associa
  GUEST_ORDER_TOKENS o|--o{ PUSH_SUBSCRIPTIONS : associa
  ORDER_STATUS_HISTORY ||--o| NOTIFICATION_EVENTS : publica
  NOTIFICATION_EVENTS ||--o{ NOTIFICATION_DELIVERIES : distribui
  PUSH_SUBSCRIPTIONS ||--o{ NOTIFICATION_DELIVERIES : recebe
```

As relações de pedidos, pagamentos e histórico usam FKs com exclusão restrita. O recebedor Pix é copiado para o pagamento no momento da cobrança. Essa relação no diagrama representa a cópia de dados. `payment_settings` e `store_settings` são registros únicos. A lista `admin_users` é provisionada por um operador privilegiado, mesmo que inicialmente haja uma única administradora. Separar `addresses` de `profiles` permite múltiplos endereços e preserva os dados usados em cada compra.

## Migrações

| Arquivo | Responsabilidade |
| --- | --- |
| `20261125000000_schema.sql` | Estrutura, enums, relacionamentos, índices, constraints, chaves de idempotência e configuração inicial fechada |
| `20261125000100_notifications.sql` | Inscrições, eventos e fila de entrega preparada |
| `20261125000200_security.sql` | RLS, privilégios explícitos e autorização administrativa |
| `20261125000300_storage.sql` | Bucket `product-images` e políticas de escrita |
| `20261125000400_order_support.sql` | BR Code, projeção privada, auditoria, fidelidade e expiração |
| `20261125000500_checkout.sql` | Criação transacional e acompanhamento autorizado |
| `20261125000600_order_actions.sql` | Transições administrativas, reembolso, resumo financeiro e expiração em lote |

## Integridade e operações

- **Identificação e valores.** IDs UUID e sequência de identidade para o número público. Lacunas na numeração são esperadas em caso de rollback. Validação de quantidade de 1 a 99 por produto e de até 50 produtos distintos por pedido. Preços, taxa, desconto, subtotal e total usam centavos inteiros. A quantidade e o preço unitário determinam o subtotal de cada linha. Produtos, imagens, preços, contato e endereço são copiados para o pedido. O catálogo usa disponibilidade manual.
- **Checkout.** `place_order` aceita um UUID v4 aleatório por tentativa, modalidade, dados do cliente, linhas com `product_id` e `quantity`, e observações. Identidade vem da sessão. O banco bloqueia a configuração da loja durante a criação, valida bairro e catálogo e calcula os valores. O mesmo UUID com a mesma entrada devolve o pedido existente. O mesmo UUID com dados diferentes é rejeitado.
- **Pix.** O backend monta o BR Code com o total, referência única e CRC16. O pedido fica aguardando confirmação por cinco minutos. A expiração leva à revisão manual e libera a recompensa. A confirmação administrativa pode ser feita após o prazo, sem alterar a cobrança original. O QR é a renderização desse payload pelo frontend. A rotina `expire_pix_orders` em lote está pronta para um agendador de backend. A consulta autorizada de um pedido também trata a expiração pendente.
- **Recebimento.** Começa em preparo e com financeiro pendente. A sequência depende de entrega ou retirada. Conclusão exige confirmação financeira ou isenção. Pedido cancelado e concluído registram a data de encerramento.
- **Fidelidade.** Uma unidade paga de produto elegível gera um carimbo. O banco converte cada nove em uma recompensa e mantém os excedentes no saldo. O checkout reserva no máximo uma recompensa quando o produto de 300 ml configurado está disponível e foi adicionado ao carrinho. O item gratuito fica em linha separada e a taxa de entrega permanece. Locks na conta serializam reserva, resgate e estorno. Chaves únicas no histórico e idempotência das operações evitam aplicação duplicada.
- **Reembolso e abandono.** O fluxo implementa o registro administrativo de um reembolso integral, com motivo, data e responsável. Nenhum dinheiro é movimentado pelo banco. O estorno repõe a recompensa usada no pedido e reverte os carimbos; recompensas disponíveis excedentes podem ser revogadas. Se carimbos já viabilizaram recompensa comprometida, registra-se saldo compensatório negativo para abater de créditos futuros. Um pedido reembolsado que ainda está em andamento pode ser cancelado preservando a informação financeira. Recebimento e retirada gratuita abandonados precisam de cancelamento administrativo enquanto o prazo de abandono não for definido.
- **Recompensa como único item.** Preservado o comportamento do protótipo. Com retirada, o pedido de valor zero segue em preparo e a recompensa é baixada na conclusão. Com entrega, a taxa precisa ser paga. Confirmar com a loja se compras compostas exclusivamente pela recompensa devem continuar elegíveis após a integração.
- **Recebimentos.** `admin_financial_summary` usa um período semiaberto e separa recebimentos brutos por data de confirmação, reembolsos por data de registro, pendências pela criação do pedido e cancelamentos pelo encerramento. Uma cobrança estornada continua auditável e seu valor consta separadamente no período do estorno.
- **Notificações.** Cada alteração relevante de estado recebe uma revisão monotônica e um evento único na mesma transação. A fila prevê unicidade por evento e inscrição. Inscrição, processamento e envio de Web Push serão implementados posteriormente.

## Validação remota

A verificação remota após a aplicação registrou as sete versões no histórico e confirmou as 17 tabelas de aplicação em `public` e cinco em `private`. O catálogo contém 133 constraints validadas, entre elas 29 chaves estrangeiras, 54 índices válidos e quatro triggers de aplicação. As chaves compostas de pagamento e recompensa vinculam o valor ao pedido e o benefício ao titular.

A CLI registrou `seeds: []`. As contagens de catálogo, bairros, pedidos, pagamentos, movimentações de fidelidade e objetos do bucket continuam em zero. Há uma linha em `store_settings` com `is_open = false`, uma em `payment_settings` com a configuração Pix vazia e uma linha interna de assinatura de tokens. Na etapa de autenticação, vinculou-se exclusivamente a conta criada pela proprietária em `admin_users`. A vinculação não criou um perfil de cliente. Os testes remotos da etapa anterior estão em [Segurança do banco](security.md).

## Gestão do cardápio

Categorias têm nome, ordem e disponibilidade. Produtos têm publicação e disponibilidade independentes, preço em centavos, descrição, tamanho, foto e elegibilidade para carimbos. A ordem dos produtos é alfabética e categorias seguem `display_order`. Campos de descrição de categoria e ordenação manual de produto não existem no modelo atual.

A recompensa de 300 ml usa `store_settings.reward_product_id`. O painel exige que o item selecionado tenha tamanho de 300 ml e esteja marcado como elegível. Essa validação complementar ocorre na interface. O banco usa o UUID do produto e a regra transacional de fidelidade existente.

A migração `20261125000700_catalog_category_delete.sql` está preparada e aguarda autorização para produção. Ela concede `DELETE` em categorias ao papel `authenticated`, mantendo a política existente que exige administração e a chave estrangeira que impede excluir categorias vinculadas. Produtos permanecem sem exclusão pelo painel.

## Validação local e próximas migrações

O seed `supabase/seed.sql` é destinado ao ambiente local. Inclui catálogo, bairros e taxas fictícios, configura a recompensa de 300 ml e mantém a loja fechada. O teste SQL usa dados de Auth fictícios dentro de uma transação revertida.

Em um ambiente local isolado, após ligar o Docker:

```sh
npx supabase@3.4.0 start
npx supabase@3.4.0 db reset
psql -X -v ON_ERROR_STOP=1 "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/database.sql
psql -X -v ON_ERROR_STOP=1 "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/catalog.sql
```

Para futuras migrações, após autorização explícita para o ambiente remoto, confirme o projeto, confira o plano e aplique somente as migrações versionadas:

```sh
npx supabase@3.4.0 login
npx supabase@3.4.0 db push --remote=cncaqtbptrjqguzqbmpr --skip-vault --dry-run
npx supabase@3.4.0 db push --remote=cncaqtbptrjqguzqbmpr --skip-vault
```

A execução acima mantém o seed local. A loja continua fechada até a administração concluir a configuração e decidir abrir. [Referência da Supabase CLI](https://supabase.com/docs/reference/cli/introduction)
