import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    // Garante que o diretório do banco exista
    const dbDir = path.dirname(CONFIG.DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    dbInstance = new Database(CONFIG.DB_PATH);
    
    // Performance e consistência
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    dbInstance.pragma('busy_timeout = 5000');

    // Executa migração do schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const ddl = fs.readFileSync(schemaPath, 'utf8');
      dbInstance.exec(ddl);
    } else {
      // Fallback inline caso o arquivo não esteja no dist
      dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

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
            affected_files TEXT,
            feedback_prompt TEXT,
            exit_code INTEGER,
            report_source TEXT,
            order_index INTEGER NOT NULL DEFAULT 0,
            verify_command TEXT,
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
      `);
    }

    // Migrações seguras de colunas
    try {
      dbInstance.exec(`ALTER TABLE projects ADD COLUMN default_runner TEXT;`);
    } catch {
      // coluna já existe
    }
    try {
      dbInstance.exec(`ALTER TABLE projects ADD COLUMN default_model TEXT;`);
    } catch {
      // coluna já existe
    }
    try {
      dbInstance.exec(`ALTER TABLE projects ADD COLUMN hidden_at DATETIME;`);
    } catch {
      // coluna já existe
    }
    try {
      dbInstance.exec(
        `CREATE INDEX IF NOT EXISTS idx_projects_hidden_at ON projects(hidden_at);`
      );
    } catch {
      // índice já existe
    }
    try {
      dbInstance.exec(`ALTER TABLE tasks ADD COLUMN variant TEXT;`);
    } catch {
      // coluna já existe
    }
    try {
      dbInstance.exec(`ALTER TABLE tasks ADD COLUMN thinking INTEGER NOT NULL DEFAULT 0;`);
    } catch {
      // coluna já existe
    }
    try {
      dbInstance.exec(`ALTER TABLE tasks ADD COLUMN feature TEXT;`);
    } catch {
      // coluna já existe
    }
    try {
      dbInstance.exec(`ALTER TABLE tasks ADD COLUMN report_source TEXT;`);
    } catch {
      // coluna já existe
    }
    try {
      dbInstance.exec(`ALTER TABLE tasks ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0;`);
    } catch {
      // coluna já existe
    }
    try {
      dbInstance.exec(`ALTER TABLE tasks ADD COLUMN verify_command TEXT;`);
    } catch {
      // coluna já existe
    }
    try {
      dbInstance.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_project_feature ON tasks(project_id, feature);`);
    } catch {
      // índice já existe
    }
    try {
      dbInstance.exec(
        `CREATE INDEX IF NOT EXISTS idx_tasks_project_feature_order ON tasks(project_id, feature, order_index);`
      );
    } catch {
      // índice já existe
    }
    try {
      dbInstance.exec(`
        CREATE TABLE IF NOT EXISTS feature_pipelines (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            feature TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('idle', 'running', 'paused', 'completed', 'failed')),
            current_task_id TEXT,
            pending_task_ids TEXT NOT NULL,
            completed_task_ids TEXT NOT NULL,
            failed_task_id TEXT,
            halt_reason TEXT,
            last_outcome TEXT,
            pause_requested INTEGER NOT NULL DEFAULT 0,
            started_at DATETIME,
            updated_at DATETIME,
            completed_at DATETIME,
            UNIQUE(project_id, feature)
        );
        CREATE INDEX IF NOT EXISTS idx_feature_pipelines_proj_feat ON feature_pipelines(project_id, feature);
      `);
    } catch {
      // tabela/índice já existe
    }
  }

  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
