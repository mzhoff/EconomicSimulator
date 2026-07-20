import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Pencil,
  RotateCcw,
  Upload,
  Zap,
} from 'lucide-react';
import {
  assertUniqueMetricAlias,
  allBreakdownChildMetricIds,
  autoLayout,
  breakdownChildMetricIds,
  canHaveMetricBreakdown,
  collapsedBreakdownMetricIds,
  computeGraphFocus,
  computeImpact,
  computeTokBeriThresholds,
  formatFormulaAst,
  getCalculationRelations,
  parseFormula,
  removeMetricBreakdown,
  toggleMetricBreakdown,
  unitFromPreset,
  unitPresetFromUnit,
  upsertMetricBreakdown,
  type DomainDef,
  type Edge,
  type MetricDef,
  type MetricBreakdownInput,
  type ModelState,
  type Shock,
  type VisualGroupDef,
  type WorkspaceDocument,
} from './components/metric-engine';
import { evaluateModel, topologicalOrder } from '../core/evaluator';
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
import { InputPanel, type DomainSummary } from './components/input-panel';
import { InspectorPanel } from './components/inspector-panel';
import { BottomToolbar } from './components/bottom-toolbar';
import { InfiniteCanvas, useCanvasControls, type CanvasPoint } from './components/infinite-canvas';
import { GraphModeIndicator } from './components/graph-mode-indicator';
import {
  FormulaComposer,
  type FormulaPreview,
} from './components/formula-composer';
import {
  NodeEditor,
  toMetricAlias,
  type MetricNodeDraft,
} from './components/node-editor';
import { DomainManager } from './components/domain-manager';
import { ModelSwitcher } from './components/model-switcher';
import {
  deleteEntry,
  duplicateEntry,
  loadModelLibrary,
  saveModelLibrary,
  switchActive,
  upsertWorkspace,
  type ModelLibraryState,
} from './model-library';
import { createBlankModel } from '../core/builder';
import {
  getMetricCardBounds,
  getMetricCardSize,
  getMetricPortPosition,
  type MetricPortSide,
} from './components/metric-geometry';
import {
  getConnectionPath,
  oppositeMetricPortSide,
  type EdgeLineStyle,
} from './components/edge-routing';
import { VisualGroupFrame } from './components/visual-group-frame';
import {
  VisualGroupDialog,
  type VisualGroupDraft,
} from './components/visual-group-dialog';
import { CanvasContextMenu } from './components/canvas-context-menu';
import { MetricBreakdownEditor } from './components/metric-breakdown-editor';

const MIN_CONTENT_WIDTH = 1200;
const MIN_CONTENT_HEIGHT = 800;
const HISTORY_LIMIT = 50;
const CANVAS_MENU_WIDTH = 208;
const CANVAS_MENU_HEIGHT = 44;
const CANVAS_MENU_EDGE_GAP = 8;
const EDGE_LINE_STYLE_STORAGE_KEY = 'economic-simulator:edge-line-style:v1';

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

interface MetricMenuState {
  id: string;
  x: number;
  y: number;
}

interface GroupMenuState {
  id: string;
  x: number;
  y: number;
}

interface CanvasMenuState {
  x: number;
  y: number;
  point: CanvasPoint;
}

interface EditorState {
  mode: 'create' | 'edit';
  metricId?: string;
  createAt?: CanvasPoint;
  draft: MetricNodeDraft;
}

interface ConnectionDraft {
  sourceId: string;
  sourceSide: MetricPortSide;
  start: CanvasPoint;
  end: CanvasPoint;
}

interface VisualGroupEditorState {
  mode: 'create' | 'edit';
  groupId?: string;
}

function pushPast(past: ModelState[], model: ModelState): ModelState[] {
  return [...past, model].slice(-HISTORY_LIMIT);
}

