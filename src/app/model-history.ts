import type { ModelState, WorkspaceDocument } from '../core/model';

export const MODEL_HISTORY_LIMIT = 50;

export type InputOverridesByScenario = WorkspaceDocument['inputOverridesByScenario'];

export interface ModelHistorySnapshot {
  model: ModelState;
  inputOverridesByScenario: InputOverridesByScenario;
}

export interface ModelHistoryState {
  past: ModelHistorySnapshot[];
  present: ModelHistorySnapshot;
  future: ModelHistorySnapshot[];
}

function pushPast(
  past: ModelHistorySnapshot[],
  snapshot: ModelHistorySnapshot,
): ModelHistorySnapshot[] {
  return [...past, snapshot].slice(-MODEL_HISTORY_LIMIT);
}

function overridesEqual(
  left: InputOverridesByScenario,
  right: InputOverridesByScenario,
): boolean {
  if (left === right) return true;
  const leftScenarios = Object.keys(left);
  const rightScenarios = Object.keys(right);
  if (leftScenarios.length !== rightScenarios.length) return false;
  return leftScenarios.every((scenarioId) => {
    const leftOverrides = left[scenarioId] ?? {};
    const rightOverrides = right[scenarioId] ?? {};
    const leftMetricIds = Object.keys(leftOverrides);
    const rightMetricIds = Object.keys(rightOverrides);
    return leftMetricIds.length === rightMetricIds.length
      && leftMetricIds.every((metricId) => (
        leftOverrides[metricId] === rightOverrides[metricId]
      ));
  });
}

function snapshotsEqual(
  left: ModelHistorySnapshot,
  right: ModelHistorySnapshot,
): boolean {
  return left.model === right.model
    && overridesEqual(left.inputOverridesByScenario, right.inputOverridesByScenario);
}

function sanitizeInputOverrides(
  model: ModelState,
  overridesByScenario: InputOverridesByScenario,
): InputOverridesByScenario {
  return Object.fromEntries(
    Object.entries(overridesByScenario).map(([scenarioId, overrides]) => [
      scenarioId,
      Object.fromEntries(
        Object.entries(overrides).filter(([metricId]) => {
          const metric = model.metrics[metricId];
          return Boolean(metric && !metric.formula);
        }),
      ),
    ]),
  );
}

/**
 * Presentation flags are persisted with the workspace, but they do not belong
 * to the user's model-edit history. Undoing data keeps the current view.
 */
export function preserveModelPresentation(
  target: ModelState,
  current: ModelState,
): ModelState {
  const domains = Object.fromEntries(
    Object.entries(target.domains).map(([id, domain]) => [
      id,
      current.domains[id]
        ? { ...domain, collapsed: current.domains[id].collapsed }
        : domain,
    ]),
  );
  const visualGroups = Object.fromEntries(
    Object.entries(target.visualGroups).map(([id, group]) => [
      id,
      current.visualGroups[id]
        ? { ...group, collapsed: current.visualGroups[id].collapsed }
        : group,
    ]),
  );
  const breakdowns = target.breakdowns
    ? Object.fromEntries(
        Object.entries(target.breakdowns).map(([id, breakdown]) => [
          id,
          current.breakdowns?.[id]
            ? { ...breakdown, expanded: current.breakdowns[id].expanded }
            : breakdown,
        ]),
      )
    : undefined;
  const hiddenMetricIds = (current.hiddenMetricIds ?? [])
    .filter((metricId) => Boolean(target.metrics[metricId]));

  return {
    ...target,
    domains,
    visualGroups,
    breakdowns,
    hiddenMetricIds,
  };
}

export function createModelHistory(
  model: ModelState,
  inputOverridesByScenario: InputOverridesByScenario,
): ModelHistoryState {
  return {
    past: [],
    present: { model, inputOverridesByScenario },
    future: [],
  };
}

export function commitModelHistory(
  current: ModelHistoryState,
  update: (model: ModelState) => ModelState,
): ModelHistoryState {
  const model = update(current.present.model);
  if (model === current.present.model) return current;
  return {
    past: pushPast(current.past, current.present),
    present: {
      model,
      inputOverridesByScenario: sanitizeInputOverrides(
        model,
        current.present.inputOverridesByScenario,
      ),
    },
    future: [],
  };
}

export function commitInputOverridesHistory(
  current: ModelHistoryState,
  update: (overrides: InputOverridesByScenario) => InputOverridesByScenario,
): ModelHistoryState {
  const inputOverridesByScenario = update(current.present.inputOverridesByScenario);
  if (overridesEqual(inputOverridesByScenario, current.present.inputOverridesByScenario)) {
    return current;
  }
  return {
    past: pushPast(current.past, current.present),
    present: { ...current.present, inputOverridesByScenario },
    future: [],
  };
}

export function updateInputOverridesWithoutHistory(
  current: ModelHistoryState,
  update: (overrides: InputOverridesByScenario) => InputOverridesByScenario,
): ModelHistoryState {
  const inputOverridesByScenario = update(current.present.inputOverridesByScenario);
  if (overridesEqual(inputOverridesByScenario, current.present.inputOverridesByScenario)) {
    return current;
  }
  return {
    ...current,
    present: { ...current.present, inputOverridesByScenario },
  };
}

export function finalizeTransientHistory(
  current: ModelHistoryState,
  start: ModelHistorySnapshot,
): ModelHistoryState {
  if (snapshotsEqual(start, current.present)) return current;
  return {
    past: pushPast(current.past, start),
    present: current.present,
    future: [],
  };
}

export function updateModelPresentationWithoutHistory(
  current: ModelHistoryState,
  update: (model: ModelState) => ModelState,
): ModelHistoryState {
  const model = update(current.present.model);
  if (model === current.present.model) return current;
  return {
    ...current,
    present: { ...current.present, model },
  };
}

export function undoModelHistory(current: ModelHistoryState): ModelHistoryState {
  const previous = current.past[current.past.length - 1];
  if (!previous) return current;
  return {
    past: current.past.slice(0, -1),
    present: {
      ...previous,
      model: preserveModelPresentation(previous.model, current.present.model),
    },
    future: [current.present, ...current.future].slice(0, MODEL_HISTORY_LIMIT),
  };
}

export function redoModelHistory(current: ModelHistoryState): ModelHistoryState {
  const next = current.future[0];
  if (!next) return current;
  return {
    past: pushPast(current.past, current.present),
    present: {
      ...next,
      model: preserveModelPresentation(next.model, current.present.model),
    },
    future: current.future.slice(1),
  };
}
