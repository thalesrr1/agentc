# Design System & Padrões Visuais — AgentC

## 1. Filosofia Visual
O design do **AgentC** é inspirado em ferramentas modernas de alta densidade e produtividade para desenvolvedores (como *Linear*, *Raycast* e *Cursor*):
- **Dark Mode Nativo:** Foco visual calibrado com a paleta Zinc para redução de fadiga ocular em sessões prolongadas.
- **Densidade Alta e Rápida Leitura:** Elementos compactos, sem espaços ociosos, mas com hierarquia tipográfica nítida.
- **Feedback Vivo e Reativo:** Estados de execução com animação suave de pulso, streaming de terminal sem travamentos e indicadores em tempo real.
- **Controle Cirúrgico:** Acesso imediato aos relatórios e diffs da tarefa sem a necessidade de mudar de tela ou abrir o editor de código.

---

## 2. Paleta de Cores e Tokens Visuais

### Superfícies & Bordas (Zinc / Neutral)
| Token | Cor Hex | Uso Principal |
| :--- | :--- | :--- |
| `bg-app` | `#09090b` (Zinc 950) | Fundo da aplicação e canvas do Kanban |
| `bg-surface` | `#18181b` (Zinc 900) | Sidebar, colunas do Kanban e modais/drawers |
| `bg-card` | `#27272a` (Zinc 800) | Cards de tarefas e containers de conteúdo |
| `bg-card-hover` | `#3f3f46` (Zinc 700) | Estado de foco e hover em cards |
| `border-subtle` | `#27272a` (Zinc 800) | Divisórias e bordas secundárias |
| `border-focus` | `#3f3f46` (Zinc 700) | Bordas de cards e inputs em foco |

### Tipografia & Textos
- **Fonte Principal (UI):** `Inter`, `Geist Sans`, ou `system-ui`
- **Fonte Mono (Código, Diffs e Logs):** `JetBrains Mono`, `Fira Code`, ou `ui-monospace`
| Token | Cor Hex | Uso |
| :--- | :--- | :--- |
| `text-primary` | `#f4f4f5` (Zinc 100) | Títulos, textos principais e valores de métricas |
| `text-secondary`| `#a1a1aa` (Zinc 400) | Descrições, metadados e legendas |
| `text-muted` | `#71717a` (Zinc 500) | Timestamps, caminhos de arquivo e atalhos |

### Cores de Status e Ação
| Status | Cor Principal | Badge / Glow | Significado |
| :--- | :--- | :--- | :--- |
| **Backlog** | `#a1a1aa` (Zinc 400) | `bg-zinc-800 text-zinc-300` | Tarefa planejada, pronta para início |
| **Em Execução** | `#10b981` (Emerald 500) | `bg-emerald-950 text-emerald-300 animate-pulse` | Subagente ativo rodando no terminal |
| **Em Revisão** | `#f59e0b` (Amber 500) | `bg-amber-950 text-amber-300` | Execução concluída; aguardando aprovação |
| **Concluído** | `#6366f1` (Indigo 500) | `bg-indigo-950 text-indigo-300` | Tarefa aprovada e entregue |
| **Falha / Erro** | `#f43f5e` (Rose 500) | `bg-rose-950 text-rose-300` | Processo encerrou com código de saída != 0 |

### Badges de Modos e Motores de Execução
- **Modo Scout:** `bg-cyan-950 text-cyan-300 border-cyan-800` (Pesquisa / Read-Only)
- **Modo Builder:** `bg-emerald-950 text-emerald-300 border-emerald-800` (Implementação de Código)
- **Runner OpenCode (MiniMax):** `bg-purple-950 text-purple-300 border-purple-800`
- **Runner Antigravity (Gemini):** `bg-blue-950 text-blue-300 border-blue-800`

---

## 3. Arquitetura de Layout

