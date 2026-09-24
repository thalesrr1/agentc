# AgentC — Guia do Projeto e Diretrizes do Agente (v2)

## 1. Visão Geral
**AgentC** é uma central local-first de gerenciamento visual de tarefas e orquestração de desenvolvimento de software assistido por múltiplos agentes de IA.

Ele atua como a ponte operacional e visual entre:
- **Orquestradores de Alto Raciocínio (High-Intelligence):** Antigravity (Gemini), Grok, Claude Desktop via MCP ou REST API.
- **Subagentes Operacionais Multi-CLI:** MiniMax-M3 via OpenCode CLI e Gemini Flash via Antigravity CLI, desacoplados através de *Adapters*.
- **Desenvolvedor Humano:** Interface visual Kanban com visão de portfólio multi-projeto, streaming de logs ao vivo (SSE), visualizador de diff cirúrgico por tarefa e aprovação facilitada.

---

## 2. Princípios Fundamentais (Invioláveis)
1. **Local-First & Zero Bloat:** Sem contas externas, sem banco na nuvem, sem telemetria desnecessária. Toda a inteligência e orquestração operam no `localhost`.
2. **O Disco é a Fonte da Verdade:** A persistência principal de cada tarefa reside no repositório do próprio projeto em `.agent/runs/<run_id>/` (`run.json`, `task.md`, `report.md`, `execution.log`). O SQLite local funciona como cache e índice acelerador, reconciliado automaticamente com o disco.
3. **Desacoplamento de Executores (Multi-CLI):** O AgentC não é refém de uma única ferramenta. O sistema suporta múltiplos executores via *Adapters* (OpenCode, Antigravity CLI, Claude CLI), permitindo escolher o modelo mais eficiente e barato para cada tarefa.
4. **Isolamento de Git e Segurança de Código:** Tarefas de escrita de código (`Builder`) possuem fila de execução sequencial por projeto para evitar conflitos de mesclagem. O diff gerado é cirúrgico, isolando apenas os arquivos modificados por aquela run.
5. **Respeito ao Contexto dos Orquestradores:** O servidor MCP fornece respostas concisas e estruturadas (metadados, relatórios e estatísticas), nunca despejando diffs volumosos no contexto do modelo orquestrador.

---

## 3. Stack Tecnológico
- **Runtime:** Node.js (v20+) com TypeScript estrito
- **Backend:** Fastify (rápido, tipado, suporte nativo a streaming SSE)
- **Banco de Dados (Cache/Índice):** SQLite via `better-sqlite3`
- **Protocolo de Integração:** `@modelcontextprotocol/sdk` (Servidor MCP embutido com 6 ferramentas essenciais)
- **Frontend:** React 18/19 + Vite + Tailwind CSS + Lucide React
- **Renderização Técnica:**
  - Streaming de Terminal ANSI: `@xterm/xterm` ou `ansi-to-html`
  - Diff Visual Cirúrgico: `@git-diff-view/react` ou `diff2html`
  - Markdown e Relatórios: `react-markdown` + `remark-gfm`

---

## 4. Estrutura do Repositório
```text
D:\PROJETOS\agentc/
├── server/                          # Backend Fastify + MCP + Engine de Adapters
│   ├── src/
│   │   ├── db/                     # Schema SQLite, migrações e consultas
│   │   ├── reconciler/             # Reconciliação bidirecional (Disco <-> SQLite)
│   │   ├── runner/                 # Motor de execução e Adapters
│   │   │   ├── adapters/
│   │   │   │   ├── OpenCodeAdapter.ts
│   │   │   │   └── AntigravityCliAdapter.ts
│   │   │   ├── queue.ts            # Fila sequencial de tarefas Builder
│   │   │   ├── git.ts              # Captura de baseline e cálculo de diff cirúrgico
│   │   │   └── index.ts            # Gerenciador de processos e streams
│   │   ├── mcp/                    # Servidor MCP embutido e registro de tools
│   │   ├── routes/                 # Endpoints REST e streaming SSE
│   │   └── index.ts                # Ponto de entrada do servidor
│   ├── package.json
│   └── tsconfig.json
├── client/                          # Frontend Vite + React + Tailwind
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/             # Sidebar com contadores de projetos, Topbar
│   │   │   ├── kanban/             # Board, Column, TaskCard com badges de runner
│   │   │   ├── inspection/         # Drawer lateral (Terminal, Report, Diff, Resume)
│   │   │   └── modals/             # NewTaskModal, NewProjectModal
│   │   ├── hooks/                  # useProjects, useBoard, useLiveLogs
│   │   ├── services/               # Clientes HTTP e conexões SSE
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
├── package.json                     # Monorepo / Workspaces (pnpm ou npm)
├── agentc.md                        # Diretrizes e arquitetura do projeto
├── design.md                        # Sistema de design, tokens e convenções visuais
└── spec.md                          # Especificação técnica detalhada de implementação
```

---

## 5. Regras para Agentes que Codificam neste Projeto
- **TypeScript Estrito:** Não utilize `any`. Tipagem rigorosa em todas as interfaces de DTOs, entidades do banco e eventos SSE.
- **Isolamento de Adapters:** Novos executores de subagentes devem implementar a interface `RunnerAdapter` sem poluir as rotas REST ou ferramentas MCP com regras específicas de cada CLI.
- **Tratamento de Processos no SO:** No Windows, garanta encerramento limpo da árvore de processos (evitando processos zumbis do OpenCode ou CLIs externas no background).
- **Sem Modificação Destrutiva no Git:** O AgentC apenas lê telemetria passiva (`status`, `diff --stat`, `diff HEAD -- <files>`). Ele nunca executa `commit`, `push`, `rebase` ou `checkout` sem ação humana explícita.
