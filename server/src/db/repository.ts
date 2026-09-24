import { getDb } from './connection.js';
import type { Project, Task, TaskStatus, RunJSON } from '../types/index.js';

// Utilitário para mapear linha do banco para interface Task
interface TaskRow {
  id: string;
  project_id: string;
  run_id: string;
  title: string;
  mode: 'Builder' | 'Scout';
  status: TaskStatus;
  feature: string | null;
  runner: 'opencode' | 'antigravity-cli';
  model: string;
  variant: string | null;
  thinking: number | null;
  session_id: string | null;
  git_baseline_commit: string | null;
  affected_files: string | null;
  feedback_prompt: string | null;
  exit_code: number | null;
  report_source: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

function mapRowToTask(row: TaskRow): Task {
  let affected: string[] = [];
  if (row.affected_files) {
    try {
      const parsed = JSON.parse(row.affected_files);
      if (Array.isArray(parsed)) {
        affected = parsed;
      }
    } catch {
      affected = [];
    }
  }

  return {
    id: row.id,
    project_id: row.project_id,
    run_id: row.run_id,
    title: row.title,
    mode: row.mode,
    status: row.status,
    feature: row.feature ?? null,
    runner: row.runner,
    model: row.model,
    variant: row.variant ?? null,
    thinking: Boolean(row.thinking ?? 0),
    session_id: row.session_id,
    git_baseline_commit: row.git_baseline_commit,
    affected_files: affected,
    feedback_prompt: row.feedback_prompt,
    exit_code: row.exit_code,
    report_source: (row.report_source ?? null) as 'worker' | 'auto' | 'fallback' | null,
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
  };
}

export const ProjectRepository = {
  list(): Project[] {
    const db = getDb();
    const sql = `
      SELECT
        p.id,
        p.name,
        p.path,
        p.created_at,
        p.updated_at,
        p.hidden_at,
        SUM(CASE WHEN t.status = 'backlog' THEN 1 ELSE 0 END) as backlog_count,
        SUM(CASE WHEN t.status = 'running' THEN 1 ELSE 0 END) as running_count,
        SUM(CASE WHEN t.status = 'review' OR t.status = 'error' THEN 1 ELSE 0 END) as review_count,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done_count
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id
      WHERE p.hidden_at IS NULL
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `;
    const rows = db.prepare(sql).all() as Array<{
      id: string;
      name: string;
      path: string;
      created_at: string;
      updated_at: string;
      hidden_at: string | null;
      backlog_count: number;
      running_count: number;
      review_count: number;
      done_count: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      path: r.path,
      created_at: r.created_at,
      updated_at: r.updated_at,
      hidden_at: r.hidden_at,
      backlog_count: r.backlog_count ?? 0,
      running_count: r.running_count ?? 0,
      review_count: r.review_count ?? 0,
      done_count: r.done_count ?? 0,
    }));
  },

  listHidden(): Project[] {
    const db = getDb();
    const sql = `
      SELECT
        p.id,
        p.name,
        p.path,
        p.created_at,
        p.updated_at,
        p.hidden_at,
        SUM(CASE WHEN t.status = 'backlog' THEN 1 ELSE 0 END) as backlog_count,
        SUM(CASE WHEN t.status = 'running' THEN 1 ELSE 0 END) as running_count,
        SUM(CASE WHEN t.status = 'review' OR t.status = 'error' THEN 1 ELSE 0 END) as review_count,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as done_count
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id
      WHERE p.hidden_at IS NOT NULL
      GROUP BY p.id
      ORDER BY p.hidden_at DESC
    `;
    const rows = db.prepare(sql).all() as Array<{
      id: string;
      name: string;
      path: string;
      created_at: string;
      updated_at: string;
      hidden_at: string | null;
      backlog_count: number;
      running_count: number;
      review_count: number;
      done_count: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      path: r.path,
      created_at: r.created_at,
      updated_at: r.updated_at,
      hidden_at: r.hidden_at,
      backlog_count: r.backlog_count ?? 0,
      running_count: r.running_count ?? 0,
      review_count: r.review_count ?? 0,
      done_count: r.done_count ?? 0,
    }));
  },

  getById(id: string): Project | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined;
    return row || null;
  },

  getByPath(projectPath: string): Project | null {
    const db = getDb();
    // Normaliza separadores de caminho
    const normalized = projectPath.replace(/\\/g, '/').toLowerCase();
    const rows = db.prepare('SELECT * FROM projects').all() as Project[];
    const found = rows.find(
      (p) => p.path.replace(/\\/g, '/').toLowerCase() === normalized
    );
    return found || null;
  },

  create(project: { id: string; name: string; path: string }): Project {
    const db = getDb();
    db.prepare(
      'INSERT INTO projects (id, name, path, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
    ).run(project.id, project.name, project.path);

    const created = this.getById(project.id);
    if (!created) {
      throw new Error(`Falha ao recuperar projeto criado: ${project.id}`);
    }
    return created;
  },

  hide(id: string): boolean {
    const db = getDb();
    const result = db
      .prepare(
        `UPDATE projects SET hidden_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND hidden_at IS NULL`
      )
      .run(id);
    return result.changes > 0;
  },

  unhide(id: string): boolean {
    const db = getDb();
    const result = db
      .prepare(
        `UPDATE projects SET hidden_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND hidden_at IS NOT NULL`
      )
      .run(id);
    return result.changes > 0;
  },

  delete(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return result.changes > 0;
  },

  touch(id: string): void {
    const db = getDb();
    db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  },
};

