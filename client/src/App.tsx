import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useProjects } from './hooks/useProjects.js';
import { useBoard } from './hooks/useBoard.js';
import { useProjectPipelines } from './hooks/useProjectPipelines.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { Topbar } from './components/layout/Topbar.js';
import { Board } from './components/kanban/Board.js';
import { BoardFilterBar, type DateFilterOption } from './components/kanban/BoardFilterBar.js';
import { FeaturePipelinesContainer } from './components/kanban/FeaturePipelinesContainer.js';
import { InspectionDrawer } from './components/inspection/InspectionDrawer.js';
import { NewProjectModal } from './components/modals/NewProjectModal.js';
import { NewTaskModal } from './components/modals/NewTaskModal.js';
import { CliManagerModal } from './components/modals/CliManagerModal.js';
import { HideProjectModal } from './components/modals/HideProjectModal.js';
import { HiddenProjectsModal } from './components/modals/HiddenProjectsModal.js';
import { DeleteProjectPermanentModal } from './components/modals/DeleteProjectPermanentModal.js';
import { McpToolsModal } from './components/modals/McpToolsModal.js';
import { PWAInstallBanner } from './components/pwa/PWAInstallBanner.js';
import { PWAUpdateBanner } from './components/pwa/PWAUpdateBanner.js';
import { ServerOfflineBanner } from './components/pwa/ServerOfflineBanner.js';
import { api } from './services/api.js';
import type { Task, RunnerType, Project } from './types/index.js';

