import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Sparkles, AlertTriangle } from 'lucide-react';
import type { ReportSource } from '../../types/index.js';

interface ReportViewerProps {
  reportMarkdown: string | null;
  reportSource?: ReportSource;
}

const SOURCE_BADGES: Record<
  NonNullable<ReportSource>,
  { label: string; tooltip: string; tone: string; icon: React.ComponentType<{ className?: string }> }
> = {
  worker: {
    label: 'entregue pelo worker',
    tooltip: 'O subagente persistiu report.md durante a execução.',
    tone: 'bg-emerald-950/70 text-emerald-300 border border-emerald-800',
    icon: FileText,
  },
  auto: {
    label: 'auto-salvaged',
    tooltip: 'Conteúdo extraído automaticamente do stream — o worker não persistiu report.md.',
    tone: 'bg-amber-950/70 text-amber-300 border border-amber-800',
    icon: Sparkles,
  },
  fallback: {
    label: 'fallback',
    tooltip: 'Worker não entregou relatório e a extração automática não encontrou conteúdo suficiente. Apenas metadados.',
    tone: 'bg-rose-950/70 text-rose-300 border border-rose-800',
    icon: AlertTriangle,
  },
};

export const ReportViewer: React.FC<ReportViewerProps> = ({ reportMarkdown, reportSource }) => {
  if (!reportMarkdown || reportMarkdown.trim().length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-[#71717a] p-8 border border-dashed border-[#27272a] rounded-lg">
        <FileText className="w-10 h-10 mb-2 stroke-[1.5] text-[#3f3f46]" />
        <p className="text-sm font-medium">Nenhum relatório (report.md) gerado ainda.</p>
        <p className="text-xs text-[#52525b] mt-1">O relatório técnico será preenchido automaticamente ao término da tarefa.</p>
      </div>
    );
  }

  const badge = reportSource ? SOURCE_BADGES[reportSource] : null;

  return (
    <div className="h-full overflow-y-auto p-6 bg-[#18181b] border border-[#27272a] rounded-lg text-sm text-[#f4f4f5] leading-relaxed select-text space-y-4">
      {badge && (
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-medium ${badge.tone} w-fit`}
          title={badge.tooltip}
        >
          <badge.icon className="w-3.5 h-3.5" />
          <span>{badge.label}</span>
        </div>
      )}
      <div className="prose prose-invert prose-zinc max-w-none text-xs">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-base font-bold text-[#f4f4f5] border-b border-[#27272a] pb-2 mb-3 mt-1">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-sm font-semibold text-emerald-400 mt-4 mb-2">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-xs font-semibold text-[#a1a1aa] mt-3 mb-1">
                {children}
              </h3>
            ),
            p: ({ children }) => <p className="mb-2 text-[#d4d4d8] leading-normal">{children}</p>,
            ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-1 text-[#d4d4d8]">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-1 text-[#d4d4d8]">{children}</ol>,
            li: ({ children }) => <li className="text-[#d4d4d8]">{children}</li>,
            code: ({ children, className }) => {
              const isInline = !className;
              if (isInline) {
                return (
                  <code className="px-1.5 py-0.5 rounded bg-[#27272a] text-emerald-300 font-mono text-[11px] border border-[#3f3f46]">
                    {children}
                  </code>
                );
              }
              return (
                <pre className="p-3 my-2 rounded-md bg-[#0d1117] border border-[#30363d] overflow-x-auto text-[11px] font-mono text-[#c9d1d9]">
                  <code>{children}</code>
                </pre>
              );
            },
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-emerald-500 pl-3 my-2 italic text-[#a1a1aa] bg-[#27272a]/40 py-1 rounded-r">
                {children}
              </blockquote>
            ),
          }}
        >
          {reportMarkdown}
        </ReactMarkdown>
      </div>
    </div>
  );
};
