import React, { useState } from 'react';
import { FileCode, GitCommit } from 'lucide-react';

interface TargetedDiffViewerProps {
  diffUnified?: string;
  diffStat?: string;
  affectedFiles?: string[];
}

export const TargetedDiffViewer: React.FC<TargetedDiffViewerProps> = ({
  diffUnified,
  diffStat,
  affectedFiles = [],
}) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  if (!diffUnified || diffUnified.trim().length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[#71717a] p-8 border border-dashed border-[#27272a] rounded-lg">
        <GitCommit className="w-10 h-10 mb-2 stroke-[1.5] text-[#3f3f46]" />
        <p className="text-sm font-medium">Nenhum diff detectado para esta tarefa.</p>
        <p className="text-xs text-[#52525b] mt-1">
          {affectedFiles.length > 0
            ? `Arquivos afetados: ${affectedFiles.join(', ')}`
            : 'Esta tarefa não modificou arquivos no repositório.'}
        </p>
      </div>
    );
  }

  // Divide o diff por arquivos (diff --git a/... b/...)
  const fileDiffs = diffUnified.split(/(?=diff --git )/g);

  // Renderiza as linhas de um diff com syntax highlighting cirúrgico
  const renderDiffLines = (diffBlock: string) => {
    const lines = diffBlock.split('\n');
    return lines.map((line, idx) => {
      let lineClass = 'text-[#c9d1d9]';
      let bgClass = 'hover:bg-[#21262d]/50';

      if (line.startsWith('+++') || line.startsWith('---')) {
        lineClass = 'text-[#8b949e] font-semibold';
        bgClass = 'bg-[#161b22]';
      } else if (line.startsWith('+')) {
        lineClass = 'text-emerald-300';
        bgClass = 'bg-emerald-950/40';
      } else if (line.startsWith('-')) {
        lineClass = 'text-rose-300';
        bgClass = 'bg-rose-950/40';
      } else if (line.startsWith('@@')) {
        lineClass = 'text-cyan-400 font-medium';
        bgClass = 'bg-[#1f242c]';
      }

      return (
        <div
          key={idx}
          className={`flex font-mono text-[11px] leading-5 px-3 select-text ${lineClass} ${bgClass}`}
        >
          <span className="w-6 shrink-0 select-none text-[#484f58] text-right pr-2">
            {line.startsWith('+') ? '+' : line.startsWith('-') ? '-' : ' '}
          </span>
          <span className="whitespace-pre-wrap break-all flex-1">{line}</span>
        </div>
      );
    });
  };

  return (
    <div className="h-full flex flex-col bg-[#18181b] border border-[#27272a] rounded-lg overflow-hidden">
      {/* Resumo do Stat */}
      {diffStat && (
        <div className="p-3 bg-[#161b22] border-b border-[#30363d] text-xs font-mono text-[#8b949e]">
          <div className="font-semibold text-[#c9d1d9] mb-1 flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5 text-emerald-400" />
            <span>Resumo de Alterações Cirúrgicas ({affectedFiles.length} arquivos)</span>
          </div>
          <pre className="text-[11px] whitespace-pre-wrap text-[#8b949e]">{diffStat}</pre>
        </div>
      )}

      {/* Seletor de Arquivos Modificados */}
      {affectedFiles.length > 1 && (
        <div className="px-3 py-2 bg-[#1c2128] border-b border-[#30363d] flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setSelectedFile(null)}
            className={`px-2 py-1 rounded text-[11px] font-mono whitespace-nowrap transition-colors ${
              selectedFile === null
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                : 'bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9]'
            }`}
          >
            Todos ({affectedFiles.length})
          </button>
          {affectedFiles.map((file) => (
            <button
              key={file}
              onClick={() => setSelectedFile(file)}
              className={`px-2 py-1 rounded text-[11px] font-mono whitespace-nowrap transition-colors ${
                selectedFile === file
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-[#21262d] text-[#8b949e] hover:text-[#c9d1d9]'
              }`}
            >
              {file.split('/').pop()}
            </button>
          ))}
        </div>
      )}

      {/* Visualizador de Diff */}
      <div className="flex-1 overflow-y-auto bg-[#0d1117] p-2 space-y-4">
        {fileDiffs
          .filter((block) => {
            if (!selectedFile) return true;
            return block.includes(selectedFile);
          })
          .map((block, idx) => (
            <div
              key={idx}
              className="rounded-md border border-[#30363d] overflow-hidden bg-[#0d1117]"
            >
              <div className="bg-[#161b22] px-3 py-1.5 border-b border-[#30363d] text-[11px] font-mono font-semibold text-[#58a6ff] truncate">
                {block.split('\n')[0] || `Arquivo ${idx + 1}`}
              </div>
              <div className="py-1">{renderDiffLines(block)}</div>
            </div>
          ))}
      </div>
    </div>
  );
};
