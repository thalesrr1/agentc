---
name: agentc
description: >-
  Orchestrates features and tasks using AgentC Kanban and autonomous workers (OpenCode, Antigravity CLI).
  Activate whenever planning, breaking down tasks, delegating implementation, or managing project boards.
---

# AgentC Orchestration Protocol

## Role
Act as Tech Lead / Architect. Decompose problems, register tasks in AgentC, and delegate execution to operational subagents.

> **Auto-Registration:** Do not query or register the project beforehand. Passing `project_path` in any MCP tool auto-registers the repository transparently.

## Modes and Runners
- **Scout:** Reading, diagnosis, architectural research (default: `opencode` / `minimax/MiniMax-M3`).
- **Builder:** Code writing, implementation (default: `opencode` / `minimax/MiniMax-M3` or `antigravity-cli` / `gemini-2.0-flash`). Automatic sequential FIFO queue per project to prevent Git merge conflicts.

## Critical Efficiency and Graceful Handover (Zero Time Guessing)
- **Zero Polling Loops:** NEVER execute polling loops repeatedly calling `agentc_get_board`, `agentc_get_task_outcome`, or sleep intervals every few seconds. This consumes hundreds of thousands of tokens unnecessarily.
- **Zero Time Guessing:** The orchestrator MUST NOT waste tokens or reasoning trying to predict task durations in minutes. AgentC manages the wait window transparently:
  - When calling `agentc_start_task`, the server waits within a safe comfort window (default: 120s). If the task finishes within this window, the consolidated `outcome` is returned immediately in the same turn.
  - If the task is long-running and requires more time, the server executes an **Automatic Graceful Handover**, returning `completed: false` and `status: "running"` without blocking the chat or triggering tool call timeouts in the host LLM. The orchestrator simply concludes the turn informing the user.
- **Explicit Decoupled Execution (`wait: false`):** If you wish to trigger in background immediately without waiting for the comfort window, pass `wait: false`.

## Contextual Diff Validation (Tech Lead Mindset, No Blind Rigidity)
- **Do Not Act as a Blind Path Linter:** Operational subagents have autonomy to touch legitimate correlated integration and wiring files (e.g., registering new routes in `routes.ts`, exporting new components in `index.ts`, adding shared types in `types.ts`).
- **Evaluate Semantic Coherence:** Is the change outside the strict scope a legitimate and necessary side effect for the feature to function? If yes, validate and accept. Intervene only if there are unauthorized destructive changes, accidentally deleted files, or modifications in unrelated modules.
- **Scout Isolation:** `Scout` tasks have physical infrastructure enforcement — if any file is modified, AgentC automatically rolls back all changes to baseline and marks an error. In `Builder` mode, prioritize code intelligence over rigid path exclusions.

## Decomposition Guidelines (Cohesion and Efficiency)
When planning tasks via `agentc_create_plan`, size each card as a **Verifiable Functional Unit**:
- **Avoid syntactic micro-steps:** Do not split tasks that belong to the same continuous workflow (e.g., route + service + types of the same feature). Keep them in the same card to leverage the worker's working memory.
- **Avoid monolithic tasks:** If the objective spans independent subsystems or distinct technologies (e.g., Fastify API vs React UI), split them so each delivery is isolated and testable.
- **Group by Feature:** Use the `feature` parameter to associate tasks of the same specification (e.g., `feature: "chat-agent"`), maintaining a clean contextual focus.
- **Refinements:** For corrections or improvements in an existing delivery, prefer `agentc_start_task` with `resume: true` and `feedback_prompt` instead of creating a new card.

## Orchestration Protocol (4 Steps)

### 1. Register Backlog (`agentc_create_plan`)
Send `project_path`, optional `feature` (e.g., `"chat-agent"`), and `tasks` array. Returns the registered tasks list instantly.
- **Guaranteed Idempotency:** If identical pending tasks (same title and feature) already exist in the backlog, AgentC transparently reuses and updates them (`reused: true`), preventing duplications upon retries.
- Each task must contain: `title`, `mode` (`"Builder"` or `"Scout"`), concise `prompt` with acceptance criteria, and clear `guardrails`.

### 2. Dispatch and Await Execution (`agentc_start_task`)
Start the task providing `project_path` and `task_id`.
- By default (`wait: true`), the tool **awaits completion on the server** (safe 120s comfort window) and returns the consolidated outcome directly (`status`, `exit_code`, `affected_files`, `diff_stat`, `report_content`, and `error_summary` in case of failure).
- **Optional Auto-Completion (`auto_complete: true`):** If acceptance criteria are deterministic or the task is straightforward, pass `auto_complete: true`. Upon success (`exit_code: 0`), AgentC moves the task directly to `status: "done"`, skipping Step 4.
- If `auto_complete` is omitted or `false`, a successfully completed task remains in `status: "review"` for inspection and audit.

### 3. Iterate / Self-Recovery (`agentc_start_task` with `resume: true`)
If the delivery requires corrections or encounters a technical failure (`status: "error"`):
- The orchestrator has autonomy to trigger **up to 2 autonomous recovery cycles** with `resume: true` and targeted corrective instructions in `feedback_prompt`.
- The tool will await the new cycle and return the updated report.
- If the issue persists after 2 cycles, halt self-recovery and present the diagnostic with `error_summary` to the user for chat alignment.

### 4. Validate and Conclude (`agentc_update_task_status`)
If `auto_complete` was not used and the delivery is accepted:
- Call `agentc_update_task_status` with `status: "done"` (and optional approval `comment`).
- This moves the task to done in the Kanban and updates persistence files on disk.

## Emergency Cancellation (`agentc_cancel_task`)
If an active task hangs, enters an infinite loop, or needs immediate termination:
- Call `agentc_cancel_task` with `project_path` and `task_id` to terminate the process tree immediately and release the queue.

## Mandatory Delivery (`report.md`)
- Every `task.md` includes the "Delivery Contract" clause with the absolute path to `report.md`.
- Ensure that upon task conclusion, the operational subagent has **persisted** `.agent/runs/<run_id>/report.md` on disk.
- Without a valid `report.md`, delivery is considered incomplete:
  1. AgentC triggers an automatic safeguard (`report_source = "auto"`) extracting the assistant's final turn from `execution.log`.
  2. If insufficient content is extracted, a metadata-only fallback (`report_source = "fallback"`) is applied.
- `agentc_get_task_outcome` returns `report_content`, and the ReportViewer badge visually signals the origin (`worker` / `auto-salvaged` / `fallback`).
