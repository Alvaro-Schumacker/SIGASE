# SIGASE 1.0.3

Aplicação executada localmente, com dados cadastrais e registros do sistema armazenados em um banco PostgreSQL no Supabase. O navegador conversa somente com o servidor Python local; a connection string do banco fica no backend e não é enviada ao navegador.

## Configuração do Supabase

1. Crie um projeto Supabase dedicado ao SIGASE.
2. No painel do projeto, abra **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e execute uma vez.
3. Em **Connect**, copie a connection string do **Session pooler** (recomendado para computadores sem IPv6). Use a opção com SSL.
4. Copie `.env.example` para `.env` e substitua `SUPABASE_DATABASE_URL` pela connection string completa. Não compartilhe o arquivo `.env` nem o envie ao GitHub.

O schema cria as tabelas e índices do sistema, incluindo a tabela `tasks` para sincronização de tarefas entre usuários e dispositivos e os campos ampliados do efetivo da unidade. Após atualizar o projeto, execute novamente o conteúdo atualizado de `supabase/schema.sql` no SQL Editor para criar a tabela de tarefas no projeto Supabase existente. RLS fica habilitado e os papéis `anon` e `authenticated` não recebem acesso às tabelas; o SIGASE acessa o banco pelo servidor local. O servidor insere o usuário inicial **Administrador** (login `0000`, senha `0000`) apenas se a tabela de usuários estiver vazia. Altere a senha inicial antes de cadastrar informações reais.

### Atualização do efetivo da unidade

Esta versão adiciona número militar e posição de antiguidade ao efetivo. Em um projeto Supabase já existente, execute manualmente `supabase/migration_20261019_unit_personnel_seniority.sql` no SQL Editor antes de iniciar o SIGASE atualizado. A migração preenche uma ordem inicial por nome dentro de cada graduação; revise as posições no cadastro para refletir a antiguidade real. Nenhuma alteração foi aplicada diretamente ao seu projeto Supabase.

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

- Requerimentos arquivados por ano e por categoria de posto/graduação.
