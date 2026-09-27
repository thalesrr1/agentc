import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api.js';
import { useAgentCEvents } from './useAgentCEvents.js';
import type { Project, CreateProjectDTO } from '../types/index.js';

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [hiddenProjects, setHiddenProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const isFetchingRef = useRef<boolean>(false);

  // Guarda o id ativo atual para evitar dependência cíclica no useCallback
  const activeProjectIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeProjectIdRef.current = activeProject?.id || null;
  }, [activeProject]);

  const fetchProjects = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const [list, hidden] = await Promise.all([
        api.getProjects(),
        api.getHiddenProjects().catch(() => [] as Project[]),
      ]);
      setProjects(list);
      setHiddenProjects(hidden);

      setActiveProject((prevActive) => {
        const savedId = localStorage.getItem('agentc_active_project_id');
        const targetId = prevActive?.id || activeProjectIdRef.current || savedId;

        if (targetId) {
          const found = list.find((p) => p.id === targetId);
          if (found) {
            // Se os dados não mudaram, preserva a referência exata para evitar re-render em cascata
            if (
              prevActive &&
              prevActive.id === found.id &&
              prevActive.running_count === found.running_count &&
              prevActive.review_count === found.review_count &&
              prevActive.backlog_count === found.backlog_count &&
              prevActive.done_count === found.done_count &&
              prevActive.updated_at === found.updated_at &&
              JSON.stringify(prevActive.active_pipeline) === JSON.stringify(found.active_pipeline)
            ) {
              return prevActive;
            }
            return found;
          }
        }

        if (list.length > 0 && !prevActive) {
          const first = list[0]!;
          localStorage.setItem('agentc_active_project_id', first.id);
          return first;
        }

        return prevActive;
      });
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Escuta eventos SSE em tempo real para atualização de contadores de projetos
  useAgentCEvents(
    useCallback(
      (event) => {
        if (event.type === 'PROJECTS_UPDATED') {
          fetchProjects();
        }
      },
      [fetchProjects]
    )
  );

  useEffect(() => {
    fetchProjects();

    // Heartbeat de segurança a cada 10s enquanto visível (com eventos SSE cobrindo tempo real)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchProjects();
    }, 10000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchProjects();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchProjects]);

  const selectProject = (project: Project) => {
    setActiveProject(project);
    localStorage.setItem('agentc_active_project_id', project.id);
  };

  const createProject = async (dto: CreateProjectDTO) => {
    const created = await api.createProject(dto);
    await fetchProjects();
    selectProject(created);
    return created;
  };

  const deleteProject = async (id: string) => {
    await api.deleteProject(id);
    await fetchProjects();
    if (activeProject?.id === id) {
      const remaining = projects.filter((p) => p.id !== id);
      const next = remaining[0] || null;
      setActiveProject(next);
      if (next) {
        localStorage.setItem('agentc_active_project_id', next.id);
      } else {
        localStorage.removeItem('agentc_active_project_id');
      }
    }
  };

  const restoreProject = async (id: string) => {
    await api.restoreProject(id);
    await fetchProjects();
  };

  const deleteProjectPermanent = async (
    id: string,
    options?: { deleteRunsDir?: boolean }
  ) => {
    await api.deleteProjectPermanent(id, options);
    await fetchProjects();
    if (activeProject?.id === id) {
      const remaining = projects.filter((p) => p.id !== id);
      const next = remaining[0] || null;
      setActiveProject(next);
      if (next) {
        localStorage.setItem('agentc_active_project_id', next.id);
      } else {
        localStorage.removeItem('agentc_active_project_id');
      }
    }
  };

  return {
    projects,
    hiddenProjects,
    activeProject,
    loading,
    error,
    refreshProjects: fetchProjects,
    selectProject,
    createProject,
    deleteProject,
    restoreProject,
    deleteProjectPermanent,
  };
}
