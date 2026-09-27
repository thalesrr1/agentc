import type {
  Project,
  BoardData,
  CreateProjectDTO,
  CreateTaskDTO,
  Task,
  TaskDetail,
  TaskStatus,
  UpdateTaskDTO,
  McpToolsResponse,
  FeaturePipelineState,
  HarnessStatusResponse,
  HarnessType,
  InstallTarget,
  InstallScope,
} from '../types/index.js';


const API_BASE = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const hasBody = options?.body !== undefined && options.body !== null;
  const headers: Record<string, string> = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(options?.headers as Record<string, string> | undefined),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  const signal = options?.signal
    ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([options.signal, controller.signal]) : controller.signal)
    : controller.signal;

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal,
    });

    if (!res.ok) {
      let errorMsg = `Erro ${res.status}: ${res.statusText}`;
      try {
        const body = await res.json();
        if (body.error) {
          errorMsg = body.error;
        }
      } catch {
        // ignora
      }
      throw new Error(errorMsg);
    }

    return (await res.json()) as T;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Tempo limite excedido (15s) ao requisitar ${endpoint}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  async getProjects(): Promise<Project[]> {
    return request<Project[]>('/projects');
  },

  async createProject(dto: CreateProjectDTO): Promise<Project> {
    return request<Project>('/projects', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async deleteProject(id: string): Promise<{ success: boolean; hidden?: boolean }> {
    return request<{ success: boolean; hidden?: boolean }>(`/projects/${id}`, {
      method: 'DELETE',
    });
  },

  async deleteProjectPermanent(
    id: string,
    options?: { deleteRunsDir?: boolean }
  ): Promise<{ success: boolean; permanent: boolean }> {
    return request<{ success: boolean; permanent: boolean }>(`/projects/${id}/permanent`, {
      method: 'DELETE',
      body: JSON.stringify(options || {}),
    });
  },

  async getHiddenProjects(): Promise<Project[]> {
    return request<Project[]>('/projects/hidden');
  },

  async restoreProject(id: string): Promise<{ success: boolean; restored?: boolean }> {
    return request<{ success: boolean; restored?: boolean }>(`/projects/${id}/restore`, {
      method: 'POST',
    });
  },

  async getBoard(projectId: string, options?: { reconcile?: boolean }): Promise<BoardData> {
    const query = options?.reconcile ? '?reconcile=true' : '';
    return request<BoardData>(`/projects/${projectId}/board${query}`);
  },

  async reconcileProject(projectId: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/projects/${projectId}/reconcile`, {
      method: 'POST',
    });
  },

  async createTask(projectId: string, dto: CreateTaskDTO): Promise<Task> {
    return request<Task>(`/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async getTask(taskId: string): Promise<TaskDetail> {
    return request<TaskDetail>(`/tasks/${taskId}`);
  },

  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
    return request<Task>(`/tasks/${taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async updateTask(taskId: string, dto: UpdateTaskDTO): Promise<TaskDetail> {
    return request<TaskDetail>(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  async getMcpTools(): Promise<McpToolsResponse> {
    return request<McpToolsResponse>('/system/mcp-tools');
  },

  async startTask(
    taskId: string,
    options?: { resume?: boolean; feedback_prompt?: string }
  ): Promise<{ queued: boolean; position: number }> {
    return request<{ queued: boolean; position: number }>(`/tasks/${taskId}/start`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  },

  async cancelTask(taskId: string): Promise<void> {
    await request<{ success: boolean }>(`/tasks/${taskId}/cancel`, {
      method: 'POST',
    });
  },

  async startFeaturePipeline(
    projectId: string,
    feature: string
  ): Promise<{ success: boolean; message: string; state: FeaturePipelineState }> {
    return request<{ success: boolean; message: string; state: FeaturePipelineState }>(
      `/projects/${projectId}/features/${encodeURIComponent(feature)}/start`,
      { method: 'POST', body: JSON.stringify({}) }
    );
  },

  async pauseFeaturePipeline(
    projectId: string,
    feature: string
  ): Promise<{ success: boolean; message: string; state: FeaturePipelineState }> {
    return request<{ success: boolean; message: string; state: FeaturePipelineState }>(
      `/projects/${projectId}/features/${encodeURIComponent(feature)}/pause`,
      { method: 'POST' }
    );
  },

  async resumeFeaturePipeline(
    projectId: string,
    feature: string
  ): Promise<{ success: boolean; message: string; state: FeaturePipelineState }> {
    return request<{ success: boolean; message: string; state: FeaturePipelineState }>(
      `/projects/${projectId}/features/${encodeURIComponent(feature)}/resume`,
      { method: 'POST' }
    );
  },

  async getFeaturePipelineStatus(
    projectId: string,
    feature: string
  ): Promise<{ success: boolean; state: FeaturePipelineState }> {
    return request<{ success: boolean; state: FeaturePipelineState }>(
      `/projects/${projectId}/features/${encodeURIComponent(feature)}/status`
    );
  },

  async listFeaturePipelines(
    projectId: string
  ): Promise<{ success: boolean; pipelines: FeaturePipelineState[] }> {
    return request<{ success: boolean; pipelines: FeaturePipelineState[] }>(
      `/projects/${projectId}/pipelines`
    );
  },

  async selectFolder(): Promise<{ path: string; name: string } | null> {
    const res = await request<{ success: boolean; path?: string; name?: string; cancelled?: boolean }>(
      '/system/select-folder',
      { method: 'POST' }
    );
    if (res.success && res.path && res.name) {
      return { path: res.path, name: res.name };
    }
    return null;
  },

  async getQuickFolders(): Promise<Array<{ name: string; path: string }>> {
    return request<Array<{ name: string; path: string }>>('/system/quick-folders');
  },

  async getSettings(projectId?: string): Promise<{
    active_runner: 'opencode' | 'antigravity-cli';
    active_model: string;
    catalog: Record<'opencode' | 'antigravity-cli', string[]>;
  }> {
    const query = projectId ? `?project_id=${projectId}` : '';
    return request(`/settings${query}`);
  },

  async updateSettings(data: {
    runner: 'opencode' | 'antigravity-cli';
    model: string;
    project_id?: string;
  }): Promise<{
    success: boolean;
    active_runner: 'opencode' | 'antigravity-cli';
    active_model: string;
    catalog: Record<'opencode' | 'antigravity-cli', string[]>;
  }> {
    return request('/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async addModelToRunner(
    runner: 'opencode' | 'antigravity-cli',
    model: string
  ): Promise<{ success: boolean; runner: string; models: string[] }> {
    return request('/settings/models', {
      method: 'POST',
      body: JSON.stringify({ runner, model }),
    });
  },

  async removeModelFromRunner(
    runner: 'opencode' | 'antigravity-cli',
    model: string
  ): Promise<{ success: boolean; runner: string; models: string[] }> {
    return request('/settings/models', {
      method: 'DELETE',
      body: JSON.stringify({ runner, model }),
    });
  },

  async getOpenCodeProviders(): Promise<{
    providers: Array<{ id: string; name: string; prefix: string }>;
  }> {
    return request('/settings/opencode/providers');
  },

  async getOpenCodeModels(provider: string): Promise<{
    provider: string;
    count: number;
    models: string[];
  }> {
    return request(`/settings/opencode/models?provider=${encodeURIComponent(provider)}`);
  },

  async openInCode(path: string): Promise<{ success: boolean; message?: string }> {
    return request('/system/open-code', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  },

  async openInExplorer(path: string): Promise<{ success: boolean; message?: string }> {
    return request('/system/open-explorer', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  },

  async getHarnessStatus(projectPath?: string): Promise<HarnessStatusResponse> {
    const query = projectPath ? `?project_path=${encodeURIComponent(projectPath)}` : '';
    return request(`/system/harness-status${query}`);
  },

  async installHarness(data: {
    harness: HarnessType;
    target: InstallTarget;
    scope: InstallScope;
    projectPath?: string;
  }): Promise<{ success: boolean; message: string; details?: string[] }> {
    return request('/system/install-harness', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};


