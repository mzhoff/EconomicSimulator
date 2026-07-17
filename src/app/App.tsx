import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RotateCcw,
  Upload,
  Zap,
} from 'lucide-react';
import {
  autoLayout,
  computeImpact,
  computeTokBeriThresholds,
  downstreamEdgeKeys,
  getCalculationRelations,
  unitFromPreset,
  type MetricDef,
  type ModelState,
  type Shock,
} from './components/metric-engine';
import { evaluateModel } from '../core/evaluator';
import {
  backupBeforeImport,
  createWorkspaceDocument,
  importWorkspace,
  loadWorkspace,
  saveWorkspace,
  serializeWorkspace,
} from '../core/storage';
import { MetricCard } from './components/metric-card';
import { CanvasEdges } from './components/canvas-edges';
import { InputPanel } from './components/input-panel';
import { InspectorPanel } from './components/inspector-panel';
import { BottomToolbar } from './components/bottom-toolbar';
import { InfiniteCanvas, useCanvasControls, type CanvasPoint } from './components/infinite-canvas';
import { MetricCatalogDialog, type CustomMetricDraft } from './components/metric-catalog-dialog';

const MIN_CONTENT_WIDTH = 2700;
const MIN_CONTENT_HEIGHT = 2250;
const CARD_WIDTH = 272;
const CARD_HEIGHT = 112;
const HISTORY_LIMIT = 50;

interface HistoryState {
  past: ModelState[];
  present: ModelState;
  future: ModelState[];
}

interface SelectionRect {
  start: CanvasPoint;
  end: CanvasPoint;
}

interface DragState {
  startX: number;
  startY: number;
  originalPositions: Record<string, { x: number; y: number }>;
  startModel: ModelState;
  moved: boolean;
}

interface ContextMenuState {
  id: string;
  x: number;
  y: number;
}

function pushPast(past: ModelState[], model: ModelState): ModelState[] {
  return [...past, model].slice(-HISTORY_LIMIT);
}

