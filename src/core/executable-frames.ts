import type {
  DomainDef,
  ExecutableFrameDef,
  MetricDef,
  ModelState,
  MonthlyTimelineExecutionDef,
  PlannedInvestmentDef,
} from './model';

export const MONTHLY_TIMELINE_PROVENANCE_SOURCE = 'EconomicSimulator Monthly Timeline';

const SNAPSHOT_FRAME_ID = 'frame-monthly-snapshot';
const TIMELINE_FRAME_ID = 'frame-monthly-timeline';
const TIMELINE_DOMAIN_ID = 'timeline-results';

function uniqueId(preferred: string, occupied: Set<string>): string {
  if (!occupied.has(preferred)) {
    occupied.add(preferred);
    return preferred;
  }
  let suffix = 2;
  while (occupied.has(`${preferred}-${suffix}`)) suffix += 1;
  const id = `${preferred}-${suffix}`;
  occupied.add(id);
  return id;
}

function uniqueAlias(preferred: string, metrics: Record<string, MetricDef>): string {
  const occupied = new Set(Object.values(metrics).map((metric) => metric.alias));
  if (!occupied.has(preferred)) return preferred;
  let suffix = 2;
  while (occupied.has(`${preferred}_${suffix}`)) suffix += 1;
  return `${preferred}_${suffix}`;
}

function timelineMetric(
  model: ModelState,
  options: {
    id: string;
    alias: string;
    name: string;
    description: string;
    source: MetricDef;
    position: { x: number; y: number };
  },
): MetricDef {
  return {
    id: options.id,
    definitionId: `timeline.${options.id}`,
    name: options.name,
    alias: uniqueAlias(options.alias, model.metrics),
    description: options.description,
    behavior: 'stock',
    unit: options.source.unit,
    grain: options.source.grain,
    valueSource: 'observed',
    knowledgeStatus: 'derived',
    kind: 'observed',
    domain: 'results',
    domainIds: [TIMELINE_DOMAIN_ID],
    role: 'output',
    value: 0,
    provenance: {
      source: MONTHLY_TIMELINE_PROVENANCE_SOURCE,
      version: 'timeline-v1',
      confidence: 'high',
      comment: 'Значение рассчитывается помесячным runtime и не редактируется вручную.',
    },
    validationStatus: 'valid',
    validationMessages: [],
    position: options.position,
  };
}

function ensureTimelineDomain(
  domains: Record<string, DomainDef>,
  metricIds: string[],
): Record<string, DomainDef> {
  const existing = domains[TIMELINE_DOMAIN_ID];
  return {
    ...domains,
    [TIMELINE_DOMAIN_ID]: existing
      ? {
          ...existing,
          metricIds: [...new Set([...existing.metricIds, ...metricIds])],
        }
      : {
          id: TIMELINE_DOMAIN_ID,
          name: 'Окупаемость',
          color: '#7c3aed',
          description: 'Накопленные результаты помесячной модели окупаемости.',
          metricIds,
          order: Object.keys(domains).length,
          collapsed: false,
        },
  };
}

export function isMonthlyTimelineMetric(metric: MetricDef | undefined): boolean {
  return metric?.provenance.source === MONTHLY_TIMELINE_PROVENANCE_SOURCE;
}

export function addMetricIdsToSnapshotFrame(
  model: ModelState,
  metricIds: Iterable<string>,
): ModelState {
  const entries = Object.entries(model.executableFrames ?? {});
  const snapshotEntry = entries.find(([, frame]) => frame.execution.mode === 'monthly_snapshot');
  if (!snapshotEntry) return model;
  const [frameId, frame] = snapshotEntry;
  const nextMetricIds = [...new Set([
    ...frame.metricIds,
    ...[...metricIds].filter((metricId) => (
      Boolean(model.metrics[metricId]) && !isMonthlyTimelineMetric(model.metrics[metricId])
    )),
  ])];
  if (
    nextMetricIds.length === frame.metricIds.length
    && nextMetricIds.every((metricId, index) => metricId === frame.metricIds[index])
  ) {
    return model;
  }
  return {
    ...model,
    executableFrames: {
      ...(model.executableFrames ?? {}),
      [frameId]: { ...frame, metricIds: nextMetricIds },
    },
  };
}

export function synchronizeExecutableFrameMetricIds(model: ModelState): ModelState {
  const frames = model.executableFrames;
  if (!frames) return model;
  const timelineMetricIds = new Set(
    Object.values(frames)
      .filter((frame) => frame.execution.mode === 'monthly_timeline')
      .flatMap((frame) => frame.metricIds),
  );
  let assignedSnapshot = false;
  const executableFrames = Object.fromEntries(
    Object.entries(frames).map(([id, frame]) => {
      if (frame.execution.mode === 'monthly_snapshot' && !assignedSnapshot) {
        assignedSnapshot = true;
        return [
          id,
          {
            ...frame,
            metricIds: Object.keys(model.metrics)
              .filter((metricId) => !timelineMetricIds.has(metricId)),
          },
        ];
      }
      return [
        id,
        {
          ...frame,
          metricIds: frame.metricIds.filter((metricId) => Boolean(model.metrics[metricId])),
        },
      ];
    }),
  );
  return { ...model, executableFrames };
}

