import { describe, expect, it } from 'vitest';
import fixture from './fixtures/tokberi-base-station.json';
import { computeGraphFocus, computeImpact, computeTokBeriThresholds } from './analysis';
import { multiply, ref, sum } from './ast';
import { createBlankModel } from './builder';
import {
  breakdownChildMetricIds,
  collapsedBreakdownMetricIds,
  convertMetricBreakdownTemplate,
  hideMetricOnCanvas,
  metricBreakdownInputFromFormula,
  removeMetricBreakdown,
  showAllMetricsOnCanvas,
  structuralDescendantMetricIds,
  synchronizeMetricBreakdownFormulas,
  toggleMetricBreakdown,
  upsertMetricBreakdown,
} from './breakdowns';
import { CASH_FLOW_MODEL_ID, createCashFlowModel } from './cash-flow-template';
import { evaluateModel, getCalculationRelations, inferFormulaNode } from './evaluator';
import {
  assertUniqueMetricAlias,
  formatFormulaAst,
  parseFormula,
} from './formula-parser';
import { validateModelDocument } from './schema';
import {
  createWorkspaceDocument,
  BEHAVIOR_UPGRADE_BACKUP_KEY,
  BREAKDOWN_UPGRADE_BACKUP_KEY,
  CASH_FLOW_RESET_BACKUP_KEY,
  importWorkspace,
  LEGACY_WORKSPACE_STORAGE_KEY,
  loadWorkspace,
  MIGRATION_BACKUP_KEY,
  PREVIOUS_WORKSPACE_STORAGE_KEY,
  saveWorkspace,
  serializeWorkspace,
  UNIT_UPGRADE_BACKUP_KEY,
  WORKSPACE_STORAGE_KEY,
} from './storage';
import { createTokBeriModel } from './tokberi-template';
import { DAY, ITEM, RUB_PER_ITEM, unitsEqual } from './units';

describe('TokBeri reference model', () => {
  it('matches the trusted station fixture', () => {
    const model = createTokBeriModel();
    const result = evaluateModel(model);

    expect(result.errors).toEqual([]);
    for (const [id, expected] of Object.entries(fixture.expected)) {
      expect(result.metrics[id]?.value, id).toBeCloseTo(expected, 6);
    }
  });

  it('recalculates Weak, Base, Good and Hotspot scenarios', () => {
    const model = createTokBeriModel();
    const values = ['weak', 'base', 'good', 'hotspot'].map(
      (scenario) => evaluateModel(model, scenario).metrics.rental_revenue.value,
    );

    expect(values.every((value) => typeof value === 'number')).toBe(true);
    expect(values[0]!).toBeLessThan(values[1]!);
    expect(values[1]!).toBeLessThan(values[2]!);
    expect(values[2]!).toBeLessThan(values[3]!);
  });

  it('computes a downstream North Star impact for a relative shock', () => {
    const model = createTokBeriModel();
    const impact = computeImpact('rentals_per_day', model, 'base', {}, { kind: 'relative', amount: 0.1 });

    expect(impact).not.toBeNull();
    expect(impact!.afterInput).toBeCloseTo(1.65);
    expect(impact!.afterNorthStar!).toBeGreaterThan(impact!.beforeNorthStar!);
    expect(impact!.deltas.profit_before_tax).toBeGreaterThan(0);
  });

  it('finds break-even and 12/24 month payback thresholds', () => {
    const model = createTokBeriModel();
    const thresholds = computeTokBeriThresholds(model, 'base', {});

    expect(thresholds.breakEven.reached).toBe(true);
    expect(thresholds.payback12.reached).toBe(true);
    expect(thresholds.payback24.reached).toBe(true);
    expect(thresholds.breakEven.value!).toBeGreaterThan(0);
    expect(thresholds.payback12.value!).toBeGreaterThan(0);
    expect(thresholds.payback24.value!).toBeLessThan(thresholds.payback12.value!);
  });

  it('builds structure, focus, multi-select and analysis connection states', () => {
    const model = createTokBeriModel();

    const structure = computeGraphFocus(model, []);
    expect(structure.mode).toBe('structure');
    expect(structure.backboneEdges.has('cash_contribution-profit_before_tax')).toBe(true);
    expect(structure.backboneEdges.has('cash_contribution-payback_months')).toBe(false);

    const focus = computeGraphFocus(model, ['cash_contribution']);
    expect(focus.mode).toBe('focus');
    expect(focus.upstreamEdges.has('rental_revenue-cash_contribution')).toBe(true);
    expect(focus.downstreamEdges.has('cash_contribution-profit_before_tax')).toBe(true);

    const influenceFocus = computeGraphFocus(model, ['potential_demand']);
    expect(influenceFocus.directEdges.has('potential_demand-rentals_per_day')).toBe(true);

    const multi = computeGraphFocus(model, ['rentals_per_day', 'profit_before_tax']);
    expect(multi.mode).toBe('multi');
    expect(multi.hasCalculationPath).toBe(true);
    expect(multi.connectingEdges.has('successful_rentals-rental_revenue')).toBe(true);
    expect(multi.connectingEdges.has('cash_contribution-profit_before_tax')).toBe(true);

    const disconnected = computeGraphFocus(model, ['deposit_amount', 'profit_before_tax']);
    expect(disconnected.hasCalculationPath).toBe(false);

    const influenceOnly = computeGraphFocus(model, ['potential_demand', 'rentals_per_day']);
    expect(influenceOnly.hasCalculationPath).toBe(false);
    expect(influenceOnly.directEdges.has('potential_demand-rentals_per_day')).toBe(true);

    const analysis = computeGraphFocus(model, [], 'rentals_per_day');
    expect(analysis.mode).toBe('analysis');
    expect(analysis.analysisEdges.has('cash_contribution-profit_before_tax')).toBe(true);
  });
});