```text
+---------------------------------------------------------------------------------------------------------+
| [AgentC]   Projeto: [WhatsUp-Site v]   Fila Builder: [Livre]   [+ Nova Tarefa]   [● MCP 4 Tools Ativas] |
+---------------+-----------------------------------------------------------------------------------------+
| PROJETOS      | KANBAN DO PROJETO                                                                       |
|               +------------------+-----------------------+-----------------------+----------------------+
| > WhatsUp     | 📋 A Fazer (3)   | 🚀 Executando (1)     | 🔍 Revisão (1)        | ✅ Concluído (8)     |
|   [1 🟢 1 🟡] +------------------+-----------------------+-----------------------+----------------------+
|   crmUp       | [Card: Auth]     | [Card: Refactor]      | [Card: Math.js]       | [Card: Setup]        |
|   [0 🟢 0 🟡] | OpenCode·MiniMax | Antigravity·Gemini    | OpenCode·MiniMax      | Aprovado             |
|   TvUp2       | Scout            | Builder               | Builder · Report OK   |                      |
|   [2 🟢 0 🟡] | [Iniciar >]      | [● 01:24s] [Cancelar] | [Ver Diff >] [Aprovar]|                      |
|               +------------------+-----------------------+-----------------------+----------------------+
| [+ Projeto]   | [Card: Docs]     |                       |                       |                      |
+---------------+------------------+-----------------------+-----------------------+----------------------+
```

### Componentes Principais

#### 1. Sidebar de Projetos (Esquerda - 260px fixa)
- Lista vertical de todos os projetos cadastrados no disco.
- **Badges de Monitoramento Multi-Projeto:**
  - Pílula verde com contador de subagentes rodando no projeto (`1 🟢`).
  - Pílula âmbar indicando tarefas aguardando revisão humana (`2 🟡`).
  - Permite identificar em tempo real onde há trabalho sendo feito sem precisar alternar de projeto.
- Botão inferior `[+ Adicionar Projeto]` com seletor de pasta ou digitação do caminho.

#### 2. Topbar de Ações
- Título do projeto ativo com caminho absoluto clicável para cópia.
- Status de segurança da **Fila Builder** (exibe `[Livre]` ou `[1 Tarefa na Fila]`).
- Status do servidor MCP embutido e conexão de streaming SSE.
- Botão `[+ Nova Tarefa]`.

#### 3. Board Kanban (4 Colunas)
- **Cabeçalho de Coluna:** Ícone temático + Título + Contador de tarefas.
- **Card de Tarefa:**
  - Título objetivo e ID da run (`run_...`).
  - Duas tags compactas: **Modo** (`Scout` / `Builder`) e **Runner/Modelo** (`OpenCode · MiniMax-M3` ou `Antigravity · Gemini Flash`).
  - Tempo decorrido com contador dinâmico quando em execução.
  - Ações contextuais de 1 clique no rodapé do card:
    - No Backlog: `[Iniciar ▶]`
    - Em Execução: `[Interromper ⏹]`
    - Em Revisão: `[Inspecionar & Decidir 👁]`

#### 4. Gaveta de Inspeção / Drawer Lateral (720px)
Abre lateralmente ao clicar em qualquer card para auditoria completa sem perda de contexto:
- **Header:** Título da tarefa, ID, status e barra de botões principais:
  - `[Aprovar & Concluir]` (Move para coluna Concluído).
  - `[Retomar com Ajustes ↺]` (Abre input rápido para digitar o `feedback_prompt` e invoca `-Resume` mantendo a sessão do worker).
  - `[Interromper]` (Se estiver rodando).
- **Abas de Conteúdo:**
  1. 📟 **Terminal ao Vivo:** Fundo `#0d1117`, cores ANSI preservadas, rolagem automática e botão de copiar log completo.
  2. 📝 **Relatório (`report.md`):** Renderização Markdown com destaque especial para seções de *Racional Técnico* e *Arquivos Modificados*.
  3. 🔍 **Targeted Git Diff:** Visualizador focado exclusivamente nos arquivos modificados pela execução desta tarefa (`affected_files`), com syntax highlighting verde/vermelho.
  4. 📋 **Especificação & Metadados:** Exibe o `task.md` original, guardrails e dados de telemetria do `run.json` (sessão, commits, tempos).

---

## 4. Diretrizes de Micro-Interações e Atalhos
- **Modal de Retomada Não-Bloqueante:** Ao clicar em `[Retomar com Ajustes]`, surge uma caixa de texto focada imediatamente para digitar o que corrigir antes do reenvio.
- **Atalhos Globais:**
  - `Ctrl + N`: Nova tarefa manual.
  - `Esc`: Fechar gaveta de inspeção ou modais.
  - `Ctrl + Enter`: Confirmar formulário de tarefa ou envio de feedback de retomada.
- **Transições Suaves:** Cards mudam de coluna com animações fluidas baseadas em layout transitions (`framer-motion` ou CSS transitions).
