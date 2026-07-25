import { add, multiply, ref, subtract, sum } from './ast';
import { upsertMetricBreakdown } from './breakdowns';
import { MODEL_SCHEMA_VERSION } from './model';
import type {
  DomainDef,
  FormulaSpec,
  InputConfig,
  MetricBehavior,
  MetricDef,
  MetricDomain,
  MetricRole,
  ModelState,
  UnitSpec,
} from './model';
import {
  PERCENT,
  RENTAL,
  RUB,
  RUB_PER_RENTAL,
} from './units';

export const CASH_FLOW_MODEL_ID = 'tokberi-cash-flow';
export const LEGACY_TOKBERI_MODEL_ID = 'tokberi-station-unit-economics';

const provenance = {
  source: 'EconomicSimulator starter model',
  version: 'cash-flow-v1',
  confidence: 'medium' as const,
  comment: 'Минимальная стартовая модель; конечные входы будут декомпозироваться постепенно.',
};

const engineProvenance = {
  source: 'EconomicSimulator formula',
  version: 'cash-flow-v1',
  confidence: 'high' as const,
};

interface MetricOptions {
  id: string;
  name: string;
  description: string;
  behavior: MetricBehavior;
  unit: UnitSpec;
  value?: number;
  formula?: FormulaSpec;
  domain: MetricDomain;
  domainIds: string[];
  role: MetricRole;
  inputConfig?: InputConfig;
  position: { x: number; y: number };
}

function metric(options: MetricOptions): MetricDef {
  const derived = Boolean(options.formula);
  return {
    id: options.id,
    definitionId: `cash-flow.${options.id}`,
    name: options.name,
    alias: options.id,
    description: options.description,
    behavior: options.behavior,
    unit: options.unit,
    grain: { entity: 'station', time: 'month' },
    valueSource: derived ? 'derived' : 'input',
    knowledgeStatus: derived ? 'derived' : 'assumption',
    kind: derived ? 'derived' : 'assumption',
    domain: options.domain,
    domainIds: options.domainIds,
    role: options.role,
    value: derived ? null : options.value ?? 0,
    formula: options.formula,
    provenance: derived ? engineProvenance : provenance,
    validationStatus: 'valid',
    validationMessages: [],
    position: options.position,
    inputConfig: derived ? undefined : options.inputConfig,
  };
}

function formula(source: string, ast: FormulaSpec['ast']): FormulaSpec {
  return { source, ast };
}

const domainDefinitions: Record<string, Omit<DomainDef, 'metricIds'>> = {
  revenue: {
    id: 'revenue',
    name: 'Доходы',
    color: '#10b981',
    description: 'Поступления от аренды и их драйверы.',
    order: 0,
  },
  transactional_costs: {
    id: 'transactional_costs',
    name: 'Транзакционные расходы',
    color: '#f97316',
    description: 'Расходы, возникающие при проведении платежей.',
    order: 1,
  },
  infrastructure_costs: {
    id: 'infrastructure_costs',
    name: 'Инфраструктурные расходы',
    color: '#ef4444',
    description: 'Облачная, наземная и иная инфраструктура.',
    order: 2,
  },
  team_costs: {
    id: 'team_costs',
    name: 'Расходы на команду',
    color: '#e11d48',
    description: 'Оплата труда и рабочие инструменты.',
    order: 3,
  },
  results: {
    id: 'results',
    name: 'Итоги',
    color: '#8b5cf6',
    description: 'Сводные показатели денежного потока.',
    order: 4,
  },
};

function domainsFromMetrics(metrics: Record<string, MetricDef>): Record<string, DomainDef> {
  return Object.fromEntries(
    Object.entries(domainDefinitions).map(([id, definition]) => [
      id,
      {
        ...definition,
        metricIds: Object.values(metrics)
          .filter((item) => item.domainIds.includes(id))
          .map((item) => item.id),
      },
    ]),
  );
}