describe('minimal cash-flow starter model', () => {
  it('calculates revenue, expenses, profit and break-even from the simple graph', () => {
    const model = createCashFlowModel();
    const result = evaluateModel(model);
    const thresholds = computeTokBeriThresholds(model, 'base', {});

    expect(result.errors).toEqual([]);
    expect(result.metrics.total_revenue.value).toBeCloseTo(11_250);
    expect(result.metrics.transactional_cost.value).toBeCloseTo(393.75);
    expect(result.metrics.payroll_cost.value).toBeCloseTo(200_000);
    expect(result.metrics.total_cost.value).toBeCloseTo(200_993.75);
    expect(result.metrics.profit.value).toBeCloseTo(-189_743.75);
    expect(thresholds.breakEven.reached).toBe(true);
    expect(thresholds.breakEven.inputId).toBe('total_rents');
    expect(thresholds.breakEven.value).toBeCloseTo(831.5, 1);
  });

  it('keeps payroll rows as real metrics and expands or collapses them on Canvas', () => {
    const model = createCashFlowModel();
    const breakdown = model.breakdowns?.payroll_cost;

    expect(breakdown).toBeDefined();
    expect(breakdown?.template).toBe('quantity_rate');
    expect(breakdown?.rows.map((row) => row.name)).toEqual([
      'Frontend-разработчик',
      'Backend-разработчик',
    ]);
    expect(breakdownChildMetricIds(breakdown!)).toHaveLength(4);
    expect(evaluateModel(model).metrics.payroll_cost.value).toBeCloseTo(200_000);

    const expanded = toggleMetricBreakdown(model, 'payroll_cost');
    expect(expanded.breakdowns?.payroll_cost.expanded).toBe(true);
    expect(validateModelDocument(expanded)).toMatchObject({ ok: true });
  });

  it('saves item quantities and per-item rates without reverting them to people', () => {
    const source = createCashFlowModel();
    const withStationCost = upsertMetricBreakdown(source, 'infrastructure_cost', {
      template: 'quantity_rate',
      rows: [{
        id: 'stations',
        name: 'Станции',
        comment: '',
        quantity: 1_650,
        rate: 100,
      }],
    });
    const stationRow = withStationCost.breakdowns!.infrastructure_cost.rows[0];
    const quantityId = stationRow.quantityMetricId!;
    const rateId = stationRow.rateMetricId!;
    const editedUnits = structuredClone(withStationCost);
    editedUnits.metrics[quantityId].unit = ITEM;
    editedUnits.metrics[rateId].unit = RUB_PER_ITEM;
    const synchronized = synchronizeMetricBreakdownFormulas(editedUnits);

    const synchronizedEvaluation = evaluateModel(synchronized);
    expect(synchronizedEvaluation.errors).toEqual([]);
    expect(synchronizedEvaluation.metrics.infrastructure_cost.value).toBeCloseTo(165_000);
    expect(validateModelDocument(synchronized)).toMatchObject({ ok: true });

    const items = new Map<string, string>();
    const storage = {
      get length() { return items.size; },
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      key: (index: number) => [...items.keys()][index] ?? null,
      removeItem: (key: string) => { items.delete(key); },
      setItem: (key: string, value: string) => { items.set(key, value); },
    } satisfies Storage;

    expect(saveWorkspace(createWorkspaceDocument(synchronized), storage)).toMatchObject({ value: true });
    const restored = loadWorkspace(storage).value.model;
    expect(unitsEqual(restored.metrics[quantityId].unit, ITEM)).toBe(true);
    expect(unitsEqual(restored.metrics[rateId].unit, RUB_PER_ITEM)).toBe(true);
    expect(evaluateModel(restored).metrics.infrastructure_cost.value).toBeCloseTo(165_000);
  });

  it('supports a compact list of amounts and can safely return to a manual total', () => {
    const source = createCashFlowModel();
    const withInfrastructureRows = upsertMetricBreakdown(source, 'infrastructure_cost', {
      template: 'amount_list',
      rows: [
        { id: 'cloud', name: 'Облачная инфраструктура', comment: '', amount: 500 },
        { id: 'sim', name: 'SIM-карты', comment: '', amount: 700 },
      ],
    });

    expect(evaluateModel(withInfrastructureRows).metrics.infrastructure_cost.value).toBeCloseTo(1_200);
    expect(validateModelDocument(withInfrastructureRows)).toMatchObject({ ok: true });

    const removed = removeMetricBreakdown(withInfrastructureRows, 'infrastructure_cost', 1_200);
    expect(removed.breakdowns?.infrastructure_cost).toBeUndefined();
    expect(removed.metrics.infrastructure_cost.formula).toBeUndefined();
    expect(removed.metrics.infrastructure_cost.value).toBe(1_200);
    expect(validateModelDocument(removed)).toMatchObject({ ok: true });
  });

  it('supports nested breakdowns and collapses them as a metric tree', () => {
    const source = createCashFlowModel();
    const withInfrastructureRows = upsertMetricBreakdown(source, 'infrastructure_cost', {
      template: 'amount_list',
      rows: [
        { id: 'cloud', name: 'Облачная инфраструктура', comment: '', amount: 15_000 },
        { id: 'land', name: 'Наземная инфраструктура', comment: '', amount: 800 },
      ],
    });
    const infrastructureBreakdown = withInfrastructureRows.breakdowns!.infrastructure_cost;
    const cloudMetricId = infrastructureBreakdown.rows[0].amountMetricId!;
    const landMetricId = infrastructureBreakdown.rows[1].amountMetricId!;
    const withNestedCloud = upsertMetricBreakdown(withInfrastructureRows, cloudMetricId, {
      template: 'amount_list',
      rows: [
        { id: 'compute', name: 'Вычисления', comment: '', amount: 10_000 },
        { id: 'storage', name: 'Хранение данных', comment: '', amount: 5_000 },
      ],
    });
    const cloudChildMetricIds = breakdownChildMetricIds(
      withNestedCloud.breakdowns![cloudMetricId],
    );

    expect(evaluateModel(withNestedCloud).metrics[cloudMetricId].value).toBeCloseTo(15_000);
    expect(evaluateModel(withNestedCloud).metrics.infrastructure_cost.value).toBeCloseTo(15_800);
    expect(validateModelDocument(withNestedCloud)).toMatchObject({ ok: true });

    const parentExpanded = toggleMetricBreakdown(withNestedCloud, 'infrastructure_cost');
    const parentExpandedHidden = collapsedBreakdownMetricIds(parentExpanded);
    expect(parentExpandedHidden.has(cloudMetricId)).toBe(false);
    expect(parentExpandedHidden.has(landMetricId)).toBe(false);
    expect(cloudChildMetricIds.every((metricId) => !parentExpandedHidden.has(metricId))).toBe(true);

    expect(parentExpanded.breakdowns?.[cloudMetricId].expanded).toBe(true);
    const nestedCollapsed = toggleMetricBreakdown(parentExpanded, cloudMetricId);
    const nestedCollapsedHidden = collapsedBreakdownMetricIds(nestedCollapsed);
    expect(cloudChildMetricIds.every((metricId) => nestedCollapsedHidden.has(metricId))).toBe(true);

    const parentCollapsedAgain = toggleMetricBreakdown(nestedCollapsed, 'infrastructure_cost');
    const parentCollapsedHidden = collapsedBreakdownMetricIds(parentCollapsedAgain);
    expect(parentCollapsedHidden.has(cloudMetricId)).toBe(true);
    expect(parentCollapsedHidden.has(landMetricId)).toBe(true);
    expect(cloudChildMetricIds.every((metricId) => parentCollapsedHidden.has(metricId))).toBe(true);

    const reopenedTree = toggleMetricBreakdown(parentCollapsedAgain, 'infrastructure_cost');
    const reopenedHidden = collapsedBreakdownMetricIds(reopenedTree);
    expect(reopenedHidden.has(cloudMetricId)).toBe(false);
    expect(cloudChildMetricIds.every((metricId) => !reopenedHidden.has(metricId))).toBe(true);
    expect(reopenedTree.breakdowns?.[cloudMetricId].expanded).toBe(true);

    const evaluated = evaluateModel(withNestedCloud);
    const parentEdited = upsertMetricBreakdown(
      withNestedCloud,
      'infrastructure_cost',
      {
        template: 'amount_list',
        rows: infrastructureBreakdown.rows.map((row) => {
          const amountMetricId = row.amountMetricId!;
          return {
            id: row.id,
            name: row.name,
            comment: row.comment,
            amount: evaluated.metrics[amountMetricId].value ?? 0,
          };
        }),
      },
    );
    expect(parentEdited.breakdowns?.[cloudMetricId]).toBeDefined();
    expect(parentEdited.metrics[cloudMetricId].formula).toBeDefined();
    expect(evaluateModel(parentEdited).metrics.infrastructure_cost.value).toBeCloseTo(15_800);
    expect(validateModelDocument(parentEdited)).toMatchObject({ ok: true });
  });

  it('preserves quantity when switching a breakdown through the amount view', () => {
    const quantityRate = {
      template: 'quantity_rate' as const,
      rows: [{
        id: 'frontend',
        name: 'Frontend-разработчик',
        comment: '',
        quantity: 2,
        rate: 100_000,
      }],
    };

    const amountList = convertMetricBreakdownTemplate(quantityRate, 'amount_list');
    expect(amountList.rows[0]).toMatchObject({
      amount: 200_000,
      quantity: 2,
      rate: 100_000,
    });

    const restored = convertMetricBreakdownTemplate(amountList, 'quantity_rate');
    expect(restored.rows[0]).toMatchObject({ quantity: 2, rate: 100_000 });

    const editedAmount = {
      ...amountList,
      rows: [{ ...amountList.rows[0], amount: 240_000 }],
    };
    const recalculated = convertMetricBreakdownTemplate(editedAmount, 'quantity_rate');
    expect(recalculated.rows[0]).toMatchObject({ quantity: 2, rate: 120_000 });
  });

  it('reuses one quantity metric in several rows and keeps a real DAG dependency', () => {
    const source = createCashFlowModel();
    const developerCountId = source.breakdowns!.payroll_cost.rows[0].quantityMetricId!;
    const withSharedDeveloperCount = upsertMetricBreakdown(source, 'work_tools_cost', {
      template: 'quantity_rate',
      rows: [
        {
          id: 'chatgpt',
          name: 'ChatGPT',
          comment: '',
          quantity: 1,
          quantitySourceMetricId: developerCountId,
          rate: 9_000,
        },
        {
          id: 'figma',
          name: 'Figma',
          comment: '',
          quantity: 1,
          quantitySourceMetricId: developerCountId,
          rate: 3_000,
        },
      ],
    });

    const toolsBreakdown = withSharedDeveloperCount.breakdowns!.work_tools_cost;
    expect(toolsBreakdown.rows.map((row) => row.quantitySourceMetricId)).toEqual([
      developerCountId,
      developerCountId,
    ]);
    expect(toolsBreakdown.rows.every((row) => !row.quantityMetricId)).toBe(true);
    expect(breakdownChildMetricIds(toolsBreakdown)).toHaveLength(2);
    expect(evaluateModel(
      withSharedDeveloperCount,
      'base',
      { [developerCountId]: 2 },
    ).metrics.work_tools_cost.value).toBeCloseTo(24_000);
    expect(getCalculationRelations(withSharedDeveloperCount)).toContainEqual(expect.objectContaining({
      from: developerCountId,
      to: 'work_tools_cost',
      operation: 'multiply',
    }));
    expect(collapsedBreakdownMetricIds(withSharedDeveloperCount).has(developerCountId)).toBe(true);
    expect(validateModelDocument(withSharedDeveloperCount)).toMatchObject({ ok: true });

    const withDerivedTeamCounter = structuredClone(withSharedDeveloperCount);
    withDerivedTeamCounter.metrics.team_count = {
      ...withDerivedTeamCounter.metrics[developerCountId],
      id: 'team_count',
      definitionId: 'team_count',
      name: 'Количество разработчиков',
      alias: 'team_count',
      value: null,
      valueSource: 'derived',
      knowledgeStatus: 'derived',
      kind: 'derived',
      role: 'intermediate',
      formula: {
        source: withDerivedTeamCounter.metrics[developerCountId].alias,
        ast: ref(developerCountId),
      },
      position: { x: 0, y: 0 },
    };
    expect(collapsedBreakdownMetricIds(withDerivedTeamCounter).has(developerCountId)).toBe(true);

    const withExpandedTools = toggleMetricBreakdown(
      withSharedDeveloperCount,
      'work_tools_cost',
    );
    expect(collapsedBreakdownMetricIds(withExpandedTools).has(developerCountId)).toBe(false);

    const withoutPayrollTable = removeMetricBreakdown(
      withSharedDeveloperCount,
      'payroll_cost',
      200_000,
    );
    expect(withoutPayrollTable.metrics[developerCountId]).toBeDefined();
    expect(collapsedBreakdownMetricIds(withoutPayrollTable).has(developerCountId)).toBe(true);
    expect(collapsedBreakdownMetricIds(
      toggleMetricBreakdown(withoutPayrollTable, 'work_tools_cost'),
    ).has(developerCountId)).toBe(false);
    expect(validateModelDocument(withoutPayrollTable)).toMatchObject({ ok: true });
  });

  it('turns an existing sum formula into a compact table of metric references', () => {
    const source = createCashFlowModel();
    const suggested = metricBreakdownInputFromFormula(
      source.metrics.total_cost,
      source.metrics,
    );

    expect(suggested?.rows.map((row) => row.amountSourceMetricId)).toEqual([
      'transactional_cost',
      'infrastructure_cost',
      'team_cost',
    ]);

    const withTotalCostTable = upsertMetricBreakdown(source, 'total_cost', suggested!);
    expect(breakdownChildMetricIds(withTotalCostTable.breakdowns!.total_cost)).toEqual([]);
    expect(evaluateModel(withTotalCostTable).metrics.total_cost.value).toBeCloseTo(200_993.75);
    expect(validateModelDocument(withTotalCostTable)).toMatchObject({ ok: true });
  });

  it('keeps cross-domain calculation inputs outside a collapsible expense branch', () => {
    const source = createCashFlowModel();
    const input = metricBreakdownInputFromFormula(source.metrics.total_cost, source.metrics)!;
    const withExpenseTree = upsertMetricBreakdown(source, 'total_cost', input);
    const descendants = structuralDescendantMetricIds(withExpenseTree, 'total_cost');

    expect(descendants.has('transactional_cost')).toBe(true);
    expect(descendants.has('payment_cost')).toBe(true);
    expect(descendants.has('total_revenue')).toBe(false);

    const collapsed = collapsedBreakdownMetricIds(withExpenseTree);
    expect(collapsed.has('transactional_cost')).toBe(true);
    expect(collapsed.has('payment_cost')).toBe(true);
    expect(collapsed.has('total_revenue')).toBe(false);

    const expanded = toggleMetricBreakdown(withExpenseTree, 'total_cost');
    const expandedHidden = collapsedBreakdownMetricIds(expanded);
    expect(expandedHidden.has('transactional_cost')).toBe(false);
    expect(expandedHidden.has('payment_cost')).toBe(false);
    expect(expandedHidden.has('total_revenue')).toBe(false);
  });

  it('keeps a shared same-domain dependency outside either structural branch', () => {
    const source = structuredClone(createCashFlowModel());
    source.metrics.payment_cost_copy = {
      ...source.metrics.payment_cost,
      id: 'payment_cost_copy',
      definitionId: 'payment_cost_copy',
      name: 'Копия комиссии',
      alias: 'payment_cost_copy',
      value: null,
      valueSource: 'derived',
      kind: 'derived',
      knowledgeStatus: 'derived',
      formula: {
        source: 'payment_cost',
        ast: ref('payment_cost'),
      },
      position: { x: 0, y: 0 },
    };

    expect(
      structuralDescendantMetricIds(source, 'transactional_cost').has('payment_cost'),
    ).toBe(false);
    expect(
      structuralDescendantMetricIds(source, 'payment_cost_copy').has('payment_cost'),
    ).toBe(false);
  });

  it('hides a metric subtree manually and restores hidden descendants when their parent opens', () => {
    const source = createCashFlowModel();
    const input = metricBreakdownInputFromFormula(source.metrics.total_cost, source.metrics)!;
    const withExpenseTree = upsertMetricBreakdown(source, 'total_cost', input);
    const hiddenCommission = hideMetricOnCanvas(withExpenseTree, 'payment_cost');

    expect(hiddenCommission.hiddenMetricIds).toContain('payment_cost');
    expect(validateModelDocument(hiddenCommission)).toMatchObject({ ok: true });

    const expanded = toggleMetricBreakdown(hiddenCommission, 'total_cost');
    expect(expanded.hiddenMetricIds).not.toContain('payment_cost');
    expect(collapsedBreakdownMetricIds(
      expanded,
      new Set(expanded.hiddenMetricIds ?? []),
    ).has('payment_cost')).toBe(false);

    const hiddenBranch = hideMetricOnCanvas(expanded, 'transactional_cost');
    const hiddenBranchIds = collapsedBreakdownMetricIds(
      hiddenBranch,
      new Set(hiddenBranch.hiddenMetricIds ?? []),
    );
    expect(hiddenBranchIds.has('transactional_cost')).toBe(true);
    expect(hiddenBranchIds.has('payment_cost')).toBe(true);

    const restored = showAllMetricsOnCanvas(hiddenBranch);
    expect(restored.hiddenMetricIds).toEqual([]);
    expect(collapsedBreakdownMetricIds(restored).has('transactional_cost')).toBe(false);
  });

  it('collapses and restores an exclusive domainless formula driver with its expense branch', () => {
    const source = structuredClone(createCashFlowModel());
    source.metrics.partners_commissions = {
      ...source.metrics.payment_cost,
      id: 'partners_commissions',
      definitionId: 'partners_commissions',
      name: '% комиссии партнёров',
      alias: 'partners_commissions',
      domainIds: [],
      position: { x: 0, y: 0 },
    };
    source.metrics.partners_payments = {
      ...source.metrics.transactional_cost,
      id: 'partners_payments',
      definitionId: 'partners_payments',
      name: 'Выплаты партнёрам',
      alias: 'partners_payments',
      domainIds: ['transactional_costs'],
      formula: {
        source: 'partners_commissions * total_revenue',
        ast: multiply(ref('partners_commissions'), ref('total_revenue')),
      },
      position: { x: 0, y: 0 },
    };
    source.metrics.total_cost = {
      ...source.metrics.total_cost,
      formula: {
        source: 'transactional_cost + infrastructure_cost + team_cost + partners_payments',
        ast: sum([
          ref('transactional_cost'),
          ref('infrastructure_cost'),
          ref('team_cost'),
          ref('partners_payments'),
        ]),
      },
    };

    const input = metricBreakdownInputFromFormula(source.metrics.total_cost, source.metrics)!;
    const withPartnerBranch = upsertMetricBreakdown(source, 'total_cost', input);
    const paymentDescendants = structuralDescendantMetricIds(
      withPartnerBranch,
      'partners_payments',
    );
    const expenseDescendants = structuralDescendantMetricIds(withPartnerBranch, 'total_cost');

    expect(paymentDescendants.has('partners_commissions')).toBe(true);
    expect(paymentDescendants.has('total_revenue')).toBe(false);
    expect(expenseDescendants.has('partners_commissions')).toBe(true);
    expect(expenseDescendants.has('total_revenue')).toBe(false);

    const hiddenPayments = hideMetricOnCanvas(withPartnerBranch, 'partners_payments');
    expect(hiddenPayments.hiddenMetricIds).toEqual(expect.arrayContaining([
      'partners_payments',
      'partners_commissions',
    ]));
    expect(hiddenPayments.hiddenMetricIds).not.toContain('total_revenue');

    const hiddenCommission = hideMetricOnCanvas(withPartnerBranch, 'partners_commissions');
    const expandedExpenses = toggleMetricBreakdown(hiddenCommission, 'total_cost');
    expect(expandedExpenses.hiddenMetricIds).not.toContain('partners_commissions');
    expect(collapsedBreakdownMetricIds(
      expandedExpenses,
      new Set(expandedExpenses.hiddenMetricIds ?? []),
    ).has('partners_commissions')).toBe(false);
    expect(validateModelDocument(expandedExpenses)).toMatchObject({ ok: true });
  });
});