export const TaskRepository = {
  listByProjectId(projectId: string): Task[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC')
      .all(projectId) as TaskRow[];
    return rows.map(mapRowToTask);
  },

  getById(id: string): Task | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
    return row ? mapRowToTask(row) : null;
  },

  getByRunId(projectId: string, runId: string): Task | null {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM tasks WHERE project_id = ? AND run_id = ?')
      .get(projectId, runId) as TaskRow | undefined;
    return row ? mapRowToTask(row) : null;
  },

  findPendingBacklogTask(projectId: string, title: string, feature?: string | null): Task | null {
    const db = getDb();
    const normalizedTitle = title.trim().toLowerCase();
    const cleanFeature = feature?.trim() || null;

    let row: TaskRow | undefined;
    if (cleanFeature) {
      row = db
        .prepare(`
          SELECT * FROM tasks 
          WHERE project_id = ? 
            AND status = 'backlog' 
            AND LOWER(TRIM(title)) = ? 
            AND LOWER(TRIM(feature)) = LOWER(?)
          LIMIT 1
        `)
        .get(projectId, normalizedTitle, cleanFeature) as TaskRow | undefined;
    } else {
      row = db
        .prepare(`
          SELECT * FROM tasks 
          WHERE project_id = ? 
            AND status = 'backlog' 
            AND LOWER(TRIM(title)) = ? 
            AND (feature IS NULL OR TRIM(feature) = '')
          LIMIT 1
        `)
        .get(projectId, normalizedTitle) as TaskRow | undefined;
    }

    return row ? mapRowToTask(row) : null;
  },

  updateTaskDefinition(id: string, updates: {
    title: string;
    mode: 'Builder' | 'Scout';
    feature?: string | null;
    runner: 'opencode' | 'antigravity-cli';
    model: string;
    variant?: string | null;
    thinking?: boolean;
  }): Task {
    const db = getDb();
    db.prepare(`
      UPDATE tasks 
      SET title = ?, mode = ?, feature = ?, runner = ?, model = ?,
          variant = ?, thinking = ?
      WHERE id = ?
    `).run(
      updates.title,
      updates.mode,
      updates.feature ?? null,
      updates.runner,
      updates.model,
      updates.variant ?? null,
      updates.thinking ? 1 : 0,
      id
    );
    const updated = this.getById(id);
    if (!updated) {
      throw new Error(`Falha ao recuperar tarefa atualizada: ${id}`);
    }
    return updated;
  },

  create(task: {
    id: string;
    project_id: string;
    run_id: string;
    title: string;
    mode: 'Builder' | 'Scout';
    status: TaskStatus;
    feature?: string | null;
    runner: 'opencode' | 'antigravity-cli';
    model: string;
    variant?: string | null;
    thinking?: boolean | null;
    session_id?: string | null;
    git_baseline_commit?: string | null;
    affected_files?: string[];
    feedback_prompt?: string | null;
    exit_code?: number | null;
    created_at?: string;
  }): Task {
    const db = getDb();
    const affectedJson = JSON.stringify(task.affected_files || []);
    db.prepare(`
      INSERT INTO tasks (
        id, project_id, run_id, title, mode, status, feature, runner, model,
        variant, thinking,
        session_id, git_baseline_commit, affected_files, feedback_prompt, exit_code,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `).run(
      task.id,
      task.project_id,
      task.run_id,
      task.title,
      task.mode,
      task.status,
      task.feature ?? null,
      task.runner,
      task.model,
      task.variant ?? null,
      task.thinking ? 1 : 0,
      task.session_id ?? null,
      task.git_baseline_commit ?? null,
      affectedJson,
      task.feedback_prompt ?? null,
      task.exit_code ?? null,
      task.created_at ?? null
    );

    ProjectRepository.touch(task.project_id);
    const created = this.getById(task.id);
    if (!created) {
      throw new Error(`Falha ao recuperar tarefa criada: ${task.id}`);
    }
    return created;
  },

  updateStatus(id: string, status: TaskStatus, exitCode?: number | null): void {
    const db = getDb();
    if (exitCode !== undefined) {
      db.prepare('UPDATE tasks SET status = ?, exit_code = ? WHERE id = ?').run(status, exitCode, id);
    } else {
      db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
    }
    const task = this.getById(id);
    if (task) {
      ProjectRepository.touch(task.project_id);
    }
  },

  updateSessionId(id: string, sessionId: string): void {
    const db = getDb();
    db.prepare('UPDATE tasks SET session_id = ? WHERE id = ?').run(sessionId, id);
  },

  resetForExecution(id: string): void {
    const db = getDb();
    db.prepare(`
      UPDATE tasks 
      SET status = 'running', completed_at = NULL, exit_code = NULL 
      WHERE id = ?
    `).run(id);
    const task = this.getById(id);
    if (task) {
      ProjectRepository.touch(task.project_id);
    }
  },

  updateExecutionStart(id: string, startedAt: string, baselineCommit?: string): void {
    const db = getDb();
    db.prepare(`
      UPDATE tasks 
      SET status = 'running', started_at = ?, completed_at = NULL, exit_code = NULL, git_baseline_commit = COALESCE(?, git_baseline_commit)
      WHERE id = ?
    `).run(startedAt, baselineCommit ?? null, id);
    const task = this.getById(id);
    if (task) {
      ProjectRepository.touch(task.project_id);
    }
  },

  updateExecutionComplete(
    id: string,
    completedAt: string,
    exitCode: number,
    status: TaskStatus,
    affectedFiles: string[],
    sessionId?: string,
    reportSource?: 'worker' | 'auto' | 'fallback' | null
  ): void {
    const db = getDb();
    const affectedJson = JSON.stringify(affectedFiles);
    db.prepare(`
      UPDATE tasks 
      SET status = ?, completed_at = ?, exit_code = ?, affected_files = ?,
          session_id = COALESCE(?, session_id),
          report_source = COALESCE(?, report_source)
      WHERE id = ?
    `).run(
      status,
      completedAt,
      exitCode,
      affectedJson,
      sessionId ?? null,
      reportSource ?? null,
      id
    );
    const task = this.getById(id);
    if (task) {
      ProjectRepository.touch(task.project_id);
    }
  },

  updateFeedbackPrompt(id: string, feedbackPrompt: string): void {
    const db = getDb();
    db.prepare('UPDATE tasks SET feedback_prompt = ? WHERE id = ?').run(feedbackPrompt, id);
  },

  upsertFromRunJSON(projectId: string, runJson: RunJSON): Task {
    const db = getDb();
    const existing = this.getByRunId(projectId, runJson.id);
    const affectedJson = JSON.stringify(runJson.affected_files || []);

    if (existing) {
      db.prepare(`
        UPDATE tasks 
        SET title = ?, mode = ?, status = ?, feature = COALESCE(?, feature), runner = ?, model = ?,
            variant = COALESCE(?, variant),
            thinking = CASE WHEN ? IS NULL THEN thinking ELSE ? END,
            session_id = COALESCE(?, session_id),
            git_baseline_commit = COALESCE(?, git_baseline_commit),
            affected_files = ?,
            exit_code = ?,
            report_source = COALESCE(?, report_source),
            started_at = COALESCE(?, started_at),
            completed_at = COALESCE(?, completed_at)
        WHERE id = ?
      `).run(
        runJson.title,
        runJson.mode,
        runJson.status,
        runJson.feature ?? null,
        runJson.runner,
        runJson.model,
        runJson.variant ?? null,
        runJson.thinking === undefined ? null : (runJson.thinking ? 1 : 0),
        runJson.thinking === undefined ? null : (runJson.thinking ? 1 : 0),
        runJson.session_id ?? null,
        runJson.git_baseline?.commit ?? null,
        affectedJson,
        runJson.exit_code ?? null,
        runJson.report_source ?? null,
        runJson.started_at ?? null,
        runJson.completed_at ?? null,
        existing.id
      );
      ProjectRepository.touch(projectId);
      return this.getById(existing.id)!;
    } else {
      const newId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      return this.create({
        id: newId,
        project_id: projectId,
        run_id: runJson.id,
        title: runJson.title,
        mode: runJson.mode,
        status: runJson.status,
        feature: runJson.feature ?? null,
        runner: runJson.runner,
        model: runJson.model,
        variant: runJson.variant ?? null,
        thinking: runJson.thinking ?? false,
        session_id: runJson.session_id,
        git_baseline_commit: runJson.git_baseline?.commit,
        affected_files: runJson.affected_files,
        exit_code: runJson.exit_code,
        created_at: runJson.created_at,
      });
    }
  },

  resetOrphanedRunningTasks(): void {
    const db = getDb();
    db.prepare(`
      UPDATE tasks
      SET status = 'error', exit_code = 1, completed_at = CURRENT_TIMESTAMP
      WHERE status = 'running'
    `).run();
  },
};

