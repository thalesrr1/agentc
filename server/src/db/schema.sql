CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    hidden_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_projects_hidden_at ON projects(hidden_at);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    run_id TEXT NOT NULL,
    title TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('Builder', 'Scout')),
    status TEXT NOT NULL CHECK(status IN ('backlog', 'running', 'review', 'done', 'error')),
    feature TEXT,
    runner TEXT NOT NULL DEFAULT 'opencode',
    model TEXT NOT NULL DEFAULT 'minimax/MiniMax-M3',
    variant TEXT,
    thinking INTEGER NOT NULL DEFAULT 0,
    session_id TEXT,
    git_baseline_commit TEXT,
    affected_files TEXT,           -- JSON Array serializado de caminhos relativos
    feedback_prompt TEXT,          -- Última instrução de refinamento passada ao -Resume
    exit_code INTEGER,
    report_source TEXT,            -- 'worker' | 'auto' | 'fallback' | NULL
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    completed_at DATETIME,
    UNIQUE(project_id, run_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