describe('schema, AST and DAG safety', () => {
  it('keeps min and max as real input guardrails while step remains a UI concern', () => {
    const model = structuredClone(createCashFlowModel());
    const input = Object.values(model.metrics).find(
      (metric) => !metric.formula && metric.inputConfig,
    );
    expect(input).toBeDefined();

    input!.value = input!.inputConfig!.max * 2 + 1;
    expect(validateModelDocument(model)).toMatchObject({ ok: false });

    input!.value = input!.inputConfig!.max;
    input!.inputConfig!.step = 0.001;
    expect(validateModelDocument(model)).toMatchObject({ ok: true });
  });

  it('rejects a calculation cycle', () => {
    const model = structuredClone(createTokBeriModel());
    model.metrics.cash_contribution.formula = parseFormula('profit_before_tax', model.metrics);

    const checked = validateModelDocument(model);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.issues.some((issue) => issue.message.includes('цикл'))).toBe(true);
  });

  it('rejects incompatible units', () => {
    const model = structuredClone(createTokBeriModel());
    model.metrics.profit_before_tax.formula = parseFormula(
      'cash_contribution + successful_rentals',
      model.metrics,
    );

    const checked = validateModelDocument(model);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.issues.some((issue) => issue.message.includes('Несовместимые единицы'))).toBe(true);
  });

  it('rejects a breakdown row whose quantity no longer has Stock semantics', () => {
    const model = structuredClone(createCashFlowModel());
    const quantityId = model.breakdowns!.payroll_cost.rows[0].quantityMetricId!;
    model.metrics[quantityId].behavior = 'flow';

    const checked = validateModelDocument(model);
    expect(checked.ok).toBe(false);
    if (!checked.ok) {
      expect(checked.issues.some((issue) => issue.message.includes('Stock-метрикой'))).toBe(true);
    }
  });

  it('allows One-off but still rejects Event in the arithmetic graph', () => {
    const validModel = structuredClone(createTokBeriModel());
    expect(validModel.metrics.delivery_cost.behavior).toBe('one_off');
    expect(validateModelDocument(validModel)).toMatchObject({ ok: true });

    const model = structuredClone(createTokBeriModel()) as unknown as Record<string, unknown>;
    const metrics = model.metrics as Record<string, Record<string, unknown>>;
    metrics.lost_units.behavior = 'event';
    const checked = validateModelDocument(model);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.issues.some((issue) => issue.path.endsWith('.behavior'))).toBe(true);
  });

  it('keeps CAPEX as Stock when One-off costs are added', () => {
    const model = createTokBeriModel();
    const oneOffSum = inferFormulaNode(
      parseFormula('delivery_cost + installation_cost', model.metrics).ast,
      model.metrics,
    );
    const totalCapex = inferFormulaNode(model.metrics.total_capex.formula!.ast, model.metrics);

    expect(oneOffSum.behavior).toBe('one_off');
    expect(totalCapex.behavior).toBe('stock');
    expect(evaluateModel(model).errors).toEqual([]);
  });

  it('does not mix One-off with Flow without an explicit Stock accumulator', () => {
    const model = createTokBeriModel();
    expect(() => inferFormulaNode(
      parseFormula('delivery_cost + sim_cost', model.metrics).ast,
      model.metrics,
    )).toThrow('Нельзя складывать one_off и flow');
  });

  it('round-trips formulas, scenarios and positions through JSON', () => {
    const workspace = createWorkspaceDocument(createTokBeriModel(), {
      activeScenarioId: 'good',
      inputOverridesByScenario: { good: { rentals_per_day: 4.5 } },
      viewport: { x: 120, y: 80, scale: 0.75 },
    });
    const imported = importWorkspace(serializeWorkspace(workspace));

    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.workspace.model.metrics.cash_contribution.formula).toEqual(
      workspace.model.metrics.cash_contribution.formula,
    );
    expect(imported.workspace.model.scenarios).toEqual(workspace.model.scenarios);
    expect(imported.workspace.model.metrics.profit_before_tax.position).toEqual(
      workspace.model.metrics.profit_before_tax.position,
    );
    expect(evaluateModel(imported.workspace.model, 'good', { rentals_per_day: 4.5 }).errors).toEqual([]);
  });
});