export function createCashFlowModel(): ModelState {
  const metricList = [
    metric({
      id: 'profit',
      name: 'Прибыль',
      description: 'Доходы за месяц минус все известные расходы.',
      behavior: 'flow',
      unit: RUB,
      formula: formula('total_revenue - total_cost', subtract(ref('total_revenue'), ref('total_cost'))),
      domain: 'results',
      domainIds: ['results'],
      role: 'north_star',
      position: { x: 820, y: 60 },
    }),
    metric({
      id: 'total_revenue',
      name: 'Доход от аренды',
      description: 'Средний доход с аренды, умноженный на количество аренд за месяц.',
      behavior: 'flow',
      unit: RUB,
      formula: formula(
        'avg_rental_revenue * total_rents',
        multiply(ref('avg_rental_revenue'), ref('total_rents')),
      ),
      domain: 'revenue',
      domainIds: ['revenue', 'results'],
      role: 'output',
      position: { x: 520, y: 300 },
    }),
    metric({
      id: 'total_cost',
      name: 'Расходы',
      description: 'Транзакционные, инфраструктурные расходы и расходы на команду.',
      behavior: 'flow',
      unit: RUB,
      formula: formula(
        'transactional_cost + infrastructure_cost + team_cost',
        sum([
          ref('transactional_cost'),
          ref('infrastructure_cost'),
          ref('team_cost'),
        ]),
      ),
      domain: 'results',
      domainIds: ['results'],
      role: 'output',
      position: { x: 1120, y: 300 },
    }),
    metric({
      id: 'avg_rental_revenue',
      name: 'Средний чек аренды',
      description: 'Средний доход с одной завершённой аренды.',
      behavior: 'rate',
      unit: RUB_PER_RENTAL,
      value: 250,
      domain: 'revenue',
      domainIds: ['revenue'],
      role: 'input',
      inputConfig: { min: 0, max: 5000, step: 10 },
      position: { x: 300, y: 560 },
    }),
    metric({
      id: 'total_rents',
      name: 'Количество аренд',
      description: 'Количество завершённых аренд за модельный месяц.',
      behavior: 'flow',
      unit: RENTAL,
      value: 45,
      domain: 'revenue',
      domainIds: ['revenue'],
      role: 'input',
      inputConfig: { min: 0, max: 10000, step: 1, integer: true },
      position: { x: 600, y: 560 },
    }),
    metric({
      id: 'transactional_cost',
      name: 'Транзакционные расходы',
      description: 'Комиссия платёжного шлюза от арендного дохода.',
      behavior: 'flow',
      unit: RUB,
      formula: formula(
        'total_revenue * payment_cost',
        multiply(ref('total_revenue'), ref('payment_cost')),
      ),
      domain: 'variable_costs',
      domainIds: ['transactional_costs'],
      role: 'intermediate',
      position: { x: 800, y: 560 },
    }),
    metric({
      id: 'infrastructure_cost',
      name: 'Инфраструктурные расходы',
      description: 'Суммарные облачные и наземные инфраструктурные расходы за месяц.',
      behavior: 'flow',
      unit: RUB,
      value: 600,
      domain: 'fixed_costs',
      domainIds: ['infrastructure_costs'],
      role: 'input',
      inputConfig: { min: 0, max: 1_000_000, step: 100 },
      position: { x: 1120, y: 560 },
    }),
    metric({
      id: 'team_cost',
      name: 'Расходы на команду',
      description: 'Фонд оплаты труда плюс стоимость рабочих инструментов.',
      behavior: 'flow',
      unit: RUB,
      formula: formula(
        'payroll_cost + work_tools_cost',
        add(ref('payroll_cost'), ref('work_tools_cost')),
      ),
      domain: 'fixed_costs',
      domainIds: ['team_costs'],
      role: 'intermediate',
      position: { x: 1440, y: 560 },
    }),
    metric({
      id: 'payment_cost',
      name: 'Комиссия платёжного шлюза',
      description: 'Доля дохода, удерживаемая платёжным провайдером.',
      behavior: 'rate',
      unit: PERCENT,
      value: 0.035,
      domain: 'variable_costs',
      domainIds: ['transactional_costs'],
      role: 'input',
      inputConfig: { min: 0, max: 0.2, step: 0.001 },
      position: { x: 800, y: 820 },
    }),
    metric({
      id: 'payroll_cost',
      name: 'Фонд оплаты труда',
      description: 'Все выплаты команде за месяц.',
      behavior: 'flow',
      unit: RUB,
      value: 0,
      domain: 'fixed_costs',
      domainIds: ['team_costs'],
      role: 'input',
      inputConfig: { min: 0, max: 5_000_000, step: 1000 },
      position: { x: 1300, y: 820 },
    }),
    metric({
      id: 'work_tools_cost',
      name: 'Инструменты для работы',
      description: 'Подписки, сервисы и другие инструменты команды за месяц.',
      behavior: 'flow',
      unit: RUB,
      value: 0,
      domain: 'fixed_costs',
      domainIds: ['team_costs'],
      role: 'input',
      inputConfig: { min: 0, max: 1_000_000, step: 100 },
      position: { x: 1580, y: 820 },
    }),
  ];

  const metrics = Object.fromEntries(metricList.map((item) => [item.id, item]));

  const model: ModelState = {
    schemaVersion: MODEL_SCHEMA_VERSION,
    id: CASH_FLOW_MODEL_ID,
    name: 'TokBeri — денежный поток',
    description: 'Минимальная месячная модель доходов, расходов и прибыли.',
    activeNorthStarId: 'profit',
    metrics,
    domains: domainsFromMetrics(metrics),
    visualGroups: {},
    breakdowns: {},
    hiddenMetricIds: [],
    scenarios: {
      base: {
        id: 'base',
        label: 'Base',
        description: 'Текущие рабочие допущения.',
        overrides: {},
      },
    },
    influenceRelations: [],
  };

  return upsertMetricBreakdown(model, 'payroll_cost', {
    template: 'quantity_rate',
    rows: [
      {
        id: 'frontend',
        name: 'Frontend-разработчик',
        comment: '',
        quantity: 1,
        rate: 100_000,
      },
      {
        id: 'backend',
        name: 'Backend-разработчик',
        comment: '',
        quantity: 1,
        rate: 100_000,
      },
    ],
  });
}
