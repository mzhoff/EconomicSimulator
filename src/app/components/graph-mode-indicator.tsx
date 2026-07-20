import { memo } from 'react';
import type { GraphFocusState } from './metric-engine';

interface GraphModeIndicatorProps {
  focus: GraphFocusState;
  selectedCount: number;
}

const modeCopy = {
  structure: {
    eyebrow: 'Структура',
    title: 'Путь к North Star',
    accent: 'bg-slate-500',
  },
  focus: {
    eyebrow: 'Фокус',
    title: 'Что влияет и что изменится',
    accent: 'bg-sky-600',
  },
  multi: {
    eyebrow: 'Связь',
    title: 'Путь между выбранными',
    accent: 'bg-teal-700',
  },
  analysis: {
    eyebrow: 'Анализ',
    title: 'Impact до North Star',
    accent: 'bg-emerald-600',
  },
} as const;

function LineSample({
  color,
  dashed = false,
}: {
  color: string;
  dashed?: boolean;
}) {
  return (
    <svg aria-hidden="true" width="28" height="8" viewBox="0 0 28 8" className="shrink-0 overflow-visible">
      <line
        x1="1"
        y1="4"
        x2="23"
        y2="4"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={dashed ? '5 3' : undefined}
        strokeLinecap="round"
      />
      <path d="M 21 1.5 L 27 4 L 21 6.5 Z" fill={color} />
    </svg>
  );
}

export const GraphModeIndicator = memo(function GraphModeIndicator({
  focus,
  selectedCount,
}: GraphModeIndicatorProps) {
  const copy = modeCopy[focus.mode];
  const noPath = focus.mode === 'multi' && !focus.hasCalculationPath;

  return (
    <div
      data-canvas-interactive="true"
      data-graph-mode={focus.mode}
      className="pointer-events-none absolute top-[0.75rem] left-1/2 z-30 -translate-x-1/2 rounded-[var(--radius-xl)] border border-border/80 bg-card/95 px-[0.625rem] py-[0.4375rem] shadow-md backdrop-blur-sm"
    >
      <div className="flex items-center gap-[0.5rem] whitespace-nowrap">
        <span className={`size-[0.4375rem] rounded-full ${noPath ? 'bg-amber-500' : copy.accent}`} />
        <span className="text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground" style={{ fontWeight: 700 }}>
          {copy.eyebrow}
        </span>
        <span className="text-[0.6875rem] text-foreground" style={{ fontWeight: 600 }}>
          {noPath ? `Calculation-путь не найден · ${selectedCount} метрики` : copy.title}
        </span>

        <span className="hidden h-[1rem] w-px bg-border lg:block" />
        <span className="hidden items-center gap-[0.25rem] text-[0.5625rem] text-muted-foreground lg:flex">
          <LineSample color="#64748b" />
          Calculation
        </span>
        <span className="hidden items-center gap-[0.25rem] text-[0.5625rem] text-muted-foreground lg:flex">
          <LineSample color="#8b5cf6" dashed />
          Influence
        </span>
        {focus.mode === 'focus' ? (
          <>
            <span className="hidden items-center gap-[0.25rem] text-[0.5625rem] text-sky-700 xl:flex">
              <LineSample color="#0284c7" />
              Upstream
            </span>
            <span className="hidden items-center gap-[0.25rem] text-[0.5625rem] text-violet-700 xl:flex">
              <LineSample color="#7c3aed" />
              Downstream
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
});
