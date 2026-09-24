export interface McpToolDefinition {
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

export const MCP_TOOLS_DEFINITIONS: McpToolDefinition[] = [
  {
    name: 'agentc_list_projects',
    description: 'List all projects registered in AgentC with running, review, backlog, and done task counters.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'agentc_register_project',
    description: 'Register a project in AgentC from its repository directory path (cwd).',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Human-readable project name' },
        project_path: { type: 'string', description: 'Absolute path to repository directory' },
      },
      required: ['name', 'project_path'],
    },
  },
  {
    name: 'agentc_create_plan',
    description: "Register decomposed task backlog directly onto the project's Kanban board. Features automatic idempotency: reuses and updates existing pending backlog cards.",
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Project repository directory path' },
        feature: { type: 'string', description: 'Optional. Feature or specification name associated with this task group (e.g. "chat-agent", "auth-jwt").' },
        tasks: {
          type: 'array',
          description: 'List of decomposed tasks for backlog inclusion',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Clear, concise task title' },
              mode: { type: 'string', enum: ['Builder', 'Scout'], description: 'Builder (code writing) or Scout (read-only research/diagnosis)' },
              feature: { type: 'string', description: 'Optional. Individual feature name (inherits plan feature if omitted).' },
              runner: { type: 'string', enum: ['opencode', 'antigravity-cli'], description: 'Execution tool (default: opencode)' },
              model: { type: 'string', description: 'Target model (e.g. minimax/MiniMax-M3, gemini-2.0-flash)' },
              variant: { type: 'string', description: 'Model reasoning effort (provider-specific, e.g. high, max, minimal). OpenCode CLI only.' },
              thinking: { type: 'boolean', description: 'Enable thinking blocks display in OpenCode CLI execution.' },
              prompt: { type: 'string', description: 'Precise goal, instructions, and verifiable acceptance criteria' },
              guardrails: { type: 'string', description: 'Technical constraints or rules that must not be violated' },
            },
            required: ['title', 'mode', 'prompt'],
          },
        },
      },
      required: ['project_path', 'tasks'],
    },
  },
  {
    name: 'agentc_get_board',
    description: 'Query Kanban board task state grouped by column. Returns active tasks and recent_done with total metrics to conserve context tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Absolute project repository path' },
        feature: { type: 'string', description: 'Optional. Filter tasks to isolate context strictly to this feature scope.' },
        all_done: { type: 'boolean', description: 'If true, returns all completed tasks. Default: false (returns only the latest 3 in recent_done).' },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'agentc_start_task',
    description: 'Start or resume execution of a Kanban task via operational subagent. Awaits completion within a safe comfort window (default: 120s); returns consolidated outcome immediately upon completion, or performs graceful handover with "running" status if long-running.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Absolute project path' },
        task_id: { type: 'string', description: 'ID of task to execute. Optional: if omitted, starts the first pending backlog task.' },
        feature: { type: 'string', description: 'Optional. If task_id is omitted, starts the first pending task for this feature.' },
        resume: { type: 'boolean', description: "If true, resumes the worker's previous session" },
        feedback_prompt: { type: 'string', description: 'Targeted corrective instructions for the worker' },
        auto_complete: { type: 'boolean', description: 'Optional. If true and execution succeeds (exit_code 0), automatically marks task as "done", skipping manual approval.' },
        wait: { type: 'boolean', description: 'If true (default), awaits completion within safe comfort window. If false, starts in background and returns immediately.' },
        timeout_seconds: { type: 'number', description: 'Maximum safe synchronous wait window in seconds (default: 120s / 2 minutes). Performs graceful handover upon reaching this limit.' },
      },
      required: ['project_path'],
    },
  },
  {
    name: 'agentc_get_task_outcome',
    description: 'Get consolidated outcome of a task (status, exit code, affected files, diff stat, and report markdown) without saturating model context.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Absolute project path' },
        task_id: { type: 'string', description: 'ID of the target task' },
      },
      required: ['project_path', 'task_id'],
    },
  },
  {
    name: 'agentc_update_task_status',
    description: 'Update task status on the AgentC Kanban board. Use to approve/complete tasks (status: "done"), return tasks to backlog (status: "backlog"), or place them in review.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Absolute project repository path' },
        task_id: { type: 'string', description: 'ID of task to update' },
        status: {
          type: 'string',
          enum: ['done', 'backlog', 'review'],
          description: 'New status: "done" to approve/complete, "backlog" to return to queue, or "review" to await inspection.',
        },
        comment: { type: 'string', description: 'Optional transition comment or rationale (e.g. architect approval note)' },
      },
      required: ['project_path', 'task_id', 'status'],
    },
  },
  {
    name: 'agentc_cancel_task',
    description: 'Cancel an active task in AgentC, immediately terminating the worker process tree and releasing the project queue.',
    inputSchema: {
      type: 'object',
      properties: {
        project_path: { type: 'string', description: 'Absolute project repository path' },
        task_id: { type: 'string', description: 'ID of active task to cancel' },
      },
      required: ['project_path', 'task_id'],
    },
  },
];
