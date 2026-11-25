# Bijus-s-card-pio-digital-
Sistema de visualização de cardápio da marca e lançamento de pedidos da parte do cliente, com gestão de operação da produção e salvamento de dados de compra do cliente, a fim de facilitar recompra e ativar programa de fidelidade 

## Desenvolvimento local

Use Node.js 22.12+ na linha 22 ou Node.js 24+.

```sh
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite. Para manter a mesma origem nos testes de autenticação, use `npm run dev -- --host localhost` e acesse `http://localhost:5173`.

Use `npm run build` para gerar `dist/` e `npm run preview` para conferir o build localmente.
Abra `/admin/login` para entrar com a conta cadastrada no Supabase Auth. O painel confere a sessão e a autorização no servidor. A loja de produção está fechada. O catálogo público lê dados reais e apresenta um estado vazio até o cadastro. A gestão de categorias e produtos está disponível no painel. Pedidos, faturamento e Pix ficam indisponíveis nesta etapa.

1. Acesse **Categorias → Nova categoria**, preencha nome e ordem de exibição e salve. Uma categoria ativa aparece no cardápio.
2. Acesse **Produtos → Novo produto**, informe categoria, nome, descrição e preço em reais. Selecione uma foto JPEG, PNG ou WebP de até 5 MiB e confira a prévia antes de salvar. Tamanho ou volume é opcional.
3. Controle separadamente a publicação e a disponibilidade. Um produto publicado, porém indisponível, aparece como esgotado. Um produto desativado ou ligado a uma categoria desativada fica oculto.
4. Para configurar a recompensa, marque o produto como elegível para carimbos, indique `300 ml` no tamanho e escolha **Definir como recompensa** na lista. O banco guarda o ID do produto.

A exclusão definitiva de categorias vazias depende da migração `20261125000700_catalog_category_delete.sql`, preparada localmente e pendente de autorização. Enquanto isso, use a desativação. Produtos têm desativação no painel para preservar o histórico.

Em **Authentication → URL Configuration**, confira se a origem de teste está permitida para os links de e-mail. Para desenvolvimento local, permita `http://localhost:5173/**` ou as URLs exatas de `/confirmar-email`, `/redefinir-senha` (inclusive com `?voltar=checkout`) e `/admin/redefinir-senha`. Abra os links no navegador em que iniciou o fluxo PKCE. O carrinho guarda os identificadores dos produtos e suas quantidades na origem do aplicativo.

Se o projeto estiver usando o SMTP padrão do Supabase, a entrega fica restrita aos endereços da equipe do projeto. Antes de cadastrar clientes, valide a configuração de envio e os redirecionamentos com usuários de teste autorizados. [Envio de e-mails do Supabase Auth](https://supabase.com/docs/guides/auth/auth-smtp)

Execute `npm test` para rodar os testes das regras de pedidos, Pix, fidelidade e autorização.

## Conexão inicial com o Supabase

Copie `.env.example` para `.env.local` se o arquivo ainda não existir. Em **Settings → API Keys**, copie a chave **Publishable** do projeto `bijus-doce` (prefixo `sb_publishable_`) e preencha `VITE_SUPABASE_PUBLISHABLE_KEY` no arquivo local. As variáveis `VITE_*` são destinadas à configuração pública do frontend.

Execute `npm run supabase:check` para fazer uma leitura de `GET /auth/v1/settings`. A verificação confirma a comunicação com o projeto e o aceite da chave pública. O cliente reutilizável está em `src/lib/supabase.js`.

A configuração da CLI está em `supabase/config.jsonc`, gerada com `npx supabase@3.4.0 init`. A execução da pilha local exige o motor do Docker ativo. A modelagem, as permissões explícitas da API de Dados e as políticas RLS serão trabalhadas em migrações locais.

- [Requisitos](docs/requirements.md)
- [Arquitetura](docs/architecture.md)
- [Proposta de banco de dados](docs/database.md)