function createId(prefix: string): string {
  const random = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

function defaultMetricDraft(): MetricNodeDraft {
  return {
    name: '',
    alias: '',
    behavior: 'flow',
    unitPreset: 'rub',
    value: 0,
    min: 0,
    max: 100,
    domainIds: [],
    description: '',
    valueMode: 'manual',
    formulaSource: '',
  };
}

function unitPresetFor(metric: MetricDef): string {
  return unitPresetFromUnit(metric.unit);
}

function toDisplayValue(value: number, unitPreset: string): number {
  return unitPreset === 'percent' ? value * 100 : value;
}

function toStoredValue(value: number, unitPreset: string): number {
  return unitPreset === 'percent' ? value / 100 : value;
}

function metricDraft(metric: MetricDef): MetricNodeDraft {
  const unitPreset = unitPresetFor(metric);
  const fallbackValue = metric.value ?? 0;
  return {
    name: metric.name,
    alias: metric.alias,
    behavior: metric.behavior,
    unitPreset,
    value: toDisplayValue(fallbackValue, unitPreset),
    min: toDisplayValue(metric.inputConfig?.min ?? Math.min(0, fallbackValue), unitPreset),
    max: toDisplayValue(metric.inputConfig?.max ?? Math.max(100, Math.abs(fallbackValue) * 3), unitPreset),
    domainIds: metric.domainIds,
    description: metric.description,
    valueMode: metric.formula ? 'formula' : 'manual',
    formulaSource: metric.formula?.source ?? '',
  };
}

function syncDomainMemberships(
  metrics: Record<string, MetricDef>,
  domains: Record<string, DomainDef>,
): Record<string, DomainDef> {
  return Object.fromEntries(
    Object.entries(domains).map(([id, domain]) => [
      id,
      {
        ...domain,
        metricIds: Object.values(metrics)
          .filter((metric) => metric.domainIds.includes(id))
          .map((metric) => metric.id),
      },
    ]),
  );
}

function currentWorkspace(
  model: ModelState,
  scenarioId: string,
  inputOverridesByScenario: Record<string, Record<string, number>>,
  viewport: WorkspaceDocument['viewport'],
): WorkspaceDocument {
  return createWorkspaceDocument(model, {
    activeScenarioId: scenarioId,
    inputOverridesByScenario,
    viewport,
  });
}

function sanitizeInputOverrides(
  model: ModelState,
  overridesByScenario: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  return Object.fromEntries(
    Object.entries(overridesByScenario).map(([scenarioKey, overrides]) => [
      scenarioKey,
      Object.fromEntries(
        Object.entries(overrides).filter(([metricId]) => {
          const metric = model.metrics[metricId];
          return Boolean(metric && !metric.formula);
        }),
      ),
    ]),
  );
}

export default function App() {
  const [initial] = useState(() => {
    const workspaceResult = loadWorkspace();
    const libraryResult = loadModelLibrary(workspaceResult.value);
    const workspace = libraryResult.value.entries[libraryResult.value.activeModelId]?.workspace
      ?? workspaceResult.value;
    return {
      library: libraryResult.value,
      workspace,
      warning: libraryResult.warning ?? workspaceResult.warning ?? null,
    };
  });
  const [library, setLibrary] = useState<ModelLibraryState>(initial.library);
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: initial.workspace.model,
    future: [],
  });
  const model = history.present;
  const [scenarioId, setScenarioId] = useState(initial.workspace.activeScenarioId);
  const [inputOverridesByScenario, setInputOverridesByScenario] = useState(
    initial.workspace.inputOverridesByScenario,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [impactActive, setImpactActive] = useState(false);
  const [shock, setShock] = useState<Shock>({ kind: 'relative', amount: 0.1 });
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [metricMenu, setMetricMenu] = useState<MetricMenuState | null>(null);
  const [groupMenu, setGroupMenu] = useState<GroupMenuState | null>(null);
  const [canvasMenu, setCanvasMenu] = useState<CanvasMenuState | null>(null);
  const [notice, setNotice] = useState<string | null>(initial.warning);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [hoveredEdge, setHoveredEdge] = useState<Edge | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [domainManagerOpen, setDomainManagerOpen] = useState(false);
  const [domainManagerInitialId, setDomainManagerInitialId] = useState<string | null>(null);
  const [connectionMode, setConnectionMode] = useState(false);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [edgeLineStyle, setEdgeLineStyle] = useState<EdgeLineStyle>(() => {
    try {
      const stored = globalThis.localStorage?.getItem(EDGE_LINE_STYLE_STORAGE_KEY);
      return stored === 'orthogonal' || stored === 'straight' || stored === 'curved'
        ? stored
        : 'curved';
    } catch {
      return 'curved';
    }
  });
  const [visualGroupEditor, setVisualGroupEditor] = useState<VisualGroupEditorState | null>(null);
  const [breakdownEditorMetricId, setBreakdownEditorMetricId] = useState<string | null>(null);

  const { transform, setTransform, zoomIn, zoomOut, fitToView } = useCanvasControls(
    initial.workspace.viewport,
  );
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const libraryRef = useRef(initial.library);
  const selectionRef = useRef<{ start: CanvasPoint; base: Set<string>; moved: boolean } | null>(null);
  const didInitialFitRef = useRef(false);

  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(EDGE_LINE_STYLE_STORAGE_KEY, edgeLineStyle);
    } catch {
      // The visual preference is non-critical when Local Storage is unavailable.
    }
  }, [edgeLineStyle]);

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
  const hiddenMetricIds = useMemo(() => {
    const hidden = collapsedBreakdownMetricIds(model);
    for (const group of Object.values(model.visualGroups)) {
      if (group.collapsed) group.metricIds.forEach((id) => hidden.add(id));
    }
    return hidden;
  }, [model]);
  const allEdges = useMemo(
    () => [...calculationRelations, ...model.influenceRelations]
      .filter((edge) => !hiddenMetricIds.has(edge.from) && !hiddenMetricIds.has(edge.to)),
    [calculationRelations, hiddenMetricIds, model.influenceRelations],
  );
  const graphFocus = useMemo(
    () => computeGraphFocus(model, selectedIds, impactActive && impact ? impact.inputId : undefined),
    [impact, impactActive, model, selectedIds],
  );
  const hoveredEdgeKey = hoveredEdge ? `${hoveredEdge.from}-${hoveredEdge.to}` : null;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const primarySelectedId = selectedIds[selectedIds.length - 1] ?? model.activeNorthStarId;
  const allCollapsed = !leftOpen && !rightOpen;
  const overriddenIds = useMemo(() => new Set(Object.keys(currentOverrides)), [currentOverrides]);
  const domains = useMemo<DomainSummary[]>(
    () => Object.values(model.domains).map(({ id, name, color, order }) => ({ id, name, color, order })),
    [model.domains],
  );
  const collapsedDomainIds = useMemo(
    () => new Set(Object.values(model.domains).filter((domain) => domain.collapsed).map((domain) => domain.id)),
    [model.domains],
  );
  const contentSize = useMemo(() => {
    const bounds = Object.values(model.metrics)
      .filter((metric) => !hiddenMetricIds.has(metric.id))
      .map((metric) => getMetricCardBounds(metric.position, metric.behavior));
    return {
      width: Math.max(MIN_CONTENT_WIDTH, ...bounds.map((item) => item.right + 160)),
      height: Math.max(MIN_CONTENT_HEIGHT, ...bounds.map((item) => item.bottom + 160)),
    };
  }, [hiddenMetricIds, model.metrics]);
  const modelList = useMemo(
    () => Object.values(library.entries).map(({ workspace }) => ({
      id: workspace.model.id,
      name: workspace.model.name,
      metricCount: Object.keys(workspace.model.metrics).length
        - allBreakdownChildMetricIds(workspace.model).size,
    })),
    [library.entries],
  );

  useEffect(() => {
    libraryRef.current = library;
  }, [library]);

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
    const openingResetCashFlow = Boolean(initial.warning?.includes('денежного потока'));
    if (
      didInitialFitRef.current
      || (
        !openingResetCashFlow
        && (
          initial.workspace.viewport.scale !== 1
          || initial.workspace.viewport.x !== 0
          || initial.workspace.viewport.y !== 0
        )
      )
    ) return;
    didInitialFitRef.current = true;
    const frame = window.requestAnimationFrame(handleFitToView);
    return () => window.cancelAnimationFrame(frame);
  }, [handleFitToView, initial.workspace.viewport]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const workspace = currentWorkspace(
        model,
        scenarioId,
        inputOverridesByScenario,
        transform,
      );
      const legacySaved = saveWorkspace(workspace);
      const next = upsertWorkspace(
        { ...libraryRef.current, activeModelId: model.id },
        workspace,
      );
      libraryRef.current = next;
      const saved = saveModelLibrary(next);
      setLibrary(next);
      setSaveState(legacySaved.value && saved.value ? 'saved' : 'error');
      if (legacySaved.warning ?? saved.warning) setNotice(legacySaved.warning ?? saved.warning ?? null);
    }, 350);
    setSaveState('saving');
    return () => window.clearTimeout(timer);
  }, [inputOverridesByScenario, model, scenarioId, transform]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select')) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g' && selectedIds.length >= 2) {
        event.preventDefault();
        setVisualGroupEditor({ mode: 'create' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, selectedIds.length, undo]);

  useEffect(() => {
    if (!metricMenu && !groupMenu && !canvasMenu) return;
    const close = () => {
      setMetricMenu(null);
      setGroupMenu(null);
      setCanvasMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [canvasMenu, groupMenu, metricMenu]);

  const selectMetric = useCallback((id: string, additive = false) => {
    setSelectedGroupId(null);
    setSelectedIds((current) => {
      if (!additive) return [id];
      return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    });
  }, []);

  const handleChangeInput = useCallback((id: string, rawValue: number) => {
    if (!Number.isFinite(rawValue)) return;
    const metric = model.metrics[id];
    if (!metric || metric.formula) return;
    const rounded = metric.inputConfig?.integer ? Math.round(rawValue) : rawValue;
    const value = metric.inputConfig
      ? Math.min(metric.inputConfig.max, Math.max(metric.inputConfig.min, rounded))
      : rounded;
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

  const openBreakdownEditor = useCallback((id: string) => {
    if (!canHaveMetricBreakdown(model.metrics[id])) {
      setNotice('Табличный состав можно создать для вводимой метрики или формулы, состоящей только из суммы метрик.');
      return;
    }
    setBreakdownEditorMetricId(id);
    setMetricMenu(null);
  }, [model]);

  const handleSaveBreakdown = useCallback((input: MetricBreakdownInput) => {
    if (!breakdownEditorMetricId) return;
    try {
      const candidate = upsertMetricBreakdown(model, breakdownEditorMetricId, input);
      topologicalOrder(candidate);
      const checked = evaluateModel(candidate, scenarioId, currentOverrides);
      const blocking = checked.errors.find((error) => error.metricId === breakdownEditorMetricId);
      if (blocking) throw new Error(blocking.message);
      commitModel(() => candidate);
      setInputOverridesByScenario((current) => sanitizeInputOverrides(candidate, current));
      setSelectedIds([breakdownEditorMetricId]);
      setBreakdownEditorMetricId(null);
      setNotice('Состав сохранён: итоговая метрика теперь рассчитывается из строк таблицы.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Состав метрики не сохранён.');
    }
  }, [breakdownEditorMetricId, commitModel, currentOverrides, model, scenarioId]);

  const handleToggleBreakdown = useCallback((id: string) => {
    const breakdown = model.breakdowns?.[id];
    if (!breakdown) return;
    commitModel((current) => toggleMetricBreakdown(current, id));
    if (breakdown.expanded) setSelectedIds([id]);
    setMetricMenu(null);
  }, [commitModel, model.breakdowns]);

  const handleRemoveBreakdown = useCallback(() => {
    if (!breakdownEditorMetricId) return;
    const metric = evaluation.metrics[breakdownEditorMetricId];
    if (!metric || !window.confirm('Удалить табличный состав и оставить текущий итог обычным вводимым значением?')) return;
    const candidate = removeMetricBreakdown(model, breakdownEditorMetricId, metric.value ?? 0);
    commitModel(() => candidate);
    setInputOverridesByScenario((current) => sanitizeInputOverrides(candidate, current));
    setBreakdownEditorMetricId(null);
    setSelectedIds([breakdownEditorMetricId]);
    setNotice('Состав удалён; текущий итог сохранён как обычное значение метрики.');
  }, [breakdownEditorMetricId, commitModel, evaluation.metrics, model]);

  const handleToggleAll = useCallback(() => {
    if (allCollapsed) {
      setLeftOpen(true);
      setRightOpen(true);
    } else {
      setLeftOpen(false);
      setRightOpen(false);
    }
  }, [allCollapsed]);

  const startDrag = useCallback((
    ids: string[],
    event: ReactPointerEvent,
  ) => {
    const originalPositions = Object.fromEntries(
      ids.filter((id) => model.metrics[id]).map((id) => [id, { ...model.metrics[id].position }]),
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
        for (const [id, origin] of Object.entries(drag.originalPositions)) {
          if (!metrics[id]) continue;
          metrics[id] = {
            ...metrics[id],
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
  }, [model, transform.scale]);

  const handleStartDrag = useCallback((id: string, event: ReactPointerEvent) => {
    const ids = selectedSet.has(id) ? selectedIds : [id];
    if (!selectedSet.has(id)) setSelectedIds([id]);
    startDrag(ids, event);
  }, [selectedIds, selectedSet, startDrag]);

  const handleStartGroupDrag = useCallback((id: string, event: ReactPointerEvent) => {
    const group = model.visualGroups[id];
    if (!group) return;
    startDrag(group.metricIds, event);
  }, [model.visualGroups, startDrag]);

  const handleDeleteMetric = useCallback((id: string) => {
    const dependents = calculationRelations.filter((relation) => relation.from === id);
    if (dependents.length > 0) {
      setNotice(`Нельзя удалить «${model.metrics[id]?.name}»: от неё зависят расчётные формулы.`);
      return;
    }
    const ownedMetricIds = new Set([
      id,
      ...(model.breakdowns?.[id]
        ? breakdownChildMetricIds(model.breakdowns[id])
        : []),
    ]);
    commitModel((current) => {
      if (!current.metrics[id]) return current;
      const metrics = { ...current.metrics };
      ownedMetricIds.forEach((metricId) => delete metrics[metricId]);
      const breakdowns = { ...(current.breakdowns ?? {}) };
      delete breakdowns[id];
      const scenarios = Object.fromEntries(
        Object.entries(current.scenarios).map(([scenarioKey, scenario]) => {
          const overrides = { ...scenario.overrides };
          ownedMetricIds.forEach((metricId) => delete overrides[metricId]);
          return [scenarioKey, { ...scenario, overrides }];
        }),
      );
      const visualGroups = Object.fromEntries(
        Object.entries(current.visualGroups)
          .map(([groupId, group]) => [
            groupId,
            { ...group, metricIds: group.metricIds.filter((metricId) => !ownedMetricIds.has(metricId)) },
          ])
          .filter(([, group]) => (group as VisualGroupDef).metricIds.length > 0),
      );
      return {
        ...current,
        activeNorthStarId: current.activeNorthStarId === id ? null : current.activeNorthStarId,
        metrics,
        breakdowns,
        domains: syncDomainMemberships(metrics, current.domains),
        scenarios,
        visualGroups,
        influenceRelations: current.influenceRelations.filter(
          (relation) => !ownedMetricIds.has(relation.from) && !ownedMetricIds.has(relation.to),
        ),
      };
    });
    setInputOverridesByScenario((current) => Object.fromEntries(
      Object.entries(current).map(([scenarioKey, overrides]) => [
        scenarioKey,
        Object.fromEntries(Object.entries(overrides).filter(([metricId]) => !ownedMetricIds.has(metricId))),
      ]),
    ));
    setSelectedIds((current) => current.filter((metricId) => metricId !== id));
    setMetricMenu(null);
  }, [calculationRelations, commitModel, model.breakdowns, model.metrics]);

  const openCreateEditor = useCallback((createAt?: CanvasPoint) => {
    setEditor({ mode: 'create', createAt, draft: defaultMetricDraft() });
    setFormulaOpen(false);
    setEditorError(null);
    setCanvasMenu(null);
  }, []);

  const openEditEditor = useCallback((id: string, openFormula = false) => {
    const metric = model.metrics[id];
    if (!metric) return;
    setEditor({
      mode: 'edit',
      metricId: id,
      draft: {
        ...metricDraft(metric),
        formulaSource: metric.formula
          ? formatFormulaAst(metric.formula.ast, model.metrics)
          : '',
      },
    });
    setFormulaOpen(openFormula);
    setEditorError(null);
    setMetricMenu(null);
  }, [model.metrics]);

  const editorAliasError = useMemo(() => {
    if (!editor?.draft.alias) return undefined;
    const duplicate = Object.values(model.metrics).find(
      (metric) => metric.alias === editor.draft.alias && metric.id !== editor.metricId,
    );
    return duplicate ? `Alias уже используется метрикой «${duplicate.name}».` : undefined;
  }, [editor, model.metrics]);

  const formulaPreview = useMemo<FormulaPreview>(() => {
    if (!editor || editor.draft.valueMode !== 'formula' || !editor.draft.formulaSource.trim()) {
      return { errors: [] };
    }
    try {
      const formula = parseFormula(editor.draft.formulaSource, model.metrics);
      const id = editor.metricId ?? '__formula_preview__';
      const unit = unitFromPreset(editor.draft.unitPreset);
      const existing = editor.metricId ? model.metrics[editor.metricId] : undefined;
      const previewMetric: MetricDef = {
        ...(existing ?? {
          id,
          definitionId: `custom.${id}`,
          name: editor.draft.name || 'Новая метрика',
          alias: editor.draft.alias || 'formula_preview',
          description: '',
          behavior: editor.draft.behavior,
          unit,
          grain: { entity: 'station', time: 'month' },
          valueSource: 'derived',
          knowledgeStatus: 'derived',
          kind: 'derived',
          domain: 'results',
          domainIds: [],
          role: 'intermediate',
          value: null,
          provenance: {
            source: 'EconomicSimulator',
            version: new Date().toISOString().slice(0, 10),
            confidence: 'medium',
          },
          validationStatus: 'valid',
          validationMessages: [],
          position: { x: 0, y: 0 },
        }),
        id,
        name: editor.draft.name || existing?.name || 'Новая метрика',
        alias: editor.draft.alias || existing?.alias || 'formula_preview',
        behavior: editor.draft.behavior,
        unit,
        value: null,
        formula,
        kind: 'derived',
        valueSource: 'derived',
        knowledgeStatus: 'derived',
      };
      const candidate: ModelState = {
        ...model,
        metrics: { ...model.metrics, [id]: previewMetric },
      };
      topologicalOrder(candidate);
      const result = evaluateModel(candidate, scenarioId, currentOverrides);
      const errors = result.errors
        .filter((error) => error.metricId === id)
        .map((error) => error.message);
      return {
        value: result.metrics[id]?.value,
        unitSymbol: unit.symbol,
        behavior: editor.draft.behavior,
        dependencies: getCalculationRelations(candidate)
          .filter((relation) => relation.to === id)
          .map((relation) => relation.from),
        errors,
      };
    } catch (error) {
      return { errors: [error instanceof Error ? error.message : 'Формула невалидна.'] };
    }
  }, [currentOverrides, editor, model, scenarioId]);

  const handleSaveMetric = useCallback(() => {
    if (!editor) return;
    const draft = editor.draft;
    try {
      assertUniqueMetricAlias(draft.alias, model.metrics, editor.metricId);
      if (draft.valueMode === 'formula' && formulaPreview.errors.length > 0) {
        throw new Error(formulaPreview.errors[0]);
      }
      const id = editor.metricId ?? createId('metric');
      const existing = editor.metricId ? model.metrics[editor.metricId] : undefined;
      const managedByBreakdown = Boolean(existing && model.breakdowns?.[id]);
      const unit = managedByBreakdown ? existing!.unit : unitFromPreset(draft.unitPreset);
      const value = toStoredValue(draft.value, draft.unitPreset);
      const min = toStoredValue(draft.min, draft.unitPreset);
      const max = toStoredValue(draft.max, draft.unitPreset);
      const formula = managedByBreakdown
        ? existing!.formula
        : draft.valueMode === 'formula'
          ? parseFormula(draft.formulaSource, model.metrics)
          : undefined;
      const area = canvasAreaRef.current?.getBoundingClientRect();
      const cardSize = getMetricCardSize(draft.behavior);
      const existingMetrics = Object.values(model.metrics);
      const contextPosition = editor.createAt
        ? {
            x: editor.createAt.x - cardSize.width / 2,
            y: editor.createAt.y - cardSize.height / 2,
          }
        : undefined;
      const position = existing?.position ?? contextPosition ?? (existingMetrics.length > 0
        ? {
            x: Math.max(
              ...existingMetrics.map((current) => (
                getMetricCardBounds(current.position, current.behavior).right
              )),
            ) + 120,
            y: Math.min(...existingMetrics.map((current) => current.position.y)),
          }
        : {
            x: Math.max(40, ((area?.width ?? 1200) / 2 - transform.x) / transform.scale - cardSize.width / 2),
            y: Math.max(40, ((area?.height ?? 800) / 2 - transform.y) / transform.scale - cardSize.height / 2),
          });
      const metric: MetricDef = {
        ...(existing ?? {
          id,
          definitionId: `custom.${id}`,
          grain: { entity: 'station', time: 'month' },
          domain: 'results',
          role: 'input',
          provenance: {
            source: 'Создано пользователем в EconomicSimulator',
            version: new Date().toISOString().slice(0, 10),
            confidence: 'medium',
          },
        }),
        id,
        name: draft.name.trim(),
        alias: draft.alias.trim(),
        description: draft.description.trim() || 'Пользовательская метрика.',
        behavior: managedByBreakdown ? existing!.behavior : draft.behavior,
        unit,
        valueSource: formula ? 'derived' : 'input',
        knowledgeStatus: formula ? 'derived' : 'assumption',
        kind: formula ? 'derived' : 'assumption',
        domain: existing?.domain ?? 'results',
        domainIds: [...new Set(draft.domainIds)],
        role: managedByBreakdown ? existing!.role : formula ? 'intermediate' : 'input',
        value: formula ? null : value,
        formula,
        validationStatus: 'valid',
        validationMessages: [],
        position,
        inputConfig: formula
          ? undefined
          : {
              min,
              max,
              step: Math.max((max - min) / 100, draft.unitPreset === 'percent' ? 0.001 : 0.01),
            },
      };
      const metrics = { ...model.metrics, [id]: metric };
      for (const current of Object.values(metrics)) {
        if (!current.formula) continue;
        metrics[current.id] = {
          ...current,
          formula: {
            ...current.formula,
            source: formatFormulaAst(current.formula.ast, metrics),
          },
        };
      }
      const candidate: ModelState = {
        ...model,
        metrics,
        domains: syncDomainMemberships(metrics, model.domains),
      };
      topologicalOrder(candidate);
      const checked = evaluateModel(candidate, scenarioId, currentOverrides);
      const blocking = checked.errors.find((error) => error.metricId === id);
      if (blocking) throw new Error(blocking.message);
      commitModel(() => candidate);
      setSelectedIds([id]);
      setEditor(null);
      setFormulaOpen(false);
      setEditorError(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : 'Метрика не сохранена.');
    }
  }, [commitModel, currentOverrides, editor, formulaPreview.errors, model, scenarioId, transform]);

  const handleSetNorthStar = useCallback((id: string) => {
    commitModel((current) => (
      current.metrics[id] && current.activeNorthStarId !== id
        ? { ...current, activeNorthStarId: id }
        : current
    ));
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

  const handleSelectionStart = useCallback((point: CanvasPoint, event: ReactPointerEvent<HTMLDivElement>) => {
    const base = event.shiftKey ? new Set(selectedIds) : new Set<string>();
    selectionRef.current = { start: point, base, moved: false };
    setSelectionRect({ start: point, end: point });
    if (!event.shiftKey) setSelectedIds([]);
    setSelectedGroupId(null);
    setMetricMenu(null);
    setGroupMenu(null);
    setCanvasMenu(null);
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
        const bounds = getMetricCardBounds(metric.position, metric.behavior);
        const intersects = bounds.x < right && bounds.right > left && bounds.y < bottom && bounds.bottom > top;
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

  const worldPointFromClient = useCallback((clientX: number, clientY: number): CanvasPoint => {
    const rect = canvasAreaRef.current?.getBoundingClientRect();
    return {
      x: (clientX - (rect?.left ?? 0) - transform.x) / transform.scale,
      y: (clientY - (rect?.top ?? 0) - transform.y) / transform.scale,
    };
  }, [transform]);

  const handleConnectionPointerDown = useCallback((
    sourceId: string,
    sourceSide: MetricPortSide,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const source = model.metrics[sourceId];
    if (!source) return;
    const start = getMetricPortPosition(source.position, source.behavior, sourceSide);
    setConnectionDraft({
      sourceId,
      sourceSide,
      start,
      end: worldPointFromClient(event.clientX, event.clientY),
    });

    const handleMove = (moveEvent: PointerEvent) => {
      const end = worldPointFromClient(moveEvent.clientX, moveEvent.clientY);
      setConnectionDraft((current) => current ? { ...current, end } : null);
    };
    const handleUp = (upEvent: PointerEvent) => {
      const targetElement = document
        .elementFromPoint(upEvent.clientX, upEvent.clientY)
        ?.closest<HTMLElement>('[data-metric-id]');
      const targetId = targetElement?.dataset.metricId;
      if (targetId && targetId !== sourceId) {
        const target = model.metrics[targetId];
        const alias = source.alias;
        const currentSource = target.formula
          ? formatFormulaAst(target.formula.ast, model.metrics)
          : '';
        const nextSource = currentSource.includes(alias)
          ? currentSource
          : currentSource
            ? `${currentSource} + ${alias}`
            : alias;
        setEditor({
          mode: 'edit',
          metricId: targetId,
          draft: {
            ...metricDraft(target),
            valueMode: 'formula',
            formulaSource: nextSource,
          },
        });
        setFormulaOpen(true);
        setEditorError(null);
        setSelectedIds([targetId]);
      } else if (targetId === sourceId) {
        setNotice('Метрика не может ссылаться сама на себя: это создало бы цикл.');
      }
      setConnectionDraft(null);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [model.metrics, worldPointFromClient]);

  const handleExport = useCallback(() => {
    const workspace = currentWorkspace(model, scenarioId, inputOverridesByScenario, transform);
    const blob = new Blob([serializeWorkspace(workspace)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${model.name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-') || 'economic-model'}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('JSON export создан: формулы, домены, группы, сценарии, позиции и viewport сохранены.');
  }, [inputOverridesByScenario, model, scenarioId, transform]);

  const loadWorkspaceIntoUi = useCallback((workspace: WorkspaceDocument) => {
    setHistory({ past: [], present: workspace.model, future: [] });
    setScenarioId(workspace.activeScenarioId);
    setInputOverridesByScenario(workspace.inputOverridesByScenario);
    setTransform(workspace.viewport);
    setSelectedIds([]);
    setSelectedGroupId(null);
    setImpactActive(false);
    setHoveredEdge(null);
    setEditor(null);
    setFormulaOpen(false);
  }, [setTransform]);

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
    const nextLibrary = upsertWorkspace(
      { ...library, activeModelId: workspace.model.id },
      workspace,
    );
    setLibrary(nextLibrary);
    saveModelLibrary(nextLibrary);
    loadWorkspaceIntoUi(workspace);
    setNotice('Модель импортирована и прошла проверку схемы, формул, единиц и DAG.');
  }, [library, loadWorkspaceIntoUi]);

  const handleSwitchModel = useCallback((id: string) => {
    const withCurrent = upsertWorkspace(
      library,
      currentWorkspace(model, scenarioId, inputOverridesByScenario, transform),
    );
    const next = switchActive(withCurrent, id);
    setLibrary(next);
    saveModelLibrary(next);
    loadWorkspaceIntoUi(next.entries[id].workspace);
  }, [inputOverridesByScenario, library, loadWorkspaceIntoUi, model, scenarioId, transform]);

  const handleCreateBlankModel = useCallback(() => {
    const blank = createBlankModel(`Новая модель ${modelList.length + 1}`);
    const workspace = createWorkspaceDocument(blank, {
      viewport: { x: 120, y: 80, scale: 1 },
    });
    const withCurrent = upsertWorkspace(
      library,
      currentWorkspace(model, scenarioId, inputOverridesByScenario, transform),
    );
    const next = upsertWorkspace(
      { ...withCurrent, activeModelId: blank.id },
      workspace,
    );
    setLibrary(next);
    saveModelLibrary(next);
    loadWorkspaceIntoUi(workspace);
    setNotice('Создана пустая модель. Начните с кнопки «+» в нижней панели.');
  }, [inputOverridesByScenario, library, loadWorkspaceIntoUi, model, modelList.length, scenarioId, transform]);

  const handleDuplicateModel = useCallback((id: string) => {
    const source = library.entries[id]?.workspace.model;
    if (!source) return;
    const generated = createBlankModel();
    const withCurrent = upsertWorkspace(
      library,
      currentWorkspace(model, scenarioId, inputOverridesByScenario, transform),
    );
    const next = duplicateEntry(withCurrent, id, generated.id, `${source.name} — копия`);
    setLibrary(next);
    saveModelLibrary(next);
    loadWorkspaceIntoUi(next.entries[generated.id].workspace);
  }, [inputOverridesByScenario, library, loadWorkspaceIntoUi, model, scenarioId, transform]);

  const handleRenameModel = useCallback((id: string, name: string) => {
    const entry = library.entries[id];
    if (!entry) return;
    const workspace = structuredClone(entry.workspace);
    workspace.model.name = name;
    const next = upsertWorkspace(library, workspace);
    setLibrary(next);
    if (id === model.id) {
      commitModel((current) => ({ ...current, name }));
    } else {
      saveModelLibrary(next);
    }
  }, [commitModel, library, model.id]);

  const handleDeleteModel = useCallback((id: string) => {
    const entry = library.entries[id];
    if (!entry) return;
    if (!window.confirm(`Удалить модель «${entry.workspace.model.name}» из локальной библиотеки?`)) return;
    try {
      const next = deleteEntry(library, id);
      setLibrary(next);
      saveModelLibrary(next);
      if (id === model.id) loadWorkspaceIntoUi(next.entries[next.activeModelId].workspace);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Модель не удалена.');
    }
  }, [library, loadWorkspaceIntoUi, model.id]);

  const handleCreateDomain = useCallback((name: string, color: string) => {
    const id = createId('domain');
    commitModel((current) => ({
      ...current,
      domains: {
        ...current.domains,
        [id]: {
          id,
          name,
          color,
          description: '',
          metricIds: [],
          order: Object.keys(current.domains).length,
          collapsed: false,
        },
      },
    }));
  }, [commitModel]);

  const handleRenameDomain = useCallback((id: string, name: string) => {
    commitModel((current) => current.domains[id]
      ? {
          ...current,
          domains: {
            ...current.domains,
            [id]: { ...current.domains[id], name },
          },
        }
      : current);
  }, [commitModel]);

  const handleDeleteDomain = useCallback((id: string) => {
    commitModel((current) => {
      if (!current.domains[id]) return current;
      const domains = { ...current.domains };
      delete domains[id];
      const metrics = Object.fromEntries(
        Object.entries(current.metrics).map(([metricId, metric]) => {
          const domainIds = metric.domainIds.filter((domainId) => domainId !== id);
          return [
            metricId,
            {
              ...metric,
              domainIds,
            },
          ];
        }),
      );
      return { ...current, metrics, domains: syncDomainMemberships(metrics, domains) };
    });
  }, [commitModel]);

  const updateDomainMembership = useCallback((
    domainId: string,
    ids: readonly string[],
    assigned: boolean,
  ) => {
    commitModel((current) => {
      if (!current.domains[domainId]) return current;
      const idSet = new Set(ids);
      const metrics = Object.fromEntries(
        Object.entries(current.metrics).map(([id, metric]) => {
          if (!idSet.has(id)) return [id, metric];
          const memberships = new Set(metric.domainIds);
          if (assigned) memberships.add(domainId);
          else memberships.delete(domainId);
          const domainIds = [...memberships];
          return [
            id,
            {
              ...metric,
              domainIds,
            },
          ];
        }),
      );
      return { ...current, metrics, domains: syncDomainMemberships(metrics, current.domains) };
    });
  }, [commitModel]);

  const handleToggleDomain = useCallback((id: string) => {
    if (id === '__unassigned__') return;
    commitModel((current) => current.domains[id]
      ? {
          ...current,
          domains: {
            ...current.domains,
            [id]: {
              ...current.domains[id],
              collapsed: !current.domains[id].collapsed,
            },
          },
        }
      : current);
  }, [commitModel]);

  const handleOpenDomainManager = useCallback((id?: string) => {
    setDomainManagerInitialId(id ?? null);
    setDomainManagerOpen(true);
  }, []);

  const metricAlreadyGrouped = useMemo(() => {
    const ids = new Set<string>();
    Object.values(model.visualGroups).forEach((group) => group.metricIds.forEach((id) => ids.add(id)));
    return ids;
  }, [model.visualGroups]);

  const canGroupSelection = selectedIds.length >= 2
    && selectedIds.every((id) => !metricAlreadyGrouped.has(id));

  const handleOpenGroupDialog = useCallback(() => {
    if (selectedIds.length < 2) return;
    const occupied = selectedIds.filter((id) => metricAlreadyGrouped.has(id));
    if (occupied.length > 0) {
      setNotice('Одна метрика может находиться только в одной визуальной группе. Смысловые домены при этом остаются many-to-many.');
      return;
    }
    setVisualGroupEditor({ mode: 'create' });
  }, [metricAlreadyGrouped, selectedIds]);

  const handleSaveVisualGroup = useCallback((draft: VisualGroupDraft) => {
    if (!visualGroupEditor) return;
    if (visualGroupEditor.mode === 'edit' && visualGroupEditor.groupId) {
      commitModel((current) => ({
        ...current,
        visualGroups: {
          ...current.visualGroups,
          [visualGroupEditor.groupId!]: {
            ...current.visualGroups[visualGroupEditor.groupId!],
            name: draft.name,
            color: draft.color,
          },
        },
      }));
    } else {
      const id = createId('group');
      commitModel((current) => ({
        ...current,
        visualGroups: {
          ...current.visualGroups,
          [id]: {
            id,
            name: draft.name,
            color: draft.color,
            metricIds: [...selectedIds],
            collapsed: false,
          },
        },
      }));
      setSelectedGroupId(id);
    }
    setVisualGroupEditor(null);
    setGroupMenu(null);
  }, [commitModel, selectedIds, visualGroupEditor]);

  const handleDeleteVisualGroup = useCallback((id: string) => {
    commitModel((current) => {
      if (!current.visualGroups[id]) return current;
      const visualGroups = { ...current.visualGroups };
      delete visualGroups[id];
      return { ...current, visualGroups };
    });
    setSelectedGroupId(null);
    setGroupMenu(null);
  }, [commitModel]);

  const selectionStyle = selectionRect
    ? {
        left: Math.min(selectionRect.start.x, selectionRect.end.x),
        top: Math.min(selectionRect.start.y, selectionRect.end.y),
        width: Math.abs(selectionRect.end.x - selectionRect.start.x),
        height: Math.abs(selectionRect.end.y - selectionRect.start.y),
      }
    : null;
  const scenarioOrder = Object.keys(model.scenarios);
  const groupBeingEdited = visualGroupEditor?.groupId
    ? model.visualGroups[visualGroupEditor.groupId]
    : undefined;

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>
      <header className="relative z-40 flex min-h-[3.25rem] items-center justify-between gap-[0.75rem] border-b border-border bg-card px-[1.25rem] py-[0.5rem]">
        <div className="flex min-w-0 items-center gap-[0.75rem]">
          <div className="flex shrink-0 items-center gap-[0.375rem]">
            <Zap className="size-[1rem] text-foreground" />
            <span className="text-[0.875rem] text-foreground" style={{ fontWeight: 600 }}>Metric Graph OS</span>
          </div>
          <ModelSwitcher
            models={modelList}
            activeModelId={model.id}
            onSelect={handleSwitchModel}
            onCreateBlank={handleCreateBlankModel}
            onDuplicate={handleDuplicateModel}
            onRename={handleRenameModel}
            onDelete={handleDeleteModel}
          />
          <span className="hidden rounded-full bg-secondary px-[0.5rem] py-[0.0625rem] text-[0.5625rem] text-muted-foreground xl:block" style={{ fontWeight: 500 }}>
            {Object.values(model.metrics).filter((metric) => !hiddenMetricIds.has(metric.id)).length} metrics · {allEdges.filter((edge) => edge.type === 'calc').length} calc edges
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-[0.375rem]">
          <div className="flex items-center rounded-[var(--radius-lg)] border border-border bg-background p-[0.125rem]">
            {scenarioOrder.map((id) => (
              <button
                key={id}
                onClick={() => setScenarioId(id)}
                title={model.scenarios[id].description}
                className={`cursor-pointer rounded-[var(--radius-md)] px-[0.625rem] py-[0.25rem] text-[0.6875rem] transition-all ${
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
            className="flex size-[1.875rem] cursor-pointer items-center justify-center rounded-[var(--radius-lg)] border border-border text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-[0.75rem]" />
          </button>
          <button onClick={() => importInputRef.current?.click()} className="header-action" title="Импортировать JSON">
            <Upload className="size-[0.75rem]" />
            <span className="hidden xl:inline">Import</span>
          </button>
          <button onClick={handleExport} className="header-action" title="Экспортировать JSON">
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
          onBackgroundContextMenu={(point, event) => {
            setMetricMenu(null);
            setGroupMenu(null);
            setCanvasMenu({
              point,
              x: Math.max(
                CANVAS_MENU_EDGE_GAP,
                Math.min(event.clientX, window.innerWidth - CANVAS_MENU_WIDTH - CANVAS_MENU_EDGE_GAP),
              ),
              y: Math.max(
                CANVAS_MENU_EDGE_GAP,
                Math.min(event.clientY, window.innerHeight - CANVAS_MENU_HEIGHT - CANVAS_MENU_EDGE_GAP),
              ),
            });
          }}
        >
          {Object.values(model.visualGroups).map((group) => (
            <VisualGroupFrame
              key={group.id}
              group={group}
              metrics={evaluation.metrics}
              selected={selectedGroupId === group.id}
              onSelect={(id) => {
                setSelectedGroupId(id);
                setSelectedIds([]);
              }}
              onToggleCollapsed={(id) => commitModel((current) => ({
                ...current,
                visualGroups: {
                  ...current.visualGroups,
                  [id]: {
                    ...current.visualGroups[id],
                    collapsed: !current.visualGroups[id].collapsed,
                  },
                },
              }))}
              onStartDrag={handleStartGroupDrag}
              onOpenMenu={(id, event) => {
                setSelectedGroupId(id);
                setGroupMenu({ id, x: event.clientX, y: event.clientY });
              }}
            />
          ))}
          <CanvasEdges
            edges={allEdges}
            metrics={evaluation.metrics}
            focus={graphFocus}
            impactDeltas={impactActive ? impact?.deltas : undefined}
            scale={transform.scale}
            lineStyle={edgeLineStyle}
            hoveredEdgeKey={hoveredEdgeKey}
            onHoveredEdgeChange={setHoveredEdge}
          />
          {Object.values(evaluation.metrics)
            .filter((metric) => !hiddenMetricIds.has(metric.id))
            .map((metric) => (
              <MetricCard
                key={metric.id}
                metric={metric}
                isNorthStar={model.activeNorthStarId === metric.id}
                selected={selectedSet.has(metric.id)}
                relationHovered={hoveredEdge?.from === metric.id || hoveredEdge?.to === metric.id}
                onSelect={selectMetric}
                onDelete={handleDeleteMetric}
                onStartDrag={handleStartDrag}
                onConnectionPointerDown={handleConnectionPointerDown}
                onContextMenu={(id, event) => {
                  setSelectedIds([id]);
                  setMetricMenu({ id, x: event.clientX, y: event.clientY });
                }}
                formulaSource={metric.formula
                  ? formatFormulaAst(metric.formula.ast, evaluation.metrics)
                  : undefined}
                delta={impactActive && impact?.deltas[metric.id] !== undefined && metric.id !== impact.inputId
                  ? impact.deltas[metric.id]
                  : undefined}
                impactActive={impactActive}
                breakdown={model.breakdowns?.[metric.id]}
                onOpenBreakdown={openBreakdownEditor}
                onToggleBreakdown={handleToggleBreakdown}
              />
            ))}
          {connectionDraft ? (
            <svg className="pointer-events-none absolute inset-0 z-[15] h-full w-full overflow-visible">
              <path
                d={getConnectionPath(
                  connectionDraft.start,
                  connectionDraft.end,
                  connectionDraft.sourceSide,
                  oppositeMetricPortSide(connectionDraft.sourceSide),
                  edgeLineStyle,
                  transform.scale,
                )}
                fill="none"
                stroke="#7c3aed"
                strokeWidth={2.5 / Math.max(transform.scale, 0.05)}
                strokeDasharray={`${7 / Math.max(transform.scale, 0.05)} ${5 / Math.max(transform.scale, 0.05)}`}
                strokeLinecap="round"
              />
            </svg>
          ) : null}
          {selectionStyle ? (
            <div
              className="pointer-events-none absolute z-50 rounded-[var(--radius-sm)] border border-primary bg-primary/10"
              style={selectionStyle}
            />
          ) : null}
        </InfiniteCanvas>

        <GraphModeIndicator focus={graphFocus} selectedCount={selectedIds.length} />

        <InputPanel
          metrics={evaluation.metrics}
          domains={domains}
          collapsedDomainIds={collapsedDomainIds}
          onToggleDomain={handleToggleDomain}
          onManageDomain={handleOpenDomainManager}
          overriddenIds={overriddenIds}
          selectedId={primarySelectedId ?? ''}
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
          onOpenBreakdown={openBreakdownEditor}
          onToggleBreakdown={handleToggleBreakdown}
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
          onAddMetric={() => openCreateEditor()}
          onUndo={undo}
          onRedo={redo}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          scale={transform.scale}
          connectionModeActive={connectionMode}
          onToggleConnectionMode={() => {
            setConnectionMode((active) => !active);
            setNotice('Протяните линию из любого порта исходной метрики в целевую карточку — откроется Formula Composer.');
          }}
          edgeLineStyle={edgeLineStyle}
          onEdgeLineStyleChange={setEdgeLineStyle}
          onGroupSelected={handleOpenGroupDialog}
          canGroup={canGroupSelection}
          onManageDomains={() => handleOpenDomainManager()}
        />

        {notice ? (
          <button
            data-canvas-interactive="true"
            onClick={() => setNotice(null)}
            className="absolute left-1/2 top-[3.75rem] z-40 max-w-[36rem] -translate-x-1/2 cursor-pointer rounded-[var(--radius-lg)] border border-border bg-card px-[0.75rem] py-[0.5rem] text-left text-[0.6875rem] text-foreground shadow-lg"
            title="Закрыть"
          >
            {notice}
          </button>
        ) : null}

        <NodeEditor
          open={Boolean(editor)}
          mode={editor?.mode ?? 'create'}
          draft={editor?.draft ?? defaultMetricDraft()}
          domains={domains}
          onChange={(draft) => {
            setEditor((current) => current ? { ...current, draft } : current);
            setEditorError(null);
          }}
          onSave={handleSaveMetric}
          onCancel={() => {
            setEditor(null);
            setFormulaOpen(false);
            setEditorError(null);
          }}
          onCreateDomain={() => handleOpenDomainManager()}
          onOpenFormula={() => setFormulaOpen(true)}
          aliasError={editorAliasError}
          formulaError={editor?.draft.valueMode === 'formula' ? formulaPreview.errors[0] : undefined}
          formError={editorError ?? undefined}
          managedByBreakdown={Boolean(editor?.metricId && model.breakdowns?.[editor.metricId])}
        />

        <MetricBreakdownEditor
          open={Boolean(breakdownEditorMetricId)}
          metric={breakdownEditorMetricId ? evaluation.metrics[breakdownEditorMetricId] ?? null : null}
          breakdown={breakdownEditorMetricId ? model.breakdowns?.[breakdownEditorMetricId] : undefined}
          metrics={evaluation.metrics}
          onSave={handleSaveBreakdown}
          onRemove={breakdownEditorMetricId && model.breakdowns?.[breakdownEditorMetricId]
            ? handleRemoveBreakdown
            : undefined}
          onClose={() => setBreakdownEditorMetricId(null)}
        />

        <FormulaComposer
          open={Boolean(editor && formulaOpen)}
          metricName={editor?.draft.name || 'Новая метрика'}
          metricAlias={editor?.draft.alias}
          source={editor?.draft.formulaSource ?? ''}
          aliases={Object.values(model.metrics)
            .filter((metric) => metric.id !== editor?.metricId)
            .map((metric) => ({
              id: metric.id,
              alias: metric.alias,
              name: metric.name,
              unitSymbol: metric.unit.symbol,
            }))}
          preview={formulaPreview}
          onSourceChange={(formulaSource) => setEditor((current) => current
            ? {
                ...current,
                draft: { ...current.draft, valueMode: 'formula', formulaSource },
              }
            : current)}
          onSave={() => setFormulaOpen(false)}
          onCancel={() => setFormulaOpen(false)}
        />

        <DomainManager
          open={domainManagerOpen}
          domains={domains}
          metrics={model.metrics}
          selectedMetricIds={selectedIds}
          initialDomainId={domainManagerInitialId}
          onClose={() => setDomainManagerOpen(false)}
          onCreateDomain={handleCreateDomain}
          onRenameDomain={handleRenameDomain}
          onDeleteDomain={handleDeleteDomain}
          onAssignMetrics={(domainId, ids) => updateDomainMembership(domainId, ids, true)}
          onUnassignMetrics={(domainId, ids) => updateDomainMembership(domainId, ids, false)}
        />

        <VisualGroupDialog
          open={Boolean(visualGroupEditor)}
          mode={visualGroupEditor?.mode ?? 'create'}
          initialName={groupBeingEdited?.name}
          initialColor={groupBeingEdited?.color}
          onSave={handleSaveVisualGroup}
          onClose={() => setVisualGroupEditor(null)}
        />
      </div>

      {metricMenu ? (
        <div
          data-canvas-interactive="true"
          className="fixed z-[80] w-[13rem] rounded-[var(--radius-lg)] border border-border bg-card p-[0.25rem] shadow-xl"
          style={{ left: metricMenu.x, top: metricMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button onClick={() => openEditEditor(metricMenu.id)} className="context-action">
            Редактировать метрику
          </button>
          {!model.breakdowns?.[metricMenu.id] ? (
            <button onClick={() => openEditEditor(metricMenu.id, true)} className="context-action">
              Открыть формулу
            </button>
          ) : null}
          {canHaveMetricBreakdown(model.metrics[metricMenu.id]) ? (
            <button onClick={() => openBreakdownEditor(metricMenu.id)} className="context-action">
              {model.breakdowns?.[metricMenu.id] ? 'Открыть состав метрики' : 'Создать состав метрики'}
            </button>
          ) : null}
          {model.breakdowns?.[metricMenu.id] ? (
            <button onClick={() => handleToggleBreakdown(metricMenu.id)} className="context-action">
              {model.breakdowns[metricMenu.id].expanded ? 'Свернуть состав' : 'Развернуть состав на Canvas'}
            </button>
          ) : null}
          {model.activeNorthStarId === metricMenu.id ? (
            <button
              onClick={() => {
                commitModel((current) => ({ ...current, activeNorthStarId: null }));
                setMetricMenu(null);
              }}
              className="context-action"
            >
              Убрать North Star
            </button>
          ) : (
            <button
              onClick={() => {
                handleSetNorthStar(metricMenu.id);
                setMetricMenu(null);
              }}
              className="context-action"
            >
              Сделать North Star
            </button>
          )}
          <button onClick={() => handleDeleteMetric(metricMenu.id)} className="context-action text-red-600">
            Удалить метрику
          </button>
        </div>
      ) : null}

      {canvasMenu ? (
        <CanvasContextMenu
          x={canvasMenu.x}
          y={canvasMenu.y}
          onCreateMetric={() => openCreateEditor(canvasMenu.point)}
        />
      ) : null}

      {groupMenu ? (
        <div
          data-canvas-interactive="true"
          className="fixed z-[80] w-[12rem] rounded-[var(--radius-lg)] border border-border bg-card p-[0.25rem] shadow-xl"
          style={{ left: groupMenu.x, top: groupMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              setVisualGroupEditor({ mode: 'edit', groupId: groupMenu.id });
              setGroupMenu(null);
            }}
            className="context-action"
          >
            <Pencil className="mr-[0.375rem] inline size-[0.6875rem]" />
            Изменить группу
          </button>
          <button onClick={() => handleDeleteVisualGroup(groupMenu.id)} className="context-action text-red-600">
            Разгруппировать
          </button>
        </div>
      ) : null}
    </div>
  );
}
