export type TaskMode = 'Builder' | 'Scout';

export type TaskStatus = 'backlog' | 'running' | 'review' | 'done' | 'error';

export type RunnerType = 'opencode' | 'antigravity-cli';

export type ReportSource = 'worker' | 'auto' | 'fallback' | null;

export type FeaturePipelineStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

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

export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
  hidden_at?: string | null;
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
  affected_files: string[];
  feedback_prompt: string | null;
  exit_code: number | null;
  report_source: ReportSource;
  order_index?: number;
  verify_command?: string | null;
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

export interface QueueStatus {
  activeBuilderTaskId: string | null;
  waitingCount: number;
}

export interface BoardData {
  project: Project;
  columns: {
    backlog: Task[];
    running: Task[];
    review: Task[];
    done: Task[];
  };
  queue: QueueStatus;
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

export interface UpdateTaskDTO {
  title?: string;
  mode?: TaskMode;
  prompt?: string;
  guardrails?: string;
  task_markdown?: string;
  feature?: string | null;
  runner?: RunnerType;
  model?: string;
  variant?: string | null;
  thinking?: boolean;
  order_index?: number | null;
  verify_command?: string | null;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
        items?: any;
      }
    >;
    required?: string[];
  };
}

export interface McpToolsResponse {
  server: {
    name: string;
    version: string;
    transport: string;
    status: string;
    tools_count: number;
  };
  tools: McpTool[];
}

export type HarnessType = 'antigravity' | 'opencode' | 'claude' | 'cursor' | 'cline';
export type InstallTarget = 'mcp' | 'skill' | 'both';
export type InstallScope = 'project' | 'global';

export interface HarnessIntegrationInfo {
  mcpInstalledGlobal: boolean;
  mcpInstalledProject: boolean;
  skillInstalledGlobal: boolean;
  skillInstalledProject: boolean;
  mcpConfigPath: string;
  skillPath: string;
}

export interface HarnessStatusResponse {
  antigravity: HarnessIntegrationInfo;
  opencode: HarnessIntegrationInfo;
  claude: HarnessIntegrationInfo;
  cursor: HarnessIntegrationInfo;
  cline: HarnessIntegrationInfo;
  paths: {
    mcpCliPath: string;
    dbPath: string;
  };
}


