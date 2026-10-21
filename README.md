# SIGASE 1.0.5

Aplicação executada localmente, com dados cadastrais e registros do sistema armazenados em um banco PostgreSQL no Supabase. O navegador conversa somente com o servidor Python local; a connection string do banco fica no backend e não é enviada ao navegador.

## Configuração do Supabase

1. Crie um projeto Supabase dedicado ao SIGASE.
2. No painel do projeto, abra **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e execute uma vez.
3. Em **Connect**, copie a connection string do **Session pooler** (recomendado para computadores sem IPv6). Use a opção com SSL.
4. Copie `.env.example` para `.env` e substitua `SUPABASE_DATABASE_URL` pela connection string completa. Não compartilhe o arquivo `.env` nem o envie ao GitHub.

O schema cria as tabelas e índices do sistema, incluindo a tabela `tasks` para sincronização de tarefas entre usuários e dispositivos e os campos ampliados do efetivo da unidade. Após atualizar o projeto, execute novamente o conteúdo atualizado de `supabase/schema.sql` no SQL Editor para criar a tabela de tarefas no projeto Supabase existente. RLS fica habilitado e os papéis `anon` e `authenticated` não recebem acesso às tabelas; o SIGASE acessa o banco pelo servidor local. O servidor insere o usuário inicial **Administrador** (login `0000`, senha `0000`) apenas se a tabela de usuários estiver vazia. Altere a senha inicial antes de cadastrar informações reais.

### Atualização do efetivo da unidade

Esta versão adiciona número militar e posição de antiguidade ao efetivo. Em um projeto Supabase já existente, execute manualmente `supabase/migration_20261019_unit_personnel_seniority.sql` no SQL Editor antes de iniciar o SIGASE atualizado. A migração preenche uma ordem inicial por nome dentro de cada graduação; revise as posições no cadastro para refletir a antiguidade real. Nenhuma alteração foi aplicada diretamente ao seu projeto Supabase.

Os perfis de usuário agora aceitam um ícone de animal. Em um projeto Supabase já existente, execute também `supabase/migration_user_avatar_icon.sql` no SQL Editor. Os sete ícones de perfil ficam em `assets/icons/animals/`; ícones do menu ficam em `assets/icons/menu/`, e logotipo e favicon em `assets/brand/`.

### Permissões por área

A versão atual separa Visitante (visualização), Editor (edição nas áreas marcadas no perfil) e Administrador (acesso total e gerenciamento de usuários). Antes de iniciar esta versão em um projeto Supabase existente, execute `supabase/migration_user_area_permissions.sql` no SQL Editor. A migração mantém aos editores existentes permissões iniciais para Tarefas, Documentos e Requerimentos; o administrador pode ajustar as áreas depois. Nenhuma alteração é feita diretamente no seu banco.

### Tarefas para vários usuários

Para permitir vários responsáveis por tarefa em um projeto Supabase existente, execute `supabase/migration_multiple_task_assignees.sql` no SQL Editor antes de iniciar o servidor atualizado. Ela cria a relação de responsáveis e preserva os responsáveis das tarefas existentes. Quando qualquer responsável concluir uma tarefa, o status compartilhado é atualizado e ela deixa a aba Recebidas dos demais responsáveis.

### Ano de referência do plano de férias

O plano de férias agora organiza os períodos em `REF 2025` e `REF 2026`, cada um com as pastas Anteriores, Atuais e Futuras. Em projetos Supabase existentes, execute `supabase/migration_vacation_reference_year.sql` no SQL Editor para adicionar e preencher o campo de referência antes de usar a versão 1.0.4. Ao incluir um período, o formulário sugere REF 2025 para início antes de 1º de dezembro de 2026 e REF 2026 a partir dessa data. Essa sugestão pode ser alterada e não restringe as datas; períodos existentes mantêm o ano de referência salvo. Nenhuma alteração foi aplicada diretamente ao seu projeto Supabase.

## Organização dos arquivos

Imagens do sistema ficam em `assets/`, scripts e páginas principais na raiz, e scripts do banco em `supabase/`. O banco SQLite antigo foi preservado em `data/legacy/`; o servidor atual usa o Supabase e não lê esse arquivo.

## Executar localmente

Requisitos: Python 3.10 ou mais recente.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
# Edite .env e configure SUPABASE_DATABASE_URL antes de iniciar
python server.py
```

Abra `http://127.0.0.1:8000`. O servidor escuta apenas em `127.0.0.1`; `SIGASE_PORT` pode alterar a porta. Após entrar, a sessão permanece válida por uma hora e sobrevive à atualização da página. Use o botão de saída para encerrar a sessão imediatamente.

## Funcionalidades

- Visão geral, tarefas, caixa de entrada e histórico de atualizações.
- Equipe e permissões: visualizador, editor e administrador.
- Efetivo, avisos, documentos, mapa da força e plano de férias.
- Escalas de serviço mensais com ordem definida dos participantes, contagem de folgas e relatório dos próximos serviços.
- Indicador visual durante operações de rede mais demoradas.
- Registros da API armazenados no PostgreSQL do Supabase.

## Dados e limitações

O SIGASE mantém a interface e o servidor no computador local, mas os registros do banco ficam hospedados no Supabase e dependem de conexão com a internet. A connection string contém uma credencial privilegiada de banco: mantenha-a somente no `.env` local, que está ignorado pelo Git. Não use a senha ou credencial privilegiada do Supabase no JavaScript do navegador.

As tarefas são armazenadas no PostgreSQL do Supabase e aparecem para o solicitante e para o responsável em dispositivos diferentes. O histórico de atualizações também é compartilhado. As notificações de conclusão legadas do protótipo podem permanecer apenas no armazenamento local do navegador. O projeto não migra automaticamente registros de um SQLite antigo. Esta configuração inicial cria o schema e semeia apenas as categorias e o administrador quando necessário.

Antes de usar dados pessoais, ajuste a senha padrão, configure cópias de segurança e valide os controles de acesso e as regras aplicáveis à organização. Não há integração com Google Drive nem envio de arquivos para o Supabase.

### Requerimentos

- A área Requerimentos arquiva o documento de Prorrogação de tempo de serviço em três páginas, com campos de efetivo preenchidos a partir do cadastro da unidade, dados funcionais editáveis, cálculo do tempo efetivo e impressão em A4.

### Requerimentos no Supabase existente

Para habilitar o tipo documental Prorrogação de tempo de serviço em um projeto já criado, execute manualmente supabase/migration_20261019_prorrogacao_documents.sql no SQL Editor do Supabase. A migração apenas amplia os tipos aceitos pela tabela documents; não altera nem remove os documentos existentes. O SIGASE informa no navegador quando essa migração ainda não foi aplicada.

O requerimento de Adiantamento de 13º salário também utiliza a tabela `documents`. Em projeto Supabase existente, execute `supabase/migration_adiantamento13_documents.sql` no SQL Editor antes de salvar o novo tipo documental. O formulário usa os dados do efetivo da unidade e mantém editáveis o número EB, a parcela, o ano e mês de férias e o nome do comandante.

- Requerimentos arquivados por ano e por categoria de posto/graduação.
