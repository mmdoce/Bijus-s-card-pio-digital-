# Arquitetura

## Fundação local

React e Vite entregam uma SPA com JavaScript, React Router e Tailwind CSS. O endpoint de hospedagem futuro deve encaminhar rotas do cliente a index.html para suportar navegação direta.

| Diretório | Responsabilidade |
| --- | --- |
| src/app | Entrada e roteamento |
| src/components | Componentes visuais compartilhados |
| src/features | Catálogo, carrinho, checkout, pedidos, conta e acesso administrativo |
| src/layouts | Layouts de cliente e administração |
| src/lib | Utilitários compartilhados e futuros adaptadores |
| src/mocks | Catálogo, bairros e pedido demonstrativos |
| src/styles | Estilos globais e tema |
| supabase/migrations | Futuras migrações SQL versionadas |
| supabase/functions | Futuras Edge Functions |

O carrinho, as sessões demonstrativas de cliente e administradora, os pedidos, o catálogo e os dados de pagamento vivem em memória na mesma aba. O estado aberto ou fechado usa armazenamento local e é conferido na criação de pedidos, inclusive quando outra aba fez a alteração. Fotos locais usam URLs de objeto mantidas durante a sessão para preservar os pedidos anteriores. O protótipo usa uma chave Pix fictícia, um relógio local e confirmações administrativas simuladas.

O adaptador de Pix oferece leitura e gravação de configuração à administração e gera o payload a partir do total do pedido. Nome e cidade entram nos novos códigos, junto de uma chave de e-mail de teste em domínio `.invalid`. Para qualquer outra chave cadastrada, o adaptador usa a chave padrão de demonstração. O BR Code gerado fica no pedido para que mudanças na configuração valham somente para novas compras. [Manual de Padrões para Iniciação do Pix](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/Regulamento_Pix/II_ManualdePadroesparaIniciacaodoPix.pdf)

`ActiveOrderBar` consome os pedidos autorizados pelo provedor atual. A sessão do navegador guarda apenas os tokens opacos de visitante e os identificadores de dispensas. Os registros dos pedidos continuam em memória, portanto recuperar o status após recarregar depende do backend. Pedidos cadastrados são filtrados pelo ID da conta. A aba mantém uma revisão por pedido para detectar alterações reais, desconsiderar versões repetidas ou antigas e evitar tocar ao montar a primeira lista. O controle sonoro do cliente usa o mesmo serviço Web Audio do painel, com uma instância independente.

O painel usa rotas e layout próprios em `/admin`. O acesso demonstrativo e o atalho no cardápio são limitados a `import.meta.env.DEV`. A rota `/admin/login` permanece disponível na compilação de produção, com acesso bloqueado até a integração. `VITE_PUBLIC_MENU_URL` permite apontar o link de retorno do painel para outro domínio. As rotas reservadas e a configuração de URL são independentes da autorização no servidor.

## Integração futura

- **Auth.** Sessões Supabase para clientes com e-mail e senha. Administradora provisionada separadamente por UUID. O frontend consulta sessão e autorização para navegação. PostgreSQL e Edge Functions validam identidade e privilégios em todas as operações protegidas.
- **Catálogo e Storage.** Leituras públicas limitadas ao catálogo publicado, bairros ativos e situação da loja. Upload e remoção de fotos reservados à administradora. Para o catálogo público, usar bucket com leitura pública e escrita restrita.
- **Checkout.** Edge Function valida entrada e chama uma operação transacional no PostgreSQL. O servidor valida a abertura da loja na mesma transação, calcula preço e taxa, reserva fidelidade quando aplicável, registra snapshots do cliente e dos produtos e devolve o resumo. O navegador recebe somente as variáveis públicas descritas em .env.example.
- **Pix.** Implementar leitura e gravação administrativa autenticadas para a configuração do recebedor. Calcular o payload no servidor a partir do total persistido e devolver somente os dados de cobrança do pedido autorizado. Usar relógio do servidor, rotina de expiração e ações explícitas da administradora para a confirmação.
- **Pedidos e Realtime.** Servir à barra uma projeção mínima com número, modalidade, estados, revisão monotônica, conclusão e rota autorizada. Clientes autenticados usam leitura e canais privados com RLS. Visitantes consultam ou reconciliam os tokens por endpoint limitado, com hash no servidor, limitação de requisições e respostas privadas sem cache. Começar com polling para visitantes ou assinatura privada com autorização equivalente. Na reconexão, reconciliar por revisão. WhatsApp apenas abre mensagem pronta.
- **Indicadores.** Consultas ou funções autorizadas no PostgreSQL agregam os registros persistidos segundo período e regras de negócio aprovadas.

Ambientes de desenvolvimento, homologação e produção devem ser separados. Chaves privilegiadas ficam somente no servidor. A fundação atual funciona sem configuração de ambiente.

## Plano para PWA e Web Push

1. Adicionar Web App Manifest com nome, ícones locais de 192 e 512 px, versão maskable, cores do tema, `start_url`, escopo e modo de exibição. Servir por HTTPS e validar instalação nos navegadores suportados. [Web App Manifest](https://www.w3.org/TR/appmanifest/)
2. Registrar Service Worker no escopo do cardápio, com atualização versionada. Limitar cache a recursos públicos e excluir checkout, contas, operações administrativas e acompanhamento privado.
3. Na ação explícita da página de pedido, verificar suporte, solicitar permissão e inscrever com `PushManager` e a chave VAPID pública. Oferecer desativação que revoga a associação no servidor e cancela a inscrição no navegador quando ela não está vinculada a outros pedidos. Tratar permissão negada, inscrição expirada e troca de dispositivo. [Push API](https://www.w3.org/TR/push-api/) e [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)
4. Validar sessão ou posse de token na inscrição. Vincular cada inscrição ao cliente ou a pedidos autorizados, restringir acesso a endpoint e chaves de inscrição e manter a chave VAPID privada como segredo do backend.
5. Registrar um evento de mudança na mesma transação do pedido. O worker de envio lê a fila, deduplica pelo par inscrição e evento, tenta novamente falhas transitórias e remove inscrições inválidas. O Service Worker usa o ID do evento para deduplicar e o ID do pedido como tag para agrupar notificações. Evitar dados de contato, detalhes de pagamento e tokens privados no payload.
6. Em `notificationclick`, abrir ou focar a rota de acompanhamento em HTTPS e revalidar a autorização. Para visitantes, planejar vínculo ao dispositivo ou troca de código opaco, curto e descartável para recuperar o acesso, sem carregar o token privado na mensagem. Validar clique, revogação, reconexão e entrega em segundo plano antes de liberar a opção.
