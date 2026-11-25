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
| src/styles | Estilos globais e tema |
| supabase/migrations | Futuras migrações SQL versionadas |
| supabase/functions | Futuras Edge Functions |

O catálogo, os bairros e o funcionamento da loja são consultados no Supabase. A gestão autenticada grava categorias e produtos sob RLS. O cardápio agrupa as categorias ativas pela ordem de exibição e ordena seus produtos por nome. O catálogo é atualizado após uma gravação no painel e ao voltar o foco para a janela. O carrinho persiste IDs e quantidades no navegador e resolve esses IDs com o catálogo real ao carregar. O checkout segue acessível ao visitante, com envio de pedidos e pagamentos desativado nesta etapa.

O Supabase Auth usa sessão persistente, renovação automática e PKCE para links de e-mail. O frontend valida a identidade com `getUser` e vincula consultas privadas ao token da sessão. Depois da confirmação, dados de cadastro validados permitem criar o registro de `profiles` pela RLS, com `auth.uid()` preenchido pelo banco. O perfil permite editar o contato e cadastrar ou editar o endereço exibido, com uma operação independente por formulário.

O painel usa rotas e layout próprios em `/admin`. Depois da validação da sessão, a RPC `is_admin` informa se o UUID consta em `admin_users`. A verificação é repetida ao navegar no painel ou voltar o foco à janela. A configuração `VITE_PUBLIC_MENU_URL` permite apontar o link de retorno para outro domínio.

Fotos usam caminhos únicos em `product-images`, com prévia por URL local antes da gravação. A substituição verifica se o caminho atual ainda é o que o administrador editou. A limpeza tenta remover arquivos novos após falhas confirmadas e fotos anteriores após o salvamento. As políticas do Storage preservam caminhos do catálogo e do histórico. Quando o resultado da gravação permanece incerto ou a limpeza falha, pode ser necessária revisão manual. [Uploads no Supabase Storage](https://supabase.com/docs/guides/storage/uploads/standard-uploads)

## Integração futura

O banco está provisionado no projeto Supabase de produção `bijus-doce` (`cncaqtbptrjqguzqbmpr`), com as sete migrações registradas e a loja fechada. O [diagrama do banco](database.md) e a [validação remota de segurança](security.md) descrevem o estado conferido. A proprietária foi vinculada à administração. A integração inicial de Auth mantém estados vazios para as funcionalidades comerciais pendentes.

- **Auth.** Confirmar os redirecionamentos autorizados no projeto, validar entrega de e-mails e testar sessões de dois clientes e um administrador com contas autorizadas.
- **Catálogo e Storage.** Leituras públicas limitadas ao catálogo publicado, bairros ativos e situação da loja. Upload e remoção de fotos reservados à administradora. Para o catálogo público, usar bucket com leitura pública e escrita restrita.
- **Checkout.** Conectar o frontend à operação transacional `place_order`, com limites de requisições para o fluxo público. A RPC valida a loja, calcula preço e taxa, reserva fidelidade, registra snapshots e devolve o resumo. O navegador recebe as variáveis públicas descritas em `.env.example`.
- **Pix.** Conectar a tela administrativa à configuração protegida por RLS. A RPC retorna o BR Code calculado no banco. Agendar a rotina de expiração e manter a confirmação como ação explícita da administração.
- **Pedidos e Realtime.** Integrar a projeção mínima de acompanhamento à barra. Os tokens de visitante emitidos pelo banco têm 64 caracteres hexadecimais. Usar endpoint limitado e respostas privadas sem cache, com polling inicial ou assinatura privada autorizada, e reconciliar por revisão ao reconectar. WhatsApp apenas abre mensagem pronta.
- **Indicadores.** Consultas ou funções autorizadas no PostgreSQL agregam os registros persistidos segundo período e regras de negócio aprovadas.

Ambientes de desenvolvimento, homologação e produção devem ser separados. Chaves privilegiadas ficam somente no servidor. A fundação atual funciona sem configuração de ambiente.

## Plano para PWA e Web Push

1. Adicionar Web App Manifest com nome, ícones locais de 192 e 512 px, versão maskable, cores do tema, `start_url`, escopo e modo de exibição. Servir por HTTPS e validar instalação nos navegadores suportados. [Web App Manifest](https://www.w3.org/TR/appmanifest/)
2. Registrar Service Worker no escopo do cardápio, com atualização versionada. Limitar cache a recursos públicos e excluir checkout, contas, operações administrativas e acompanhamento privado.
3. Na ação explícita da página de pedido, verificar suporte, solicitar permissão e inscrever com `PushManager` e a chave VAPID pública. Oferecer desativação que revoga a associação no servidor e cancela a inscrição no navegador quando ela não está vinculada a outros pedidos. Tratar permissão negada, inscrição expirada e troca de dispositivo. [Push API](https://www.w3.org/TR/push-api/) e [RFC 8292](https://www.rfc-editor.org/rfc/rfc8292)
4. Validar sessão ou posse de token na inscrição. Vincular cada inscrição ao cliente ou a pedidos autorizados, restringir acesso a endpoint e chaves de inscrição e manter a chave VAPID privada como segredo do backend.
5. Registrar um evento de mudança na mesma transação do pedido. O worker de envio lê a fila, deduplica pelo par inscrição e evento, tenta novamente falhas transitórias e remove inscrições inválidas. O Service Worker usa o ID do evento para deduplicar e o ID do pedido como tag para agrupar notificações. Evitar dados de contato, detalhes de pagamento e tokens privados no payload.
6. Em `notificationclick`, abrir ou focar a rota de acompanhamento em HTTPS e revalidar a autorização. Para visitantes, planejar vínculo ao dispositivo ou troca de código opaco, curto e descartável para recuperar o acesso, sem carregar o token privado na mensagem. Validar clique, revogação, reconexão e entrega em segundo plano antes de liberar a opção.
