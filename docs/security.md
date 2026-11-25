# Segurança do banco

RLS e concessões explícitas trabalham em conjunto. Cada tabela da aplicação tem RLS habilitado. Os papéis da Data API recebem apenas os privilégios necessários para as operações da etapa. [Segurança da API Supabase](https://supabase.com/docs/guides/api/securing-your-api)

| Ator | Acesso previsto |
| --- | --- |
| Visitante | Leitura do catálogo publicado, categorias e bairros disponíveis e estado público da loja. Criação e acompanhamento por RPC. |
| Cliente autenticado | Leitura e edição do próprio perfil, gestão dos próprios endereços e leitura dos próprios pedidos, itens e fidelidade. O financeiro do próprio pedido vem da projeção autorizada. |
| Administração | Autorização conferida em `admin_users` pelo UUID da sessão. Gestão de catálogo, bairros, loja e configuração Pix. Leitura de pedidos, pagamentos e histórico. Transições, confirmações e reembolsos via RPC com auditoria. |
| Backend | Execução da varredura de Pix pelo papel de serviço. Inscrições e fila de notificações ficam fechadas aos papéis do frontend até a implementação dos endpoints autorizados. |

## Limites de acesso

- O cadastro comum cria perfil vinculado a `auth.uid()`. O operador do banco provisiona administradores após verificar o UUID em `auth.users`. Metadados editáveis e rotas do frontend são independentes dessa decisão de autorização.
- As RPCs privilegiadas fixam `search_path` vazio, qualificam referências, verificam o usuário ou o token e têm `EXECUTE` restrito. O pagamento, pedido, histórico e saldo são mutados somente nas operações transacionais. Clientes e administração têm acesso de leitura ao subconjunto que lhes cabe, conforme as políticas.
- O token de visitante tem 256 bits, derivados por HMAC de segredo privado e dados da tentativa. Só seu hash é armazenado no pedido associado. O UUID v4 do checkout de visitante é outro valor privado enquanto o cliente pode repetir a tentativa para recuperar o mesmo token. O número público é somente identificação. A projeção de visitante inclui andamento, itens, valores e cobrança ativa; telefone, endereço completo, configuração do recebedor e inscrições ficam fora da resposta.
- As chaves Pix são privadas na configuração e nos snapshots financeiros. O próprio payload BR Code é entregue somente ao responsável pelo pedido quando a cobrança está ativa. Variáveis públicas de frontend usam a Publishable Key. Senhas bancárias e chaves da conta de serviço pertencem a seu ambiente autorizado.
- A camada de integração deverá impor limitação de requisições antes da abertura do checkout público, usar respostas privadas sem cache, evitar registrar tokens e IDs de tentativa e expirar ou invalidar tokens conforme política de retenção. O SQL inicial oferece idempotência e limites de entrada; rate limiting e relação segura das inscrições Push com a sessão ou pedido ficam para os endpoints de integração.

## Storage

O bucket público `product-images` permite leitura por URL. Listagem de metadados e escrita são limitadas à administração. O bucket define 5 MiB por imagem e MIME JPEG, PNG ou WebP. O produto registra o caminho do objeto. As políticas protegem caminhos referenciados pelo catálogo ou histórico contra edição e exclusão. O fluxo de troca deve carregar o novo arquivo em um caminho versionado e atualizar o produto. [Controle de acesso do Storage](https://supabase.com/docs/guides/storage/security/access-control)

## Validação no ambiente Supabase

No projeto de produção `bijus-doce` (`cncaqtbptrjqguzqbmpr`), o catálogo remoto confirmou RLS nas 22 tabelas de aplicação, 21 políticas da aplicação e quatro do bucket. O papel `anon` pode ler quatro tabelas públicas e não tem privilégios diretos de escrita. `authenticated` tem grants limitados, sujeitos às políticas de titularidade ou administração. Ambos carecem de `USAGE` no schema `private`.

As oito funções `SECURITY DEFINER` da aplicação têm `search_path` vazio e revogação de `EXECUTE` de `PUBLIC`. O catálogo também contém a função gerenciada `rls_auto_enable`, vinculada ao trigger automático do Supabase e separada das oito funções da aplicação.

| Papéis com `EXECUTE` concedido | Funções |
| --- | --- |
| `anon` e `authenticated` | `place_order`, `track_guest_order` |
| `authenticated` | `get_my_order`, `is_admin`, `can_change_product_image`, `admin_order_action`, `admin_financial_summary` |
| `service_role` | `expire_pix_orders` |

Foram realizadas 34 verificações HTTP usando apenas a Publishable Key. Auth e as quatro leituras públicas responderam HTTP 200. As 13 tabelas de acesso direto restrito e seis RPCs privilegiadas recusaram acesso anônimo com HTTP 401 e SQLSTATE `42501`. A seleção de `private` e `storage` pela Data API foi recusada com HTTP 406 e `PGRST106`. Um token de acompanhamento inexistente recebeu `null`. O checkout recusou a solicitação com HTTP 400 e `P0001` por a loja estar fechada. A inspeção posterior confirmou que nenhum pedido ou chave de idempotência foi gravado.

O catálogo confirmou `product-images` público, limite de 5 MiB, JPEG, PNG e WebP, com políticas administrativas de listagem, upload, edição e exclusão. Na API de Storage, as listagens anônimas retornaram vazias. Como o bucket está sem arquivos, os testes HTTP de leitura de um objeto público e de isolamento com objetos existentes ainda dependem de fixtures autorizadas.

Na etapa de Auth, a conta já criada pela proprietária foi vinculada como a única administradora com uma inserção idempotente. O RLS de `admin_users` permaneceu ativo. As telas privadas verificam a identidade com Supabase Auth. O painel chama adicionalmente `is_admin` e volta a conferir a autorização na navegação ou quando a janela recebe foco. As operações de perfil e endereço usam o token da sessão específica e continuam sujeitas a RLS.

O primeiro login administrativo em produção é reservado à proprietária. A validação com contas reais de cliente, entrega dos e-mails de confirmação e recuperação e testes de titularidade com dois usuários requerem autorização para criar os usuários de teste. Upload e isolamento de imagens precisam de fixtures autorizadas. Testes com múltiplas conexões ainda precisam exercitar idempotência, reservas simultâneas de recompensas e transições concorrentes. O limite de requisições do checkout público e o agendamento de expiração do Pix devem ser validados antes da abertura da loja. Realtime e Web Push dependem de integração própria.
