# SIGASE · Nova interface (React)

Nova interface do SIGASE em **React + Mantine**, com tema claro/escuro e layout para celular.
O backend (`server.py`), a API e o banco Supabase são os mesmos da versão clássica: nada muda nos dados,
e as duas versões podem ser usadas ao mesmo tempo.

## Telas

Login e troca obrigatória de senha · Página Inicial (resumo, agenda, avisos, próximas férias) · Caixa de entrada (tarefas) ·
Avisos · Dados da Unidade (efetivo) · Escalas de serviço · Documentos (aditamento, pernoite, FATD) ·
Requerimentos (prorrogação, adiantamento do 13º) · Mapas da força · Plano de férias · Usuários · Histórico (administradores).

Os documentos impressos usam **o mesmo HTML e CSS da versão clássica** (`src/print/legacy.ts`, copiado de `app.js`),
para que a folha A4 saia idêntica.

## Requisitos

- Node.js 20 ou mais recente (`node --version`)
- O servidor Python do SIGASE configurado (veja o README principal)

> No PowerShell, se aparecer “a execução de scripts foi desabilitada”, use `npm.cmd` no lugar de `npm`.

## Usar a versão gerada (recomendado)

```powershell
cd web
npm.cmd install
npm.cmd run build
cd ..
python server.py
```

Abra **http://127.0.0.1:8000/novo/**. A versão clássica continua em **http://127.0.0.1:8000/**.
Sempre que o código em `web/src` mudar, rode `npm.cmd run build` de novo.

## Desenvolvimento (atualiza a tela a cada alteração)

Com `python server.py` rodando em um terminal, em outro:

```powershell
cd web
npm.cmd run dev
```

Abra **http://127.0.0.1:5173/novo/**. O Vite repassa `/api` e `/assets` para o `server.py` (porta 8000).

## Estrutura

```
web/src/
  main.tsx            provedores (Mantine, React Query, datas em pt-BR)
  App.tsx             rotas (cada tela carrega sob demanda)
  theme.ts            cores e tipografia (verde militar do SIGASE)
  global.css          animações e ajustes visuais
  api.ts              chamada base à API, sessão e tarefas
  data/               acesso à API e regras de cada área (escalas, férias, efetivo, documentos…)
  lib/                utilitários (datas, impressão, confirmação de exclusão, regras de tarefas)
  print/legacy.ts     montagem dos documentos impressos (cópia fiel da versão clássica)
  layout/             menu lateral, topo e presença online
  pages/              uma tela por arquivo
  components/         peças reutilizáveis (formulários, quadro da escala, prévia A4…)
```
