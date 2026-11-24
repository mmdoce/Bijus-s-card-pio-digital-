# Proposta de banco de dados e segurança

Valores monetários em centavos inteiros com limites e restrições. Horários em timestamptz. Chaves estrangeiras protegem referências. Índices iniciais por cliente e data, estado e prazo, e relacionamentos usados nas consultas. Preservar o histórico de pedidos ao desativar produtos ou bairros.

| Entidade | Campos e relacionamentos |
| --- | --- |
| profiles | UUID vinculado a auth.users, nome, WhatsApp, bairro, rua, número, complemento e referência |
| admin_account | Registro singleton com UUID exclusivo vinculado a auth.users. Provisionamento privilegiado |
| store_settings | Registro singleton com loja aberta, parâmetros públicos e referência ao SKU de brinde |
| categories | Nome, ordenação e publicação |
| products | Categoria, nome, descrição, foto, preço, ativo, disponível, sinalização de açaí |
| delivery_neighborhoods | Nome, taxa e ativo |
| orders | Cliente opcional, hash de token, snapshots de contato, modalidade de recebimento, endereço e bairro, taxa, observações, desconto, subtotal, total e status operacional |
| order_items | Pedido, produto, nome, descrição, tamanho, referência de foto versionada e preço congelados, quantidade e tipo pago ou brinde |
| payments | Pedido, modalidade, status financeiro, total, prazo para Pix, data de confirmação e UUID da administradora responsável |
| order_status_events | Pedido, transição, ator, momento e motivo quando aplicável |
| loyalty_accounts | Uma conta por cliente, usada como unidade de bloqueio para transações |
| loyalty_entries | Conta, pedido, tipo, quantidade e chave única para crédito, reserva, baixa e estorno |
| checkout_requests | Chave de idempotência única, hash da solicitação e vínculo ao pedido |

## Acesso

- Ativar RLS em todas as tabelas expostas. Aplicar privilégio mínimo e conceder somente operações explícitas. Evitar expor configurações privadas, hashes de tokens ou registros operacionais ao navegador.
- Anônimo lê projeções do catálogo e bairros ativos. Cliente autenticado lê perfil, histórico e fidelidade próprios por auth.uid(). Nenhum cliente grava valor, status, pagamento ou fidelidade diretamente.
- Visitante recebe token aleatório de alta entropia. Guardar somente hash, consultar por endpoint limitado com rate limit e retornar projeção mínima do pedido. Evitar logs e vazamento por cabeçalho Referer. Não conceder SELECT público sobre pedidos.
- Validar a administradora contra a tabela singleton em toda operação privilegiada. Proteger atualizações de status com transições e auditoria. Limitar grants de funções, usar search_path explícito em funções privilegiadas e nunca expor chaves de serviço ao cliente.
- Permitir edição somente do próprio perfil e restringir escrita no bucket de produtos à administração. Preservar arquivos versionados referenciados por pedidos e armazenar no banco as referências das imagens.

## Transações propostas

- **Criação.** Validar loja, produtos, quantidades, modalidade e bairro no servidor. Derivar identidade da sessão. Calcular snapshots e prazo de cinco minutos atomicamente. Chave de idempotência identifica tentativas repetidas. Se houver reutilização da chave com dados diferentes, rejeitar.
- **Fidelidade.** Sob bloqueio da conta, reservar nove carimbos para o pedido elegível com brinde. Reserva reduz saldo resgatável e preserva excedentes. Na confirmação manual, converter reserva em baixa e creditar apenas unidades pagas de açaí. Expiração ou cancelamento libera a reserva. Se um Pix expirado for aceito após revisão, revalidar a disponibilidade da recompensa na mesma transação. Aplicar reversões compensatórias em cancelamentos posteriores conforme regra aprovada.
- **Pagamento.** Bloquear registro do pedido e do pagamento ao revisar ou confirmar. Registrar evidência operacional e ator, usar restrição única por confirmação e tratar repetição como leitura do resultado existente. Expiração, confirmação e cancelamento operam sobre estado persistido com relógio do banco.
- **Estados.** Pix antecipado começa aguardando pagamento e passa para revisão manual quando vence. A confirmação financeira libera o preparo. Pagamento no recebimento e pedido sem saldo começam em preparo. Concluir exige confirmação quando há saldo a receber. As consultas financeiras incluem apenas valores confirmados.

As políticas RLS, constraints e testes de concorrência serão implementados nas próximas etapas.