export default function App() {
  const [loaded] = useState(() => loadWorkspace());
  const [history, setHistory] = useState<HistoryState>(() => ({
    past: [],
    present: loaded.value.model,
    future: [],
  }));
  const model = history.present;
  const [scenarioId, setScenarioId] = useState(loaded.value.activeScenarioId);
  const [inputOverridesByScenario, setInputOverridesByScenario] = useState(loaded.value.inputOverridesByScenario);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => [loaded.value.model.activeNorthStarId]);
  const [impactActive, setImpactActive] = useState(false);
  const [shock, setShock] = useState<Shock>({ kind: 'relative', amount: 0.1 });
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [notice, setNotice] = useState<string | null>(loaded.warning ?? null);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');

  const { transform, setTransform, zoomIn, zoomOut, fitToView } = useCanvasControls(loaded.value.viewport);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const selectionRef = useRef<{ start: CanvasPoint; base: Set<string>; moved: boolean } | null>(null);
  const didInitialFitRef = useRef(false);

  const currentOverrides = useMemo(
    () => inputOverridesByScenario[scenarioId] ?? {},
    [inputOverridesByScenario, scenarioId],
  );
  const evaluation = useMemo(
    () => evaluateModel(model, scenarioId, currentOverrides),
    [currentOverrides, model, scenarioId],
  );
  const baselineEvaluation = useMemo(
    () => evaluateModel(model, 'base', inputOverridesByScenario.base ?? {}),
    [inputOverridesByScenario.base, model],
  );
  const impact = useMemo(
    () => computeImpact(
      selectedIds[selectedIds.length - 1] ?? '',
      model,
      scenarioId,
      currentOverrides,
      shock,
    ),
    [currentOverrides, model, scenarioId, selectedIds, shock],
  );
  const thresholds = useMemo(
    () => computeTokBeriThresholds(model, scenarioId, currentOverrides),
    [currentOverrides, model, scenarioId],
  );
  const calculationRelations = useMemo(() => getCalculationRelations(model), [model]);
  const allEdges = useMemo(
    () => [...calculationRelations, ...model.influenceRelations],
    [calculationRelations, model.influenceRelations],
  );
  const highlightedEdges = useMemo(
    () => impactActive && impact ? downstreamEdgeKeys(model, impact.inputId) : new Set<string>(),
    [impact, impactActive, model],
  );
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const primarySelectedId = selectedIds[selectedIds.length - 1] ?? model.activeNorthStarId;
  const allCollapsed = !leftOpen && !rightOpen;
  const overriddenIds = useMemo(() => new Set(Object.keys(currentOverrides)), [currentOverrides]);
  const contentSize = useMemo(() => {
    const positions = Object.values(model.metrics).map((metric) => metric.position);
    return {
      width: Math.max(MIN_CONTENT_WIDTH, ...positions.map((position) => position.x + CARD_WIDTH + 120)),
      height: Math.max(MIN_CONTENT_HEIGHT, ...positions.map((position) => position.y + CARD_HEIGHT + 120)),
    };
  }, [model.metrics]);

  const commitModel = useCallback((update: (current: ModelState) => ModelState) => {
    setHistory((current) => {
      const next = update(current.present);
      if (next === current.present) return current;
      return {
        past: pushPast(current.past, current.present),
        present: next,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past[current.past.length - 1];
      if (!previous) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future].slice(0, HISTORY_LIMIT),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) return current;
      return {
        past: pushPast(current.past, current.present),
        present: next,
        future: current.future.slice(1),
      };
    });
  }, []);

  const handleFitToView = useCallback(() => {
    const element = canvasAreaRef.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    fitToView(width, height, contentSize.width, contentSize.height);
  }, [contentSize.height, contentSize.width, fitToView]);

  useEffect(() => {
    if (didInitialFitRef.current || loaded.value.viewport.scale !== 1 || loaded.value.viewport.x !== 0 || loaded.value.viewport.y !== 0) return;
    didInitialFitRef.current = true;
    const frame = window.requestAnimationFrame(handleFitToView);
    return () => window.cancelAnimationFrame(frame);
  }, [handleFitToView, loaded.value.viewport.scale, loaded.value.viewport.x, loaded.value.viewport.y]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const workspace = createWorkspaceDocument(model, {
        activeScenarioId: scenarioId,
        inputOverridesByScenario,
        viewport: transform,
      });
      const saved = saveWorkspace(workspace);
      setSaveState(saved.value ? 'saved' : 'error');
      if (saved.warning) setNotice(saved.warning);
    }, 350);
    setSaveState('saving');
    return () => window.clearTimeout(timer);
  }, [
    inputOverridesByScenario,
    model,
    scenarioId,
    transform.scale,
    transform.x,
    transform.y,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, undo]);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [contextMenu]);

  const selectMetric = useCallback((id: string, additive = false) => {
    setSelectedIds((current) => {
      if (!additive) return [id];
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  }, []);

  const handleChangeInput = useCallback((id: string, rawValue: number) => {
    if (!Number.isFinite(rawValue)) return;
    const metric = model.metrics[id];
    const value = metric?.inputConfig?.integer ? Math.round(rawValue) : rawValue;
    setInputOverridesByScenario((current) => ({
      ...current,
      [scenarioId]: {
        ...(current[scenarioId] ?? {}),
        [id]: value,
      },
    }));
  }, [model.metrics, scenarioId]);

  const handleResetInput = useCallback((id: string) => {
    setInputOverridesByScenario((current) => {
      const scenarioOverrides = { ...(current[scenarioId] ?? {}) };
      delete scenarioOverrides[id];
      return { ...current, [scenarioId]: scenarioOverrides };
    });
  }, [scenarioId]);

  const handleResetScenario = useCallback(() => {
    setInputOverridesByScenario((current) => ({ ...current, [scenarioId]: {} }));
  }, [scenarioId]);

  const handleToggleAll = useCallback(() => {
    if (allCollapsed) {
      setLeftOpen(true);
      setRightOpen(true);
    } else {
      setLeftOpen(false);
      setRightOpen(false);
    }
  }, [allCollapsed]);

  const handleStartDrag = useCallback((id: string, event: React.PointerEvent) => {
    const ids = selectedSet.has(id) ? selectedIds : [id];
    if (!selectedSet.has(id)) setSelectedIds([id]);
    const originalPositions = Object.fromEntries(
      ids.map((metricId) => [metricId, { ...model.metrics[metricId].position }]),
    );
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originalPositions,
      startModel: model,
      moved: false,
    };

    const handleMove = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaX = (moveEvent.clientX - drag.startX) / transform.scale;
      const deltaY = (moveEvent.clientY - drag.startY) / transform.scale;
      drag.moved = drag.moved || Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5;
      setHistory((current) => {
        const metrics = { ...current.present.metrics };
        for (const [metricId, origin] of Object.entries(drag.originalPositions)) {
          if (!metrics[metricId]) continue;
          metrics[metricId] = {
            ...metrics[metricId],
            position: { x: origin.x + deltaX, y: origin.y + deltaY },
          };
        }
        return { ...current, present: { ...current.present, metrics } };
      });
    };

    const handleUp = () => {
      const drag = dragRef.current;
      if (drag?.moved) {
        setHistory((current) => ({
          past: pushPast(current.past, drag.startModel),
          present: current.present,
          future: [],
        }));
      }
      dragRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [model, selectedIds, selectedSet, transform.scale]);

  const handleDeleteMetric = useCallback((id: string) => {
    if (id === model.activeNorthStarId) {
      setNotice('Сначала выберите другую North Star, затем удаляйте метрику.');
      return;
    }
    const dependents = calculationRelations.filter((relation) => relation.from === id);
    if (dependents.length > 0) {
      setNotice(`Нельзя удалить «${model.metrics[id]?.name}»: от неё зависят расчётные формулы.`);
      return;
    }
    commitModel((current) => {
      if (!current.metrics[id]) return current;
      const metrics = { ...current.metrics };
      delete metrics[id];
      const scenarios = Object.fromEntries(
        Object.entries(current.scenarios).map(([scenarioKey, scenario]) => {
          const overrides = { ...scenario.overrides };
          delete overrides[id];
          return [scenarioKey, { ...scenario, overrides }];
        }),
      );
      return {
        ...current,
        metrics,
        scenarios,
        influenceRelations: current.influenceRelations.filter((relation) => relation.from !== id && relation.to !== id),
      };
    });
    setSelectedIds((current) => current.filter((metricId) => metricId !== id));
    setContextMenu(null);
  }, [calculationRelations, commitModel, model.activeNorthStarId, model.metrics]);

  const handleAddCustom = useCallback((draft: CustomMetricDraft) => {
    const baseId = draft.name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '_').replace(/^_|_$/g, '') || 'custom_metric';
    let id = baseId;
    let suffix = 2;
    while (model.metrics[id]) {
      id = `${baseId}_${suffix}`;
      suffix += 1;
    }
    const positions = Object.values(model.metrics).map((metric) => metric.position);
    const maxX = Math.max(...positions.map((position) => position.x), 0);
    const unit = unitFromPreset(draft.unitPreset);
    const customMetric: MetricDef = {
      id,
      definitionId: `custom.${id}`,
      name: draft.name,
      description: draft.description || 'Пользовательская метрика.',
      behavior: draft.behavior,
      unit,
      grain: draft.behavior === 'event'
        ? { entity: 'event', time: 'timestamp' }
        : { entity: 'station', time: 'month' },
      valueSource: draft.behavior === 'event' ? 'observed' : 'input',
      knowledgeStatus: draft.behavior === 'event' ? 'fact' : 'assumption',
      kind: draft.behavior === 'event' ? 'observed' : 'assumption',
      domain: draft.domain,
      role: draft.role,
      value: draft.behavior === 'event' ? null : draft.value,
      provenance: {
        source: 'Создано пользователем в EconomicSimulator',
        version: new Date().toISOString().slice(0, 10),
        confidence: 'medium',
      },
      validationStatus: 'valid',
      validationMessages: [],
      position: { x: maxX + 360, y: 100 },
      inputConfig: draft.behavior === 'event'
        ? undefined
        : { min: Math.min(0, draft.value), max: Math.max(Math.abs(draft.value) * 3, 100), step: Math.max(Math.abs(draft.value) / 100, 0.01) },
    };
    commitModel((current) => ({
      ...current,
      metrics: { ...current.metrics, [id]: customMetric },
    }));
    setSelectedIds([id]);
  }, [commitModel, model.metrics]);

  const handleSetNorthStar = useCallback((id: string) => {
    commitModel((current) => {
      if (!current.metrics[id] || current.activeNorthStarId === id) return current;
      const metrics = { ...current.metrics };
      const previous = metrics[current.activeNorthStarId];
      if (previous) metrics[previous.id] = { ...previous, role: 'output' };
      metrics[id] = { ...metrics[id], role: 'north_star' };
      return { ...current, metrics, activeNorthStarId: id };
    });
    setSelectedIds([id]);
  }, [commitModel]);

  const handleAutoLayout = useCallback(() => {
    commitModel((current) => {
      const positions = autoLayout(current);
      const metrics = Object.fromEntries(
        Object.entries(current.metrics).map(([id, metric]) => [
          id,
          { ...metric, position: positions[id] ?? metric.position },
        ]),
      );
      return { ...current, metrics };
    });
    window.setTimeout(handleFitToView, 60);
  }, [commitModel, handleFitToView]);

  const handleSelectionStart = useCallback((point: CanvasPoint, event: React.PointerEvent<HTMLDivElement>) => {
    const base = event.shiftKey ? new Set(selectedIds) : new Set<string>();
    selectionRef.current = { start: point, base, moved: false };
    setSelectionRect({ start: point, end: point });
    if (!event.shiftKey) setSelectedIds([]);
    setContextMenu(null);
  }, [selectedIds]);

  const handleSelectionMove = useCallback((point: CanvasPoint) => {
    const state = selectionRef.current;
    if (!state) return;
    const left = Math.min(state.start.x, point.x);
    const right = Math.max(state.start.x, point.x);
    const top = Math.min(state.start.y, point.y);
    const bottom = Math.max(state.start.y, point.y);
    state.moved = state.moved || Math.abs(point.x - state.start.x) > 3 || Math.abs(point.y - state.start.y) > 3;
    const selected = new Set(state.base);
    if (state.moved) {
      for (const metric of Object.values(model.metrics)) {
        const intersects = metric.position.x < right
          && metric.position.x + CARD_WIDTH > left
          && metric.position.y < bottom
          && metric.position.y + CARD_HEIGHT > top;
        if (intersects) selected.add(metric.id);
      }
    }
    setSelectedIds([...selected]);
    setSelectionRect({ start: state.start, end: point });
  }, [model.metrics]);

  const handleSelectionEnd = useCallback(() => {
    selectionRef.current = null;
    setSelectionRect(null);
  }, []);

  const handleExport = useCallback(() => {
    const workspace = createWorkspaceDocument(model, {
      activeScenarioId: scenarioId,
      inputOverridesByScenario,
      viewport: transform,
    });
    const blob = new Blob([serializeWorkspace(workspace)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tokberi-economic-model-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('JSON export создан. В нём сохранены формулы, сценарии, позиции и viewport.');
  }, [inputOverridesByScenario, model, scenarioId, transform]);

  const handleImportFile = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const imported = importWorkspace(await file.text());
    if (!imported.ok) {
      setNotice(`Импорт отменён: ${imported.issues[0]?.message ?? 'невалидная модель'}. Текущая модель не изменена.`);
      return;
    }
    backupBeforeImport();
    const workspace = imported.workspace;
    setHistory({ past: [], present: workspace.model, future: [] });
    setScenarioId(workspace.activeScenarioId);
    setInputOverridesByScenario(workspace.inputOverridesByScenario);
    setTransform(workspace.viewport);
    setSelectedIds([workspace.model.activeNorthStarId]);
    setNotice('Модель импортирована и прошла проверку схемы, единиц и DAG.');
  }, [setTransform]);

  const selectionStyle = selectionRect
    ? {
        left: Math.min(selectionRect.start.x, selectionRect.end.x),
        top: Math.min(selectionRect.start.y, selectionRect.end.y),
        width: Math.abs(selectionRect.end.x - selectionRect.start.x),
        height: Math.abs(selectionRect.end.y - selectionRect.start.y),
      }
    : null;

  const scenarioOrder = ['weak', 'base', 'good', 'hotspot'].filter((id) => model.scenarios[id]);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>
      <header className="relative z-40 flex items-center justify-between gap-[0.75rem] border-b border-border bg-card px-[1.25rem] py-[0.5rem]" style={{ minHeight: '3.25rem' }}>
        <div className="flex items-center gap-[0.75rem] min-w-0">
          <div className="flex items-center gap-[0.375rem] shrink-0">
            <Zap className="size-[1rem] text-foreground" />
            <span className="text-[0.875rem] text-foreground" style={{ fontWeight: 600 }}>Metric Graph OS</span>
          </div>
          <span className="text-[0.6875rem] text-muted-foreground truncate hidden lg:block">TokBeri · экономика станции</span>
          <span className="text-[0.5625rem] bg-secondary text-muted-foreground rounded-full px-[0.5rem] py-[0.0625rem] hidden xl:block" style={{ fontWeight: 500 }}>
            {Object.keys(model.metrics).length} metrics · {calculationRelations.length} calc edges
          </span>
        </div>

        <div className="flex items-center gap-[0.375rem] shrink-0">
          <div className="flex items-center rounded-[var(--radius-lg)] border border-border bg-background p-[0.125rem]">
            {scenarioOrder.map((id) => (
              <button
                key={id}
                onClick={() => setScenarioId(id)}
                title={model.scenarios[id].description}
                className={`rounded-[var(--radius-md)] px-[0.625rem] py-[0.25rem] text-[0.6875rem] transition-all cursor-pointer ${
                  scenarioId === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                style={{ fontWeight: 500 }}
              >
                {model.scenarios[id].label}
              </button>
            ))}
          </div>

          <button
            onClick={handleResetScenario}
            title="Сбросить ручные изменения текущего сценария"
            className="flex items-center justify-center size-[1.875rem] rounded-[var(--radius-lg)] border border-border text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <RotateCcw className="size-[0.75rem]" />
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="header-action"
            title="Импортировать проверенный JSON"
          >
            <Upload className="size-[0.75rem]" />
            <span className="hidden xl:inline">Import</span>
          </button>
          <button onClick={handleExport} className="header-action" title="Экспортировать переносимый JSON">
            <Download className="size-[0.75rem]" />
            <span className="hidden xl:inline">Export</span>
          </button>
          <div className={`flex items-center gap-[0.25rem] text-[0.5625rem] ${saveState === 'error' ? 'text-red-600' : 'text-muted-foreground'}`}>
            {saveState === 'error' ? <AlertTriangle className="size-[0.625rem]" /> : <CheckCircle2 className="size-[0.625rem]" />}
            <span className="hidden lg:inline">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved locally' : 'Save error'}</span>
          </div>
          <input ref={importInputRef} type="file" accept="application/json,.json" hidden onChange={handleImportFile} />
        </div>
      </header>

      <div ref={canvasAreaRef} className="relative flex-1 overflow-hidden">
        <InfiniteCanvas
          contentWidth={contentSize.width}
          contentHeight={contentSize.height}
          transform={transform}
          setTransform={setTransform}
          onBackgroundPointerDown={handleSelectionStart}
          onBackgroundPointerMove={handleSelectionMove}
          onBackgroundPointerUp={handleSelectionEnd}
        >
          <CanvasEdges
            edges={allEdges}
            metrics={evaluation.metrics}
            highlightedEdges={highlightedEdges}
            impactActive={impactActive}
          />
          {Object.values(evaluation.metrics).map((metric) => (
            <MetricCard
              key={metric.id}
              metric={metric}
              selected={selectedSet.has(metric.id)}
              onSelect={selectMetric}
              onDelete={handleDeleteMetric}
              onStartDrag={handleStartDrag}
              onContextMenu={(id, event) => {
                setSelectedIds([id]);
                setContextMenu({ id, x: event.clientX, y: event.clientY });
              }}
              delta={impactActive && impact?.deltas[metric.id] !== undefined && metric.id !== impact.inputId
                ? impact.deltas[metric.id]
                : undefined}
              impactActive={impactActive}
            />
          ))}
          {selectionStyle && (
            <div
              className="absolute z-50 pointer-events-none rounded-[var(--radius-sm)] border border-primary bg-primary/10"
              style={selectionStyle}
            />
          )}
        </InfiniteCanvas>

        <InputPanel
          metrics={evaluation.metrics}
          overriddenIds={overriddenIds}
          selectedId={primarySelectedId}
          onSelect={(id) => selectMetric(id)}
          onChangeInput={handleChangeInput}
          onReset={handleResetInput}
          collapsed={!leftOpen}
          onToggle={() => setLeftOpen((open) => !open)}
        />

        <InspectorPanel
          metrics={evaluation.metrics}
          baselineMetrics={baselineEvaluation.metrics}
          model={model}
          selectedId={primarySelectedId}
          scenarioId={scenarioId}
          thresholds={thresholds}
          impact={impact}
          shock={shock}
          collapsed={!rightOpen}
          onToggle={() => setRightOpen((open) => !open)}
          onSelect={(id) => selectMetric(id)}
          onSetNorthStar={handleSetNorthStar}
          onChangeShock={setShock}
        />

        <BottomToolbar
          allCollapsed={allCollapsed}
          onToggleAll={handleToggleAll}
          impactActive={impactActive}
          onToggleImpact={() => setImpactActive((active) => !active)}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFitToView={handleFitToView}
          onAutoLayout={handleAutoLayout}
          onAddMetric={() => setCatalogOpen(true)}
          onUndo={undo}
          onRedo={redo}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          scale={transform.scale}
        />

        {notice && (
          <button
            data-canvas-interactive="true"
            onClick={() => setNotice(null)}
            className="absolute top-[0.75rem] left-1/2 -translate-x-1/2 z-40 max-w-[34rem] rounded-[var(--radius-lg)] border border-border bg-card px-[0.75rem] py-[0.5rem] text-left text-[0.6875rem] text-foreground shadow-lg cursor-pointer"
            title="Закрыть"
          >
            {notice}
          </button>
        )}
      </div>

      {contextMenu && (
        <div
          data-canvas-interactive="true"
          className="fixed z-[60] w-[12rem] rounded-[var(--radius-lg)] border border-border bg-card p-[0.25rem] shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              handleSetNorthStar(contextMenu.id);
              setContextMenu(null);
            }}
            className="context-action"
          >
            Сделать North Star
          </button>
          <button onClick={() => handleDeleteMetric(contextMenu.id)} className="context-action text-red-600">
            Удалить метрику
          </button>
        </div>
      )}

      <MetricCatalogDialog
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onAddCustom={handleAddCustom}
      />
    </div>
  );
}
