export type TaskMode = 'Builder' | 'Scout';

export type TaskStatus = 'backlog' | 'running' | 'review' | 'done' | 'error';

export type RunnerType = 'opencode' | 'antigravity-cli';

export type ReportSource = 'worker' | 'auto' | 'fallback' | null;

/**
 * Máquina de Estados da Esteira Autônoma de Feature (Feature Pipeline).
 * `idle`     : nenhuma esteira em execução para esta feature.
 * `running`  : esteira avançando, processando tarefas em sequência.
 * `paused`   : esteira pausada por solicitação humana. Não avança para a próxima tarefa.
 * `completed`: esteira finalizou com sucesso — todas as tarefas pendentes foram concluídas.
 * `failed`   : circuit breaker disparou após falha de worker ou quality gate. Requer inspeção humana.
 */
export type FeaturePipelineStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

/**
 * Resultado de uma verificação determinística (quality gate) executada após o worker.
 */
export type PipelineVerifyOutcome = 'passed' | 'failed' | 'skipped';

export interface PipelineTaskOutcome {
  task_id: string;
  run_id: string;
  title: string;
  status: TaskStatus;
  exit_code: number | null;
  verify_outcome?: PipelineVerifyOutcome;
  verify_command?: string | null;
  verify_output_tail?: string | null;
  completed_at?: string | null;
}

export interface FeaturePipelineState {
  project_id: string;
  feature: string;
  status: FeaturePipelineStatus;
  current_task_id: string | null;
  total_tasks: number;
  completed_tasks: number;
  failed_task_id: string | null;
  halt_reason: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  pending_task_ids: string[];
  completed_task_ids: string[];
  last_outcome: PipelineTaskOutcome | null;
  pause_requested?: boolean;
}

export interface GitBaseline {
  commit: string;
  dirty_files_before: string[];
  fingerprints_before?: Record<string, string>;
}

export interface RunJSON {
  id: string;
  title: string;
  mode: TaskMode;
  status: TaskStatus;
  feature?: string;
  runner: RunnerType;
  model: string;
  variant?: string;
  thinking?: boolean;
  session_id?: string;
  git_baseline?: GitBaseline;
  affected_files?: string[];
  exit_code?: number;
  report_source?: ReportSource;
  order_index?: number;
  verify_command?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
  hidden_at?: string | null;
  // Métricas agregadas
  backlog_count?: number;
  running_count?: number;
  review_count?: number;
  done_count?: number;
}

export interface Task {
  id: string;
  project_id: string;
  run_id: string;
  title: string;
  mode: TaskMode;
  status: TaskStatus;
  feature: string | null;
  runner: RunnerType;
  model: string;
  variant: string | null;
  thinking: boolean;
  session_id: string | null;
  git_baseline_commit: string | null;
  affected_files: string[]; // parsed from JSON
  feedback_prompt: string | null;
  exit_code: number | null;
  report_source: ReportSource;
  order_index: number;
  verify_command: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface TaskDetail extends Task {
  task_markdown: string;
  report_markdown: string | null;
  execution_log: string | null;
  diff_unified?: string;
  diff_stat?: string;
}

export interface BoardData {
  project: Project;
  columns: {
    backlog: Task[];
    running: Task[];
    review: Task[];
    done: Task[];
  };
}

export interface RunConfig {
  runId: string;
  projectPath: string;
  mode: TaskMode;
  runner: RunnerType;
  model: string;
  variant?: string;
  thinking?: boolean;
  resume?: boolean;
  sessionId?: string;
  feedbackPrompt?: string;
  taskId?: string;
}

export interface RunnerAdapter {
  readonly name: RunnerType;
  spawn(
    config: RunConfig,
    onChunk: (data: string) => void
  ): Promise<{ exitCode: number; sessionId?: string }>;
  kill(runId: string): Promise<void>;
}

export interface CreateProjectDTO {
  name: string;
  path: string;
}

export interface CreateTaskDTO {
  title: string;
  mode: TaskMode;
  feature?: string;
  runner?: RunnerType;
  model?: string;
  variant?: string;
  thinking?: boolean;
  order_index?: number;
  verify_command?: string;
  prompt: string;
  guardrails?: string;
}

export interface StartTaskDTO {
  resume?: boolean;
  feedback_prompt?: string;
  auto_complete?: boolean;
}

export interface StartFeatureDTO {
  /** Quando true, a API responde imediatamente sem aguardar o término da esteira. Padrão: true. */
  wait?: boolean;
}

export interface CreateTaskPlanItemDTO {
  title: string;
  mode: TaskMode;
  feature?: string;
  runner?: RunnerType;
  model?: string;
  variant?: string;
  thinking?: boolean;
  prompt: string;
  guardrails?: string;
  verify_command?: string;
}
