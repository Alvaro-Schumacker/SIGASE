# SIGASE 1.0

Sistema Integrado de Gestão Administrativa da Sargenteação. Aplicação local com interface em HTML, CSS e JavaScript, servidor Python e banco de dados SQLite.

## Acesso inicial

- Endereço: `http://127.0.0.1:8000`
- Login: `0000`
- Senha: `0000`

O administrador pode cadastrar usuários, definir credenciais, permissões e funções na página **Equipe e permissões**.

## Executar

1. Instale Python 3.10 ou mais recente.
2. Abra um terminal na pasta do projeto e execute `python server.py`.
3. Acesse o endereço local acima. O servidor aceita conexões apenas neste computador.

O arquivo `sigase.sqlite3` é criado automaticamente ao iniciar o sistema. Não há conexão com serviços externos.

## Funcionalidades

- Visão geral, tarefas, caixa de entrada e histórico de atualizações.
- Equipe e permissões: somente visualização, editor de documentos e administrador.
- Efetivo da unidade, pesquisa e ficha individual.
- Avisos direcionados a usuários selecionados, com confirmação individual.
- Aditamentos, pernoites e FATDs, organizados por ano e mês, com prévia, edição e impressão.
- Mapa da Força ligado ao efetivo e pronto para impressão.
- Plano de Férias com parcelas, calendário e avisos automáticos.
- Escalas de serviço em grade mensal, com contagem de folgas e relatório de próximos serviços.

Os registros do SQLite são compartilhados entre navegadores que acessam este servidor no mesmo computador. Tarefas e notificações de tarefas ficam no armazenamento local de cada navegador.

## Banco e cópias

O banco atual foi iniciado sem registros de pessoal, escalas, documentos, férias ou avisos. Para fazer uma cópia, encerre o servidor e copie `sigase.sqlite3` para um local protegido. O `.gitignore` exclui o banco, cópias e arquivos temporários do versionamento.

## Segurança e limites

Esta instalação é local e não deve ser exposta à rede ou à internet. A senha inicial `0000` é simples e precisa ser trocada antes de inserir informações pessoais. As senhas são armazenadas com hash, mas o arquivo SQLite não é criptografado e não há cópias automáticas, recuperação de conta, auditoria abrangente ou controles de segurança apropriados para implantação operacional. Revise as regras e controles da organização antes de inserir dados pessoais ou documentos sensíveis.

O SIGASE não se conecta ao Google Drive, não importa arquivos e não configura domínio.
