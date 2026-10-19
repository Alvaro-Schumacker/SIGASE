# SIGASE

Aplicação executada localmente, com dados cadastrais e registros do sistema armazenados em um banco PostgreSQL no Supabase. O navegador conversa somente com o servidor Python local; a connection string do banco fica no backend e não é enviada ao navegador.

## Configuração do Supabase

1. Crie um projeto Supabase dedicado ao SIGASE.
2. No painel do projeto, abra **SQL Editor**, cole o conteúdo de `supabase/schema.sql` e execute uma vez.
3. Em **Connect**, copie a connection string do **Session pooler** (recomendado para computadores sem IPv6). Use a opção com SSL.
4. Copie `.env.example` para `.env` e substitua `SUPABASE_DATABASE_URL` pela connection string completa. Não compartilhe o arquivo `.env` nem o envie ao GitHub.

O schema cria as tabelas e índices do sistema. RLS fica habilitado e os papéis `anon` e `authenticated` não recebem acesso às tabelas; o SIGASE acessa o banco pelo servidor local. O servidor insere o usuário inicial **Administrador** (login `0000`, senha `0000`) apenas se a tabela de usuários estiver vazia. Altere a senha inicial antes de cadastrar informações reais.

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

Abra `http://127.0.0.1:8000`. O servidor escuta apenas em `127.0.0.1`; `SIGASE_PORT` pode alterar a porta.

## Funcionalidades

- Visão geral, tarefas, caixa de entrada e histórico de atualizações.
- Equipe e permissões: visualizador, editor e administrador.
- Efetivo, avisos, documentos, mapa da força, plano de férias e escalas de serviço.
- Registros da API armazenados no PostgreSQL do Supabase.

## Dados e limitações

O SIGASE mantém a interface e o servidor no computador local, mas os registros do banco ficam hospedados no Supabase e dependem de conexão com a internet. A connection string contém uma credencial privilegiada de banco: mantenha-a somente no `.env` local, que está ignorado pelo Git. Não use a senha ou credencial privilegiada do Supabase no JavaScript do navegador.

As tarefas e notificações de conclusão de tarefas ainda são mantidas no armazenamento local de cada navegador; não são sincronizadas entre computadores. Os demais registros acessados pela API usam Supabase. O projeto não migra automaticamente registros de um SQLite antigo. Esta configuração inicial cria o schema e semeia apenas as categorias e o administrador quando necessário.

Antes de usar dados pessoais, ajuste a senha padrão, configure cópias de segurança e valide os controles de acesso e as regras aplicáveis à organização. Não há integração com Google Drive nem envio de arquivos para o Supabase.