export function ensureMonthlyTimelineFrame(
  model: ModelState,
  sourceMetricId: string,
): { model: ModelState; frameId: string } {
  const existingTimeline = Object.values(model.executableFrames ?? {})
    .find((frame) => frame.execution.mode === 'monthly_timeline');
  if (existingTimeline) return { model, frameId: existingTimeline.id };

  const source = model.metrics[sourceMetricId];
  if (!source) throw new Error('Не найдена метрика денежного потока для Timeline.');
  if (source.behavior !== 'flow') {
    throw new Error('Для Timeline нужна Flow-метрика с результатом за месяц.');
  }
  if (source.grain.time !== 'month') {
    throw new Error('Для Timeline нужна Flow-метрика с месячной гранулярностью.');
  }
  if (!Object.keys(source.unit.dimensions).some((dimension) => dimension.startsWith('currency:'))) {
    throw new Error('Для модели окупаемости нужна денежная Flow-метрика.');
  }
  if (!Number.isFinite(source.value ?? 0) && !source.formula) {
    throw new Error('Источник Timeline должен иметь конечное значение.');
  }

  const frameIds = new Set(Object.keys(model.executableFrames ?? {}));
  const snapshot = Object.values(model.executableFrames ?? {})
    .find((frame) => frame.execution.mode === 'monthly_snapshot');
  const snapshotFrameId = snapshot?.id ?? uniqueId(SNAPSHOT_FRAME_ID, frameIds);
  const timelineFrameId = uniqueId(TIMELINE_FRAME_ID, frameIds);
  const metricIds = new Set(Object.keys(model.metrics));

  const cumulativeCapexId = uniqueId('timeline-cumulative-capex', metricIds);
  const cumulativeOperatingCashFlowId = uniqueId('timeline-cumulative-operating-cash-flow', metricIds);
  const projectCashPositionId = uniqueId('timeline-project-cash-position', metricIds);
  const stockMetricIds = {
    cumulativeCapex: cumulativeCapexId,
    cumulativeOperatingCashFlow: cumulativeOperatingCashFlowId,
    projectCashPosition: projectCashPositionId,
  };

  const sourceMetrics = Object.values(model.metrics);
  const maxRight = sourceMetrics.length > 0
    ? Math.max(...sourceMetrics.map((metric) => metric.position.x + 300))
    : 300;
  const minTop = sourceMetrics.length > 0
    ? Math.max(80, Math.min(...sourceMetrics.map((metric) => metric.position.y)))
    : 100;
  const startX = maxRight + 260;
  const timelineMetrics: Record<string, MetricDef> = {
    [cumulativeCapexId]: timelineMetric(model, {
      id: cumulativeCapexId,
      alias: 'cumulative_capex',
      name: 'Накопленный CAPEX',
      description: 'Все капитальные вложения от старта до выбранного месяца.',
      source,
      position: { x: startX, y: minTop + 100 },
    }),
    [cumulativeOperatingCashFlowId]: timelineMetric(model, {
      id: cumulativeOperatingCashFlowId,
      alias: 'cumulative_operating_cash_flow',
      name: 'Накопленный денежный поток',
      description: 'Сумма месячных результатов денежной модели.',
      source,
      position: { x: startX + 340, y: minTop + 100 },
    }),
    [projectCashPositionId]: timelineMetric(model, {
      id: projectCashPositionId,
      alias: 'project_cash_position',
      name: 'Баланс проекта',
      description: 'Накопленный денежный поток за вычетом всех капитальных вложений.',
      source,
      position: { x: startX + 680, y: minTop + 100 },
    }),
  };
  const timelineMetricIdList = Object.keys(timelineMetrics);
  const nextMetrics = { ...model.metrics, ...timelineMetrics };

  const snapshotFrame: ExecutableFrameDef = snapshot
    ? {
        ...snapshot,
        metricIds: [...new Set([...snapshot.metricIds, sourceMetricId])],
      }
    : {
        id: snapshotFrameId,
        name: 'Денежный поток',
        description: 'Один расчётный срез модели за месяц.',
        color: '#64748b',
        metricIds: Object.keys(model.metrics),
        collapsed: false,
        execution: {
          mode: 'monthly_snapshot',
          outputMetricId: sourceMetricId,
        },
      };
  const timelineFrame: ExecutableFrameDef = {
    id: timelineFrameId,
    name: 'Окупаемость инвестиций',
    description: 'Помесячный план вложений и возврата капитала.',
    color: '#7c3aed',
    metricIds: timelineMetricIdList,
    collapsed: false,
    execution: {
      mode: 'monthly_timeline',
      sourceFrameId: snapshotFrameId,
      sourceMetricId,
      horizonMonths: 36,
      investments: [{
        id: 'initial-capex',
        name: 'Стартовый CAPEX',
        monthIndex: 0,
        amount: 0,
        comment: 'Станции, батареи, логистика и другие стартовые вложения.',
      }],
      stockMetricIds,
    },
  };

  return {
    frameId: timelineFrameId,
    model: {
      ...model,
      metrics: nextMetrics,
      domains: ensureTimelineDomain(model.domains, timelineMetricIdList),
      executableFrames: {
        ...(model.executableFrames ?? {}),
        [snapshotFrameId]: snapshotFrame,
        [timelineFrameId]: timelineFrame,
      },
    },
  };
}

export function updateMonthlyTimelineFrame(
  model: ModelState,
  frameId: string,
  update: {
    horizonMonths: number;
    investments: PlannedInvestmentDef[];
  },
): ModelState {
  const frame = model.executableFrames?.[frameId];
  if (!frame || frame.execution.mode !== 'monthly_timeline') return model;
  const execution: MonthlyTimelineExecutionDef = {
    ...frame.execution,
    horizonMonths: update.horizonMonths,
    investments: update.investments.map((investment) => ({ ...investment })),
  };
  return {
    ...model,
    executableFrames: {
      ...(model.executableFrames ?? {}),
      [frameId]: { ...frame, execution },
    },
  };
}
