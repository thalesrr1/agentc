import React from 'react';
import { FeaturePipelineBar } from './FeaturePipelineBar.js';
import type { FeaturePipelineState, Task } from '../../types/index.js';

interface FeaturePipelinesContainerProps {
  /** Lista de todos os pipelines conhecidos do projeto */
  pipelines: FeaturePipelineState[];
  /** Tarefas do Kanban para conciliação em tempo real de contadores e status */
  boardTasks?: Task[];
  /** Feature atualmente selecionada no filtro do Kanban ('all' se nenhuma) */
  selectedFeature: string;
  /** Disparado ao clicar na feature para filtrar o Kanban */
  onSelectFeature: (feature: string) => void;
  /** Limpa o filtro de feature voltando para 'all' */
  onClearFilter: () => void;
  /** Ações sobre o pipeline */
  onStart: (feature: string) => void;
  onPause: (feature: string) => void;
  onResume: (feature: string) => void;
  /** Feature ocupada no momento (se houver) */
  busyFeature: string | null;
  /** Erro global de pipeline (se houver) */
  error: string | null;
}

export const FeaturePipelinesContainer: React.FC<FeaturePipelinesContainerProps> = ({
  pipelines,
  boardTasks,
  selectedFeature,
  onSelectFeature,
  onClearFilter,
  onStart,
  onPause,
  onResume,
  busyFeature,
  error,
}) => {
  const isFeatureFiltered = selectedFeature !== 'all';

  const reconcileState = (
    rawState: FeaturePipelineState
  ): { state: FeaturePipelineState; currentRunningTask: Task | null } => {
    if (!boardTasks || boardTasks.length === 0) {
      return { state: rawState, currentRunningTask: null };
    }

    const featLower = rawState.feature.trim().toLowerCase();
    const tasks = boardTasks.filter(
      (t) => t.feature && t.feature.trim().toLowerCase() === featLower
    );

    if (tasks.length === 0) {
      return { state: rawState, currentRunningTask: null };
    }

    const doneTasks = tasks.filter((t) => t.status === 'done');
    const runningTask = tasks.find((t) => t.status === 'running') ?? null;
    const backlogTasks = tasks.filter((t) => t.status === 'backlog');
    const errorTasks = tasks.filter((t) => t.status === 'error');

    // Se há tarefa running no board, o pipeline está running!
    let status = rawState.status;
    if (runningTask) {
      status = rawState.status === 'paused' ? 'paused' : 'running';
    } else if (tasks.length > 0 && doneTasks.length === tasks.length) {
      status = 'completed';
    } else if (errorTasks.length > 0 && (rawState.status === 'failed' || rawState.status === 'idle')) {
      status = 'failed';
    } else if (!runningTask && (rawState.pause_requested || rawState.status === 'paused')) {
      status = 'paused';
    }

    const completedCount = doneTasks.length;
    const totalCount = tasks.length;

    const reconciled: FeaturePipelineState = {
      ...rawState,
      status,
      total_tasks: totalCount,
      completed_tasks: completedCount,
      current_task_id: runningTask?.id ?? rawState.current_task_id,
      completed_task_ids: doneTasks.map((t) => t.id),
      pending_task_ids: backlogTasks.map((t) => t.id),
    };

    return { state: reconciled, currentRunningTask: runningTask };
  };

  // Identifica quais pipelines devem ser exibidos:
  // 1. Se uma feature está filtrada, ela SEMPRE aparece no topo.
  // 2. Além disso, quaisquer outros pipelines que estejam rodando (running), pausados (paused) ou com falha (failed)
  //    são exibidos abaixo para acompanhamento contínuo em segundo plano.
  const pipelinesToRender: Array<{ feature: string; state: FeaturePipelineState; isSelected: boolean }> = [];

  if (isFeatureFiltered) {
    const primary = pipelines.find(
      (p) => p.feature.toLowerCase() === selectedFeature.toLowerCase()
    );

    // Se o backend ainda não retornou o state para a feature selecionada, monta um placeholder sintético
    const primaryState: FeaturePipelineState = primary || {
      project_id: '',
      feature: selectedFeature,
      status: 'idle',
      current_task_id: null,
      total_tasks: 0,
      completed_tasks: 0,
      failed_task_id: null,
      halt_reason: null,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
      pending_task_ids: [],
      completed_task_ids: [],
      last_outcome: null,
    };

    pipelinesToRender.push({
      feature: selectedFeature,
      state: primaryState,
      isSelected: true,
    });

    // Outros pipelines ativos no mesmo projeto
    for (const p of pipelines) {
      if (
        p.feature.toLowerCase() !== selectedFeature.toLowerCase() &&
        (p.status === 'running' || p.status === 'paused' || p.status === 'failed')
      ) {
        pipelinesToRender.push({
          feature: p.feature,
          state: p,
          isSelected: false,
        });
      }
    }
  } else {
    // Nenhuma feature filtrada (todas): exibe todos os pipelines que estão executando, pausados ou com erro
    for (const p of pipelines) {
      if (p.status === 'running' || p.status === 'paused' || p.status === 'failed') {
        pipelinesToRender.push({
          feature: p.feature,
          state: p,
          isSelected: false,
        });
      }
    }

    // Garante que features com tarefas executando no board apareçam mesmo que o backend ainda não as tenha catalogado
    if (boardTasks) {
      const runningTasksWithFeature = boardTasks.filter(
        (t) => t.status === 'running' && t.feature && t.feature.trim().length > 0
      );
      for (const rTask of runningTasksWithFeature) {
        const feat = rTask.feature!.trim();
        const alreadyIncluded = pipelinesToRender.some(
          (item) => item.feature.toLowerCase() === feat.toLowerCase()
        );
        if (!alreadyIncluded) {
          const synthetic: FeaturePipelineState = {
            project_id: rTask.project_id,
            feature: feat,
            status: 'running',
            current_task_id: rTask.id,
            total_tasks: 0,
            completed_tasks: 0,
            failed_task_id: null,
            halt_reason: null,
            started_at: rTask.started_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: null,
            pending_task_ids: [],
            completed_task_ids: [],
            last_outcome: null,
          };
          pipelinesToRender.push({
            feature: feat,
            state: synthetic,
            isSelected: false,
          });
        }
      }
    }
  }

  if (pipelinesToRender.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col border-b border-[#27272a] divide-y divide-[#27272a]/60 shadow-xs">
      {pipelinesToRender.map(({ feature, state, isSelected }) => {
        const { state: reconciledState, currentRunningTask } = reconcileState(state);
        return (
          <FeaturePipelineBar
            key={feature}
            feature={feature}
            state={reconciledState}
            currentRunningTask={currentRunningTask}
            busy={busyFeature === feature}
            onStart={() => onStart(feature)}
            onPause={() => onPause(feature)}
            onResume={() => onResume(feature)}
            error={busyFeature === feature ? error : null}
            isSelected={isSelected}
            onSelectFeature={onSelectFeature}
            onClearFilter={onClearFilter}
          />
        );
      })}
    </div>
  );
};