describe('universal builder schema v2', () => {
  it('creates a valid empty model without a forced North Star', () => {
    const model = createBlankModel('Пустая модель');
    expect(model.activeNorthStarId).toBeNull();
    expect(model.metrics).toEqual({});
    expect(validateModelDocument(model)).toMatchObject({ ok: true });
  });

  it('parses aliases with arithmetic precedence and stores metric ids in AST', () => {
    const model = createTokBeriModel();
    const formula = parseFormula(
      'rental_revenue - sim_cost * 2',
      model.metrics,
    );

    expect(formula.ast).toEqual({
      type: 'binary',
      operator: 'subtract',
      left: { type: 'metric', metricId: 'rental_revenue' },
      right: {
        type: 'binary',
        operator: 'multiply',
        left: { type: 'metric', metricId: 'sim_cost' },
        right: { type: 'literal', value: 2 },
      },
    });
  });

  it('round-trips duration literals used by editable formulas', () => {
    const model = createTokBeriModel();
    const formula = parseFormula('rentals_per_day * 30 days', model.metrics);

    expect(formula.ast).toEqual({
      type: 'binary',
      operator: 'multiply',
      left: { type: 'metric', metricId: 'rentals_per_day' },
      right: { type: 'literal', value: 30, unit: DAY },
    });
    expect(formatFormulaAst(formula.ast, model.metrics))
      .toBe('rentals_per_day * 30 days');

    model.metrics.successful_rentals.formula = formula;
    expect(evaluateModel(model).errors).toEqual([]);
  });

  it('keeps parsed formulas valid when an alias is renamed', () => {
    const model = structuredClone(createTokBeriModel());
    model.metrics.cash_contribution.formula = parseFormula(
      'rental_revenue - sim_cost',
      model.metrics,
    );
    model.metrics.rental_revenue.alias = 'monthly_rental_revenue';

    expect(formatFormulaAst(model.metrics.cash_contribution.formula.ast, model.metrics))
      .toBe('monthly_rental_revenue - sim_cost');
    expect(evaluateModel(model).metrics.cash_contribution.value).not.toBeNull();
  });

  it('rejects duplicate aliases with a readable error', () => {
    const model = structuredClone(createTokBeriModel());
    expect(() => assertUniqueMetricAlias(
      model.metrics.sim_cost.alias,
      model.metrics,
      model.metrics.maintenance_cost.id,
    )).toThrow('уже используется');

    model.metrics.maintenance_cost.alias = model.metrics.sim_cost.alias;
    const checked = validateModelDocument(model);
    expect(checked.ok).toBe(false);
    if (!checked.ok) expect(checked.issues.some((issue) => issue.message.includes('Alias'))).toBe(true);
  });

  it('derives operation and local direction metadata for calculation edges', () => {
    const model = structuredClone(createTokBeriModel());
    const advancedRelation = getCalculationRelations(model).find(
      (candidate) => candidate.from === 'rental_revenue' && candidate.to === 'contribution_margin',
    );
    expect(advancedRelation).toMatchObject({
      operation: 'mixed',
      direction: 'dynamic',
    });

    model.metrics.payback_months.formula = parseFormula(
      'total_capex / cash_contribution',
      model.metrics,
    );
    const relations = getCalculationRelations(model);
    const relation = (from: string, to: string) => relations.find(
      (candidate) => candidate.from === from && candidate.to === to,
    );

    expect(relation('cash_contribution', 'profit_before_tax')).toMatchObject({
      operation: 'direct',
      direction: 'positive',
      sign: 1,
    });
    expect(model.metrics.station_depreciation).toBeUndefined();
    expect(relation('successful_rentals', 'rental_revenue')).toMatchObject({
      operation: 'multiply',
      direction: 'positive',
    });
    expect(relation('cash_contribution', 'payback_months')).toMatchObject({
      operation: 'divide',
      direction: 'negative',
    });
  });

  it('migrates a saved v1 workspace with aliases, many-to-many domains and backup', () => {
    const v2 = createWorkspaceDocument(createTokBeriModel());
    const legacy = structuredClone(v2) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 1;
    const legacyModel = legacy.model as Record<string, unknown>;
    legacyModel.schemaVersion = 1;
    delete legacyModel.domains;
    delete legacyModel.visualGroups;
    const legacyMetrics = legacyModel.metrics as Record<string, Record<string, unknown>>;
    for (const metric of Object.values(legacyMetrics)) {
      delete metric.alias;
      delete metric.domainIds;
    }
    const serializedLegacy = JSON.stringify(legacy);
    const items = new Map<string, string>([[LEGACY_WORKSPACE_STORAGE_KEY, serializedLegacy]]);
    const storage = {
      get length() { return items.size; },
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      key: (index: number) => [...items.keys()][index] ?? null,
      removeItem: (key: string) => { items.delete(key); },
      setItem: (key: string, value: string) => { items.set(key, value); },
    } satisfies Storage;

    const loaded = loadWorkspace(storage);

    expect(loaded.warning).toContain('schema v2');
    expect(loaded.value.schemaVersion).toBe(2);
    expect(loaded.value.model.metrics.sim_cost.alias).toBe('sim_cost');
    expect(loaded.value.model.metrics.sim_cost.domainIds).toContain('fixed_costs');
    expect(loaded.value.model.domains.fixed_costs.metricIds).toContain('sim_cost');
    expect(loaded.value.model.metrics.delivery_cost.behavior).toBe('one_off');
    expect(storage.getItem(MIGRATION_BACKUP_KEY)).toBe(serializedLegacy);
    expect(storage.getItem(WORKSPACE_STORAGE_KEY)).not.toBeNull();
  });

  it('upgrades One-off behavior in an existing v2 workspace with backup', () => {
    const workspace = createWorkspaceDocument(createTokBeriModel());
    workspace.model.metrics.delivery_cost.behavior = 'stock';
    workspace.model.metrics.installation_cost.behavior = 'stock';
    const serialized = JSON.stringify(workspace);
    const items = new Map<string, string>([[WORKSPACE_STORAGE_KEY, serialized]]);
    const storage = {
      get length() { return items.size; },
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      key: (index: number) => [...items.keys()][index] ?? null,
      removeItem: (key: string) => { items.delete(key); },
      setItem: (key: string, value: string) => { items.set(key, value); },
    } satisfies Storage;

    const loaded = loadWorkspace(storage);

    expect(loaded.value.model.metrics.delivery_cost.behavior).toBe('one_off');
    expect(loaded.value.model.metrics.installation_cost.behavior).toBe('one_off');
    expect(loaded.value.model.metrics.total_capex.behavior).toBe('stock');
    expect(storage.getItem(BEHAVIOR_UPGRADE_BACKUP_KEY)).toBe(serialized);
    expect(loaded.warning).toContain('One-off');
  });

  it('upgrades legacy object-specific units in local storage with backup', () => {
    const workspace = createWorkspaceDocument(createTokBeriModel());
    workspace.model.metrics.potential_demand.unit = {
      symbol: 'аренд/день',
      dimensions: { 'count:rental': 1, 'time:day': -1 },
    };
    const serialized = JSON.stringify(workspace);
    const items = new Map<string, string>([[WORKSPACE_STORAGE_KEY, serialized]]);
    const storage = {
      get length() { return items.size; },
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      key: (index: number) => [...items.keys()][index] ?? null,
      removeItem: (key: string) => { items.delete(key); },
      setItem: (key: string, value: string) => { items.set(key, value); },
    } satisfies Storage;

    const loaded = loadWorkspace(storage);

    expect(loaded.value.model.metrics.potential_demand.unit.symbol).toBe('шт./дн.');
    expect(storage.getItem(UNIT_UPGRADE_BACKUP_KEY)).toBe(serialized);
    expect(loaded.warning).toContain('универсальные');
  });

  it('backs up the previous starter workspace before opening the cash-flow model', () => {
    const previous = JSON.stringify(createWorkspaceDocument(createTokBeriModel()));
    const items = new Map<string, string>([[PREVIOUS_WORKSPACE_STORAGE_KEY, previous]]);
    const storage = {
      get length() { return items.size; },
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      key: (index: number) => [...items.keys()][index] ?? null,
      removeItem: (key: string) => { items.delete(key); },
      setItem: (key: string, value: string) => { items.set(key, value); },
    } satisfies Storage;

    const loaded = loadWorkspace(storage);

    expect(loaded.value.model.id).toBe(CASH_FLOW_MODEL_ID);
    expect(loaded.value.model.metrics).toHaveProperty('profit');
    expect(loaded.value.model.metrics).not.toHaveProperty('payback_months');
    expect(storage.getItem(CASH_FLOW_RESET_BACKUP_KEY)).toBe(previous);
    expect(loaded.warning).toContain('минимальной моделью денежного потока');
  });

  it('upgrades an existing cash-flow payroll value into a tabular breakdown with backup', () => {
    const legacyModel = removeMetricBreakdown(createCashFlowModel(), 'payroll_cost', 240_000);
    const workspace = createWorkspaceDocument(legacyModel, {
      inputOverridesByScenario: { base: { payroll_cost: 240_000 } },
    });
    const serialized = JSON.stringify(workspace);
    const items = new Map<string, string>([[WORKSPACE_STORAGE_KEY, serialized]]);
    const storage = {
      get length() { return items.size; },
      clear: () => items.clear(),
      getItem: (key: string) => items.get(key) ?? null,
      key: (index: number) => [...items.keys()][index] ?? null,
      removeItem: (key: string) => { items.delete(key); },
      setItem: (key: string, value: string) => { items.set(key, value); },
    } satisfies Storage;

    const loaded = loadWorkspace(storage);
    const breakdown = loaded.value.model.breakdowns?.payroll_cost;

    expect(breakdown?.rows).toHaveLength(2);
    expect(evaluateModel(
      loaded.value.model,
      'base',
      loaded.value.inputOverridesByScenario.base,
    ).metrics.payroll_cost.value).toBeCloseTo(240_000);
    expect(storage.getItem(BREAKDOWN_UPGRADE_BACKUP_KEY)).toBe(serialized);
    expect(loaded.warning).toContain('табличный состав');
  });
});
