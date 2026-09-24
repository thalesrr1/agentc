import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import { ProjectRepository, TaskRepository } from '../db/repository.js';
import { Reconciler } from '../reconciler/index.js';
import { RunnerEngine } from '../runner/index.js';
import { GitService } from '../runner/git.js';
import { ProcessManager } from '../runner/processManager.js';
import { getDb } from '../db/connection.js';
import { CONFIG } from '../config.js';
import type { AgentCEventType } from '../events/eventBus.js';
import { MCP_TOOLS_DEFINITIONS } from './tools.js';

export function createMcpServer(): Server {
  getDb();

  const server = new Server(
    {
      name: 'agentc-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 1. Registro dos metadados das 8 ferramentas
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: MCP_TOOLS_DEFINITIONS as any,
    };
  });

  function ensureProject(absPath: string, customName?: string) {
    if (!fs.existsSync(absPath)) {
      throw new Error(`Path does not exist on filesystem: ${absPath}`);
    }
    let project = ProjectRepository.getByPath(absPath);
    if (!project) {
      const id = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      Reconciler.ensureProjectStructure(absPath);
      project = ProjectRepository.create({
        id,
        name: customName || path.basename(absPath),
        path: absPath,
      });
    }
    return project;
  }

  function extractErrorSummary(projectPath: string, runId: string, maxLines: number = 25): string | null {
    const logPath = path.join(projectPath, '.agent', 'runs', runId, 'execution.log');
    if (!fs.existsSync(logPath)) return null;

    try {
      const stats = fs.statSync(logPath);
      if (stats.size === 0) return null;

      const readSize = Math.min(stats.size, 32 * 1024);
      const buffer = Buffer.alloc(readSize);
      const fd = fs.openSync(logPath, 'r');
      fs.readSync(fd, buffer, 0, readSize, stats.size - readSize);
      fs.closeSync(fd);

      const raw = buffer.toString('utf8');
      // Strip ANSI color codes and control sequences
      const clean = raw.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
      const lines = clean.split('\n').map((l) => l.trimEnd()).filter((l) => l.length > 0);

      const tail = lines.slice(-maxLines).join('\n');
      return tail || null;
    } catch {
      return null;
    }
  }

  function waitForTaskCompletion(
    taskId: string,
    timeoutMs: number = 900000,
    startTime: number = Date.now()
  ): Promise<{ completed: boolean; timedOut: boolean }> {
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout | null = null;
      let pollInterval: NodeJS.Timeout | null = null;
      let removeListener: (() => void) | null = null;
      let resolved = false;
      let seenRunning = false;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (pollInterval) clearInterval(pollInterval);
        if (removeListener) removeListener();
      };

      const finish = (completed: boolean, timedOut: boolean) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve({ completed, timedOut });
      };

      timer = setTimeout(() => {
        const current = TaskRepository.getById(taskId);
        const isDone = current ? ['review', 'done', 'error'].includes(current.status) : false;
        finish(isDone, !isDone);
      }, timeoutMs);

      const checkStatus = () => {
        const current = TaskRepository.getById(taskId);
        if (!current) return;

        if (current.status === 'running') {
          seenRunning = true;
          if (!removeListener && current.run_id) {
            removeListener = ProcessManager.addListener(current.run_id, (chunk) => {
              if (/(?:^|\r?\n)__AGENTC_RUN_COMPLETE__:\d+/.test(chunk)) {
                finish(true, false);
              }
            });
          }
          return;
        }

        if (['review', 'done', 'error'].includes(current.status)) {
          // Only consider completed if we saw the task running during this call
          // OR if completed_at was recorded after execution start time (startTime)
          const completedAtMs = current.completed_at ? new Date(current.completed_at).getTime() : 0;
          if (seenRunning || completedAtMs >= startTime - 500) {
            finish(true, false);
          }
        }
      };

      const initial = TaskRepository.getById(taskId);
      if (initial?.status === 'running') {
        seenRunning = true;
      }
      if (initial?.run_id) {
        removeListener = ProcessManager.addListener(initial.run_id, (chunk) => {
          if (/(?:^|\r?\n)__AGENTC_RUN_COMPLETE__:\d+/.test(chunk)) {
            finish(true, false);
          }
        });
      }

      checkStatus();

      pollInterval = setInterval(() => {
        checkStatus();
      }, 1000);
    });
  }

  async function notifyFastify(
    events: Array<{ type: AgentCEventType; projectId?: string; taskId?: string }>
  ): Promise<void> {
    const host = CONFIG.HOST === '0.0.0.0' ? '127.0.0.1' : CONFIG.HOST;
    const url = `http://${host}:${CONFIG.PORT}/api/events/broadcast`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600);

      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
    } catch {
      // Silent fail if Fastify is not active (e.g. headless/CLI use)
    }
  }

  async function startTaskViaFastify(
    taskId: string,
    options?: { resume?: boolean; feedback_prompt?: string; auto_complete?: boolean }
  ): Promise<{ queued: boolean; position: number } | null> {
    const host = CONFIG.HOST === '0.0.0.0' ? '127.0.0.1' : CONFIG.HOST;
    const url = `http://${host}:${CONFIG.PORT}/api/tasks/${taskId}/start`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: options?.resume,
          feedback_prompt: options?.feedback_prompt,
          auto_complete: options?.auto_complete,
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (res.ok) {
        const data = (await res.json()) as { queued?: boolean; position?: number };
        return {
          queued: Boolean(data.queued),
          position: data.position ?? 0,
        };
      }
      return null;
    } catch {
      // Fastify is not running or timed out; falls back to local execution
      return null;
    }
  }

  // 2. Tool execution handler with strictly valid JSON responses
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'agentc_list_projects') {
        const projects = ProjectRepository.list();
        const result = projects.map((p) => ({
          id: p.id,
          name: p.name,
          path: p.path,
          running_tasks: p.running_count ?? 0,
          review_tasks: p.review_count ?? 0,
          backlog_tasks: p.backlog_count ?? 0,
          done_tasks: p.done_count ?? 0,
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === 'agentc_register_project') {
        const schema = z.object({
          name: z.string().min(1),
          project_path: z.string().min(1),
        });
        const { name: projName, project_path } = schema.parse(args);
        const absPath = path.resolve(project_path);

        const project = ensureProject(absPath, projName);
        Reconciler.reconcileProject(project.id, absPath);

        await notifyFastify([
          { type: 'PROJECTS_UPDATED' },
          { type: 'BOARD_UPDATED', projectId: project.id },
        ]);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: 'Project registered successfully',
                  project: {
                    id: project.id,
                    name: project.name,
                    path: project.path,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'agentc_create_plan') {
        const schema = z.object({
          project_path: z.string(),
          feature: z.string().optional(),
          tasks: z.array(
            z.object({
              title: z.string(),
              mode: z.enum(['Builder', 'Scout']),
              feature: z.string().optional(),
              runner: z.enum(['opencode', 'antigravity-cli']).optional(),
              model: z.string().optional(),
              variant: z.string().optional(),
              thinking: z.boolean().optional(),
              prompt: z.string(),
              guardrails: z.string().optional(),
            })
          ),
        });
        const { project_path, feature: planFeature, tasks } = schema.parse(args);
        const absPath = path.resolve(project_path);
        const project = ensureProject(absPath);

        const createdTasks = [];
        for (const t of tasks) {
          const taskFeature = t.feature?.trim() || planFeature?.trim() || undefined;
          const created = Reconciler.createTaskOnDisk(project.id, project.path, {
            ...t,
            feature: taskFeature,
          });
          createdTasks.push({
            id: created.id,
            run_id: created.run_id,
            title: created.title,
            mode: created.mode,
            status: created.status,
            feature: created.feature,
            reused: Boolean((created as any).reused),
          });
        }

        await notifyFastify([
          { type: 'BOARD_UPDATED', projectId: project.id },
          { type: 'PROJECTS_UPDATED' },
        ]);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  count: createdTasks.length,
                  tasks: createdTasks,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'agentc_get_board') {
        const schema = z.object({
          project_path: z.string(),
          feature: z.string().optional(),
          all_done: z.boolean().optional().default(false),
        });
        const { project_path, feature, all_done } = schema.parse(args);
        const absPath = path.resolve(project_path);
        const project = ensureProject(absPath);

        const allTasks = Reconciler.reconcileProject(project.id, project.path);

        // Filter by feature if provided (case-insensitive)
        const filteredTasks = feature && feature.trim().length > 0
          ? allTasks.filter((t) => t.feature && t.feature.toLowerCase() === feature.trim().toLowerCase())
          : allTasks;

        const backlogTasks = filteredTasks.filter((t) => t.status === 'backlog');
        const runningTasks = filteredTasks.filter((t) => t.status === 'running');
        const reviewTasks = filteredTasks.filter((t) => t.status === 'review' || t.status === 'error');
        const doneTasks = filteredTasks.filter((t) => t.status === 'done');

        const mapTaskSummary = (t: typeof allTasks[0]) => ({
          id: t.id,
          title: t.title,
          mode: t.mode,
          runner: t.runner,
          ...(t.feature ? { feature: t.feature } : {}),
        });

        const mapReviewSummary = (t: typeof allTasks[0]) => ({
          id: t.id,
          title: t.title,
          mode: t.mode,
          status: t.status,
          ...(t.feature ? { feature: t.feature } : {}),
        });

        const mapDoneSummary = (t: typeof allTasks[0]) => ({
          id: t.id,
          title: t.title,
          ...(t.feature ? { feature: t.feature } : {}),
        });

        const board: Record<string, any> = {
          project: {
            id: project.id,
            name: project.name,
            path: project.path,
            metrics: {
              backlog: backlogTasks.length,
              running: runningTasks.length,
              review: reviewTasks.length,
              done_total: doneTasks.length,
            },
            ...(feature ? { active_feature_filter: feature.trim() } : {}),
          },
          backlog: backlogTasks.map(mapTaskSummary),
          running: runningTasks.map(mapTaskSummary),
          review: reviewTasks.map(mapReviewSummary),
        };

        if (all_done) {
          board.done = doneTasks.map(mapDoneSummary);
        } else {
          // Return only the 3 most recent in reverse chronological order
          const recentDone = [...doneTasks].reverse().slice(0, 3);
          board.recent_done = recentDone.map(mapDoneSummary);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(board, null, 2) }],
        };
      }

      if (name === 'agentc_start_task') {
        const schema = z.object({
          project_path: z.string(),
          task_id: z.string().optional(),
          feature: z.string().optional(),
          resume: z.boolean().optional(),
          feedback_prompt: z.string().optional(),
          auto_complete: z.boolean().optional(),
          wait: z.boolean().optional().default(true),
          timeout_seconds: z.number().positive().optional().default(120),
        });
        const { project_path, task_id, feature, resume, feedback_prompt, auto_complete, wait, timeout_seconds } = schema.parse(args);
        const absPath = path.resolve(project_path);
        const project = ensureProject(absPath);

        let targetTaskId: string;
        if (!task_id) {
          const tasks = TaskRepository.listByProjectId(project.id);
          const nextTask = feature && feature.trim().length > 0
            ? tasks.find((t) => t.status === 'backlog' && t.feature && t.feature.toLowerCase() === feature.trim().toLowerCase())
            : tasks.find((t) => t.status === 'backlog');
          if (!nextTask) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: false,
                      message: feature
                        ? `No backlog task found for feature "${feature}".`
                        : 'No backlog task found to start.',
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }
          targetTaskId = nextTask.id;
        } else {
          targetTaskId = task_id;
        }

        const startTime = Date.now();

        // 1. Attempt dispatch via Fastify so UI gets live terminal streaming and SSE
        let result = await startTaskViaFastify(targetTaskId, {
          resume,
          feedback_prompt,
          auto_complete,
        });

        if (!result) {
          // Fallback: execute locally if Fastify is not active (e.g. headless CLI)
          result = await RunnerEngine.startTask(targetTaskId, {
            resume,
            feedbackPrompt: feedback_prompt,
            autoComplete: auto_complete,
          });
          await notifyFastify([
            { type: 'BOARD_UPDATED', projectId: project.id, taskId: targetTaskId },
            { type: 'QUEUE_UPDATED', projectId: project.id },
          ]);
        }

        // Explicit asynchronous mode (non-blocking dispatch)
        if (wait === false) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    completed: false,
                    task_id: targetTaskId,
                    queued: result.queued,
                    position: result.position,
                    message: result.queued
                      ? `Task ${targetTaskId} enqueued in Builder queue (position ${result.position}).`
                      : `Task ${targetTaskId} successfully dispatched in background.`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Default synchronous mode (wait: true): await completion on server
        const waitResult = await waitForTaskCompletion(targetTaskId, timeout_seconds * 1000, startTime);
        const durationSeconds = Math.round((Date.now() - startTime) / 1000);

        // Project auto-reconciliation to ensure sync with disk files
        Reconciler.reconcileProject(project.id, absPath);
        const task = TaskRepository.getById(targetTaskId);
        if (!task) {
          throw new Error(`Task not found after execution: ${targetTaskId}`);
        }

        await notifyFastify([
          { type: 'BOARD_UPDATED', projectId: project.id, taskId: targetTaskId },
          { type: 'PROJECTS_UPDATED' },
        ]);

        if (waitResult.timedOut) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    completed: false,
                    timed_out: true,
                    task_id: targetTaskId,
                    status: task.status,
                    duration_seconds: durationSeconds,
                    message: `The task is long-running and continues executing autonomously in background on AgentC (${durationSeconds}s elapsed). Conclude your current turn informing the user; the outcome can be queried via agentc_get_task_outcome or monitored on the Kanban board.`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        // Task completed (status: review, done, or error)
        const details = Reconciler.getTaskDetails(task, absPath);
        const diffStat = task.affected_files && task.affected_files.length > 0
          ? GitService.getDiffStat(absPath, task.affected_files)
          : 'No files modified.';

        const outcome: Record<string, unknown> = {
          success: task.exit_code === 0 && task.status !== 'error',
          completed: true,
          task_id: task.id,
          title: task.title,
          mode: task.mode,
          runner: task.runner,
          status: task.status,
          exit_code: task.exit_code,
          auto_completed: Boolean(auto_complete && task.status === 'done'),
          duration_seconds: durationSeconds,
          affected_files: task.affected_files || [],
          diff_stat: diffStat,
          report_content: details.report_markdown || 'No report.md generated.',
        };

        if (task.status === 'error' || (task.exit_code !== null && task.exit_code !== 0)) {
          const errorSummary = extractErrorSummary(absPath, task.run_id);
          if (errorSummary) {
            outcome.error_summary = errorSummary;
          }
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(outcome, null, 2) }],
        };
      }

      if (name === 'agentc_get_task_outcome') {
        const schema = z.object({
          project_path: z.string(),
          task_id: z.string(),
        });
        const { project_path, task_id } = schema.parse(args);
        const absPath = path.resolve(project_path);

        // Auto-reconciliation before fetching outcome
        const project = ensureProject(absPath);
        Reconciler.reconcileProject(project.id, absPath);

        const task = TaskRepository.getById(task_id);
        if (!task) {
          throw new Error(`Task not found: ${task_id}`);
        }

        if (task.status === 'running') {
          const startedAtMs = task.started_at ? new Date(task.started_at).getTime() : 0;
          const durationSeconds = startedAtMs > 0 ? Math.round((Date.now() - startedAtMs) / 1000) : 0;
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    success: true,
                    completed: false,
                    task_id: task.id,
                    title: task.title,
                    mode: task.mode,
                    runner: task.runner,
                    status: 'running',
                    duration_seconds: durationSeconds,
                    message: `Task continues running in AgentC (${durationSeconds}s elapsed).`,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const details = Reconciler.getTaskDetails(task, absPath);
        const diffStat = task.affected_files && task.affected_files.length > 0
          ? GitService.getDiffStat(absPath, task.affected_files)
          : 'No files modified.';

        const outcome: Record<string, unknown> = {
          task_id: task.id,
          title: task.title,
          status: task.status,
          exit_code: task.exit_code,
          affected_files: task.affected_files,
          diff_stat: diffStat,
          report_content: details.report_markdown || 'No report.md generated.',
        };

        if (task.status === 'error' || (task.exit_code !== null && task.exit_code !== 0)) {
          const errorSummary = extractErrorSummary(absPath, task.run_id);
          if (errorSummary) {
            outcome.error_summary = errorSummary;
          }
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(outcome, null, 2) }],
        };
      }

      if (name === 'agentc_update_task_status') {
        const schema = z.object({
          project_path: z.string(),
          task_id: z.string(),
          status: z.enum(['done', 'backlog', 'review']),
          comment: z.string().optional(),
        });
        const { project_path, task_id, status, comment } = schema.parse(args);
        const absPath = path.resolve(project_path);
        const project = ensureProject(absPath);

        const task = TaskRepository.getById(task_id);
        if (!task) {
          throw new Error(`Task not found: ${task_id}`);
        }

        // Update run.json on disk
        Reconciler.updateRunJSON(project.path, task.run_id, { status });

        // If transition comment exists, append to report.md
        if (comment && comment.trim().length > 0) {
          const note = `\n\n> [!NOTE]\n> **Transition Note to [${status.toUpperCase()}]:** ${comment.trim()}\n`;
          const details = Reconciler.getTaskDetails(task, project.path);
          if (details.report_markdown) {
            Reconciler.writeReport(project.path, task.run_id, details.report_markdown + note);
          }
        }

        // Update SQLite
        TaskRepository.updateStatus(task.id, status);
        const updatedTask = TaskRepository.getById(task.id);

        await notifyFastify([
          { type: 'BOARD_UPDATED', projectId: project.id, taskId: task.id },
          { type: 'PROJECTS_UPDATED' },
        ]);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  task_id: task.id,
                  title: task.title,
                  previous_status: task.status,
                  current_status: updatedTask?.status || status,
                  message: `Task status updated to '${status}' successfully.`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      if (name === 'agentc_cancel_task') {
        const schema = z.object({
          project_path: z.string(),
          task_id: z.string(),
        });
        const { project_path, task_id } = schema.parse(args);
        const absPath = path.resolve(project_path);
        const project = ensureProject(absPath);

        const task = TaskRepository.getById(task_id);
        if (!task) {
          throw new Error(`Task not found: ${task_id}`);
        }

        // 1. Attempt cancel via Fastify if running under web server process
        let cancelledViaFastify = false;
        const host = CONFIG.HOST === '0.0.0.0' ? '127.0.0.1' : CONFIG.HOST;
        const url = `http://${host}:${CONFIG.PORT}/api/tasks/${task.id}/cancel`;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          const res = await fetch(url, { method: 'POST', signal: controller.signal }).finally(() =>
            clearTimeout(timeoutId)
          );
          if (res.ok) {
            cancelledViaFastify = true;
          }
        } catch {
          // Fastify not active or timed out
        }

        if (!cancelledViaFastify) {
          // Fallback: local cancellation
          await RunnerEngine.cancelTask(task.id);
        }

        await notifyFastify([
          { type: 'BOARD_UPDATED', projectId: project.id, taskId: task.id },
          { type: 'QUEUE_UPDATED', projectId: project.id },
        ]);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  task_id: task.id,
                  status: 'error',
                  message: `Task ${task.id} execution cancelled successfully.`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (err: unknown) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: String(err) }) }],
      };
    }
  });

  return server;
}