export function App() {
  const {
    projects,
    hiddenProjects,
    activeProject,
    selectProject,
    createProject,
    deleteProject,
    restoreProject,
    deleteProjectPermanent,
    refreshProjects,
  } = useProjects();

  const {
    boardData,
    loading: boardLoading,
    refreshBoard,
    startTask,
    cancelTask,
    updateStatus,
    createTask,
  } = useBoard(activeProject?.id || null);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [isCliManagerOpen, setIsCliManagerOpen] = useState(false);
  const [isMcpModalOpen, setIsMcpModalOpen] = useState(false);
  const [projectToHide, setProjectToHide] = useState<Project | null>(null);
  const [projectToDeletePermanent, setProjectToDeletePermanent] = useState<Project | null>(null);
  const [isHiddenProjectsModalOpen, setIsHiddenProjectsModalOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('agentc_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('agentc_sidebar_collapsed', String(isSidebarCollapsed));
    } catch {}
  }, [isSidebarCollapsed]);

  // Toast de Notificações e Desfazer
  const [toastMessage, setToastMessage] = useState<{
    id: string;
    text: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (params: {
      text: string;
      actionLabel?: string;
      onAction?: () => void;
      durationMs?: number;
    }) => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      setToastMessage({
        id: String(Date.now()),
        text: params.text,
        actionLabel: params.actionLabel,
        onAction: params.onAction,
      });
      toastTimeoutRef.current = setTimeout(() => {
        setToastMessage(null);
      }, params.durationMs || 6000);
    },
    []
  );

  // Estados de Filtros Customizados do Kanban
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFeature, setSelectedFeature] = useState('all');
  const [selectedDate, setSelectedDate] = useState<DateFilterOption>('all');

  // Motor de execução ativo (OpenCode ou Antigravity CLI com modelo configurado)
  const [activeRunner, setActiveRunner] = useState<RunnerType>('opencode');
  const [activeModel, setActiveModel] = useState<string>('minimax/MiniMax-M3');

  // Hook de Feature Pipelines — gerencia todas as esteiras do projeto ativo
  const projectPipelines = useProjectPipelines(activeProject?.id ?? null);

  const handlePipelineStart = useCallback(
    async (feature: string) => {
      if (!activeProject || !feature) return;
      try {
        await projectPipelines.start(feature);
        await refreshBoard();
        showToast({
          text: `Pipeline "${feature}" iniciada em background.`,
        });
      } catch (err) {
        showToast({
          text: `Falha ao iniciar pipeline: ${String(err)}`,
          durationMs: 8000,
        });
      }
    },
    [activeProject, projectPipelines, refreshBoard, showToast]
  );

  const handlePipelinePause = useCallback(
    async (feature: string) => {
      if (!activeProject || !feature) return;
      try {
        const res = await projectPipelines.pause(feature);
        await refreshBoard();
        if (res && res.state.status === 'paused') {
          showToast({ text: `Pipeline "${feature}" pausada.` });
        } else {
          showToast({ text: `Pipeline "${feature}" será pausada após a tarefa atual.` });
        }
      } catch (err) {
        showToast({ text: `Falha ao pausar: ${String(err)}`, durationMs: 8000 });
      }
    },
    [activeProject, projectPipelines, refreshBoard, showToast]
  );

  const handlePipelineResume = useCallback(
    async (feature: string) => {
      if (!activeProject || !feature) return;
      try {
        await projectPipelines.resume(feature);
        await refreshBoard();
        showToast({ text: `Pipeline "${feature}" retomada.` });
      } catch (err) {
        showToast({ text: `Falha ao retomar: ${String(err)}`, durationMs: 8000 });
      }
    },
    [activeProject, projectPipelines, refreshBoard, showToast]
  );

  // Carrega motor ativo para o projeto selecionado
  const loadEngineSettings = async () => {
    try {
      const settings = await api.getSettings(activeProject?.id);
      setActiveRunner(settings.active_runner);
      setActiveModel(settings.active_model);
    } catch (err) {
      console.error('Erro ao carregar motor de execução:', err);
    }
  };

  useEffect(() => {
    loadEngineSettings();
    // Reseta filtros ao alternar de projeto
    setSearchQuery('');
    setSelectedFeature('all');
    setSelectedDate('all');
  }, [activeProject?.id]);

  // Lista consolidada de todas as tarefas para extrair estatísticas e features
  const allBoardTasks = useMemo(() => {
    if (!boardData) return [];
    return [
      ...boardData.columns.backlog,
      ...boardData.columns.running,
      ...boardData.columns.review,
      ...boardData.columns.done,
    ];
  }, [boardData]);

  // Features únicas presentes nas tarefas do projeto atual com contagem
  const availableFeatures = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of allBoardTasks) {
      if (t.feature && t.feature.trim()) {
        const f = t.feature.trim();
        counts[f] = (counts[f] || 0) + 1;
      }
    }
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [allBoardTasks]);

  // Board filtrado reativamente
  const filteredBoardData = useMemo(() => {
    if (!boardData) return null;
    const q = searchQuery.trim().toLowerCase();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const threeDaysAgo = startOfToday - 3 * 24 * 60 * 60 * 1000;
    const sevenDaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;

    const matchTask = (t: Task) => {
      // 1. Filtro por Busca de Texto (Nome / Run ID)
      if (q) {
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchRunId = t.run_id.toLowerCase().includes(q);
        if (!matchTitle && !matchRunId) return false;
      }

      // 2. Filtro por Feature
      if (selectedFeature !== 'all') {
        if ((t.feature || '').toLowerCase() !== selectedFeature.toLowerCase()) {
          return false;
        }
      }

      // 3. Filtro por Data
      if (selectedDate !== 'all') {
        const taskTime = new Date(t.created_at).getTime();
        if (selectedDate === 'today' && taskTime < startOfToday) {
          return false;
        }
        if (selectedDate === '3days' && taskTime < threeDaysAgo) {
          return false;
        }
        if (selectedDate === '7days' && taskTime < sevenDaysAgo) {
          return false;
        }
      }

      return true;
    };

    return {
      ...boardData,
      columns: {
        backlog: [...boardData.columns.backlog.filter(matchTask)].sort((a, b) => {
          const featA = a.feature || '';
          const featB = b.feature || '';
          if (featA !== featB) {
            return featA.localeCompare(featB);
          }
          const orderA = typeof a.order_index === 'number' ? a.order_index : 9999;
          const orderB = typeof b.order_index === 'number' ? b.order_index : 9999;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return a.created_at.localeCompare(b.created_at);
        }),
        running: boardData.columns.running.filter(matchTask),
        review: boardData.columns.review.filter(matchTask),
        done: [...boardData.columns.done.filter(matchTask)].sort((a, b) => {
          const timeA = a.completed_at || a.created_at;
          const timeB = b.completed_at || b.created_at;
          return timeB.localeCompare(timeA);
        }),
      },
    };
  }, [boardData, searchQuery, selectedFeature, selectedDate]);

  const totalTasksCount = allBoardTasks.length;
  const filteredTasksCount = useMemo(() => {
    if (!filteredBoardData) return 0;
    return (
      filteredBoardData.columns.backlog.length +
      filteredBoardData.columns.running.length +
      filteredBoardData.columns.review.length +
      filteredBoardData.columns.done.length
    );
  }, [filteredBoardData]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedFeature('all');
    setSelectedDate('all');
  };

  // Mantém a tarefa selecionada sincronizada com atualizações do board sem disparar re-renders à toa
  useEffect(() => {
    if (selectedTask && boardData) {
      const found = allBoardTasks.find((t) => t.id === selectedTask.id);
      if (found) {
        setSelectedTask((prev) => {
          if (
            prev &&
            prev.id === found.id &&
            prev.status === found.status &&
            prev.exit_code === found.exit_code &&
            prev.started_at === found.started_at &&
            prev.completed_at === found.completed_at &&
            prev.runner === found.runner &&
            prev.model === found.model &&
            prev.title === found.title &&
            prev.feature === found.feature &&
            prev.affected_files?.length === found.affected_files?.length
          ) {
            return prev;
          }
          return found;
        });
      }
    }
  }, [boardData, selectedTask?.id, allBoardTasks]);

  // Atalhos globais: Ctrl+B para colapsar/descolapsar sidebar, Ctrl+N para nova tarefa
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (activeProject) {
          setIsNewTaskModalOpen(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeProject]);

  const handleRefresh = async () => {
    await Promise.all([refreshProjects(), refreshBoard({ reconcile: true })]);
  };

  const handleRequestHideProject = async (project: Project) => {
    const skipConfirm = localStorage.getItem('agentc_skip_hide_confirm') === 'true';
    const hasRunningTasks = (project.running_count || 0) > 0;

    // Se o usuário optou por não confirmar E não há tarefas rodando, oculta direto com opção de Desfazer
    if (skipConfirm && !hasRunningTasks) {
      try {
        await deleteProject(project.id);
        showToast({
          text: `Projeto "${project.name}" ocultado da barra lateral.`,
          actionLabel: 'Desfazer',
          onAction: async () => {
            await restoreProject(project.id);
          },
        });
      } catch (err) {
        console.error('Falha ao ocultar projeto:', err);
      }
    } else {
      // Se não marcou ou se há tarefas em execução, sempre abre o modal
      setProjectToHide(project);
    }
  };

  const handleConfirmHide = async (projectId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    await deleteProject(projectId);
    setProjectToHide(null);
    if (proj) {
      showToast({
        text: `Projeto "${proj.name}" ocultado da barra lateral.`,
        actionLabel: 'Desfazer',
        onAction: async () => {
          await restoreProject(proj.id);
        },
      });
    }
  };

  const handleRestore = async (projectId: string) => {
    await restoreProject(projectId);
    showToast({
      text: 'Projeto restaurado com sucesso.',
    });
  };

  const handleConfirmPermanentDelete = async (
    projectId: string,
    deleteRunsDir: boolean
  ) => {
    await deleteProjectPermanent(projectId, { deleteRunsDir });
    setProjectToDeletePermanent(null);
    showToast({
      text: 'Projeto excluído definitivamente do AgentC.',
    });
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#09090b] text-[#f4f4f5]">
      {/* 1. Sidebar Colapsável (260px / 0px via Ctrl+B) */}
      <Sidebar
        projects={projects}
        hiddenProjects={hiddenProjects}
        activeProject={activeProject}
        onSelectProject={selectProject}
        onOpenNewProjectModal={() => setIsNewProjectModalOpen(true)}
        onRequestHideProject={handleRequestHideProject}
        onOpenHiddenProjectsModal={() => setIsHiddenProjectsModalOpen(true)}
        onOpenConnectModal={() => setIsMcpModalOpen(true)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
      />

      {/* 2. Área Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar com Projeto, Seletor de Motor Ativo, Fila Builder, MCP Status e Ações */}
        <Topbar
          project={activeProject}
          queueStatus={boardData?.queue}
          activeRunner={activeRunner}
          activeModel={activeModel}
          onOpenCliManager={() => setIsCliManagerOpen(true)}
          onOpenNewTaskModal={() => setIsNewTaskModalOpen(true)}
          onOpenMcpModal={() => setIsMcpModalOpen(true)}
          onRefresh={handleRefresh}
          isRefreshing={boardLoading}
          onToast={(text) => showToast({ text })}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        {/* Barra de Filtros Personalizados do Kanban */}
        {activeProject && (
          <BoardFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            selectedFeature={selectedFeature}
            onFeatureChange={setSelectedFeature}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            availableFeatures={availableFeatures}
            totalTasksCount={totalTasksCount}
            filteredTasksCount={filteredTasksCount}
            onResetFilters={handleResetFilters}
          />
        )}

        {/* Container de Feature Pipelines (visível se houver feature filtrada ou se houver pipelines executando no projeto) */}
        {activeProject && (
          <FeaturePipelinesContainer
            pipelines={projectPipelines.pipelines}
            boardTasks={allBoardTasks}
            selectedFeature={selectedFeature}
            onSelectFeature={(feat) => setSelectedFeature(feat)}
            onClearFilter={() => setSelectedFeature('all')}
            onStart={handlePipelineStart}
            onPause={handlePipelinePause}
            onResume={handlePipelineResume}
            busyFeature={projectPipelines.busyFeature}
            error={projectPipelines.error}
            onSelectTask={(task) => setSelectedTask(task)}
          />
        )}

        {/* Board Kanban de 4 Colunas */}
        <main className="flex-1 overflow-hidden flex flex-col">
          <Board
            boardData={filteredBoardData}
            onSelectTask={(task) => setSelectedTask(task)}
            onStartTask={(taskId) => startTask(taskId)}
            onCancelTask={(taskId) => cancelTask(taskId)}
            onSelectFeature={(feature) => setSelectedFeature(feature)}
          />
        </main>
      </div>

      {/* 3. Gaveta Lateral de Inspeção (720px) */}
      <InspectionDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdateStatus={async (taskId, status) => {
          await updateStatus(taskId, status);
          if (status === 'done') {
            showToast({
              text: 'Tarefa aprovada e concluída com sucesso.',
              actionLabel: 'Desfazer',
              onAction: async () => {
                await updateStatus(taskId, 'review');
              },
            });
          } else if (status === 'backlog') {
            showToast({
              text: 'Tarefa movida para A Fazer (Backlog).',
            });
          } else if (status === 'review') {
            showToast({
              text: 'Tarefa movida para Revisão & Decisão.',
            });
          }
        }}
        onStartTask={startTask}
        onCancelTask={cancelTask}
        onTaskUpdated={() => refreshBoard()}
      />

      {/* 4. Modais */}
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onSubmit={async (dto) => {
          await createProject(dto);
        }}
      />

      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        projectName={activeProject?.name}
        projectId={activeProject?.id}
        onSubmit={async (dto) => {
          await createTask(dto);
          await refreshProjects();
        }}
      />

      <CliManagerModal
        isOpen={isCliManagerOpen}
        onClose={() => setIsCliManagerOpen(false)}
        projectId={activeProject?.id}
        projectName={activeProject?.name}
        onSettingsChanged={(runner, model) => {
          setActiveRunner(runner);
          setActiveModel(model);
        }}
      />

      <McpToolsModal
        isOpen={isMcpModalOpen}
        onClose={() => setIsMcpModalOpen(false)}
        project={activeProject}
      />


      <HideProjectModal
        isOpen={projectToHide !== null}
        project={projectToHide}
        onClose={() => setProjectToHide(null)}
        onConfirm={handleConfirmHide}
      />

      <HiddenProjectsModal
        isOpen={isHiddenProjectsModalOpen}
        projects={hiddenProjects}
        onClose={() => setIsHiddenProjectsModalOpen(false)}
        onRestore={handleRestore}
        onRequestPermanentDelete={(project) => setProjectToDeletePermanent(project)}
      />

      <DeleteProjectPermanentModal
        isOpen={projectToDeletePermanent !== null}
        project={projectToDeletePermanent}
        onClose={() => setProjectToDeletePermanent(null)}
        onConfirm={handleConfirmPermanentDelete}
      />

      {/* Banners PWA — instalação, atualização do Service Worker e
          status do servidor local Fastify. */}
      <PWAInstallBanner />
      <PWAUpdateBanner />
      <ServerOfflineBanner />

      {/* Toast Flutuante com Suporte a Desfazer */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[100] flex items-center gap-3 px-4 py-3 bg-[#18181b] border border-[#3f3f46] shadow-2xl rounded-xl text-xs text-[#f4f4f5] animate-in fade-in slide-in-from-bottom-2 duration-150">
          <span>{toastMessage.text}</span>
          {toastMessage.actionLabel && toastMessage.onAction && (
            <button
              onClick={() => {
                toastMessage.onAction?.();
                setToastMessage(null);
              }}
              className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-medium border border-amber-500/40 transition-colors"
            >
              {toastMessage.actionLabel}
            </button>
          )}
          <button
            onClick={() => setToastMessage(null)}
            className="text-[#71717a] hover:text-[#f4f4f5] p-0.5 rounded transition-colors text-sm ml-1"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
