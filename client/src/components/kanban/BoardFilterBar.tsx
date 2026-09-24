import React from 'react';
import { Search, X, Tag, Calendar, Filter, RotateCcw } from 'lucide-react';

export type DateFilterOption = 'all' | 'today' | '3days' | '7days';

interface BoardFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedFeature: string;
  onFeatureChange: (feature: string) => void;
  selectedDate: DateFilterOption;
  onDateChange: (date: DateFilterOption) => void;
  availableFeatures: Array<{ name: string; count: number }>;
  totalTasksCount: number;
  filteredTasksCount: number;
  onResetFilters: () => void;
}

export const BoardFilterBar: React.FC<BoardFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  selectedFeature,
  onFeatureChange,
  selectedDate,
  onDateChange,
  availableFeatures,
  totalTasksCount,
  filteredTasksCount,
  onResetFilters,
}) => {
  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedFeature !== 'all' ||
    selectedDate !== 'all';

  return (
    <div className="h-11 bg-[#121214] border-b border-[#27272a] px-6 flex items-center justify-between gap-3 text-xs select-none">
      {/* Lado Esquerdo: Barra de Busca e Filtros Dropdowns */}
      <div className="flex items-center gap-2.5 flex-1 max-w-3xl min-w-0">
        {/* Campo de Busca Textual */}
        <div className="relative flex-1 max-w-xs min-w-[180px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#71717a]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por nome ou run ID..."
            className="w-full pl-8 pr-7 py-1 rounded-md bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] focus:border-emerald-500 focus:outline-none text-[#f4f4f5] text-[11px] placeholder:text-[#71717a] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              title="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#71717a] hover:text-[#f4f4f5]"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Dropdown de Filtro por Feature */}
        <div className="relative flex items-center">
          <Tag className="w-3 h-3 absolute left-2.5 pointer-events-none text-purple-400" />
          <select
            value={selectedFeature}
            onChange={(e) => onFeatureChange(e.target.value)}
            className="pl-7 pr-7 py-1 rounded-md bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] focus:border-purple-500 focus:outline-none text-[#f4f4f5] text-[11px] font-mono cursor-pointer transition-colors appearance-none"
          >
            <option value="all">Todas as Features ({totalTasksCount})</option>
            {availableFeatures.map((feat) => (
              <option key={feat.name} value={feat.name}>
                #{feat.name} ({feat.count})
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#71717a]">
            ▾
          </div>
        </div>

        {/* Dropdown de Filtro por Data */}
        <div className="relative flex items-center">
          <Calendar className="w-3 h-3 absolute left-2.5 pointer-events-none text-emerald-400" />
          <select
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value as DateFilterOption)}
            className="pl-7 pr-7 py-1 rounded-md bg-[#18181b] border border-[#27272a] hover:border-[#3f3f46] focus:border-emerald-500 focus:outline-none text-[#f4f4f5] text-[11px] cursor-pointer transition-colors appearance-none"
          >
            <option value="all">Qualquer data</option>
            <option value="today">Hoje</option>
            <option value="3days">Últimos 3 dias</option>
            <option value="7days">Últimos 7 dias</option>
          </select>
          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#71717a]">
            ▾
          </div>
        </div>

        {/* Botão de Limpar Filtros quando ativo */}
        {hasActiveFilters && (
          <button
            onClick={onResetFilters}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-amber-400 hover:text-amber-300 bg-amber-950/40 hover:bg-amber-950/70 border border-amber-800/60 transition-colors"
            title="Resetar todos os filtros"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Limpar Filtros</span>
          </button>
        )}
      </div>

      {/* Lado Direito: Contador de Tarefas Visíveis vs Total */}
      <div className="flex items-center gap-2 text-[11px] text-[#71717a] shrink-0 font-mono">
        <Filter className="w-3 h-3 text-[#52525b]" />
        <span>
          {hasActiveFilters ? (
            <span className="text-emerald-400 font-medium">
              {filteredTasksCount} de {totalTasksCount} tarefas
            </span>
          ) : (
            <span>{totalTasksCount} tarefas</span>
          )}
        </span>
      </div>
    </div>
  );
};
