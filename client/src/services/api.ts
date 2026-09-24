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
} from '../types/index.js';

const API_BASE = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const hasBody = options?.body !== undefined && options.body !== null;
  const headers: Record<string, string> = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(options?.headers as Record<string, string> | undefined),
  };
  const res = await fetch(url, {
    ...options,
    headers,
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

  return res.json() as Promise<T>;
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
};
