export const MODEL_SCHEMA_VERSION = 2 as const;
export const LEGACY_MODEL_SCHEMA_VERSION = 1 as const;

export type MetricBehavior = 'stock' | 'flow' | 'rate' | 'one_off';
export type MetricKind = 'input' | 'derived' | 'observed' | 'assumption';
export type MetricDomain =
  | 'demand'
  | 'revenue'
  | 'variable_costs'
  | 'fixed_costs'
  | 'capex'
  | 'operations'
  | 'results';
export type MetricRole =
  | 'north_star'
  | 'driver'
  | 'intermediate'
  | 'output'
  | 'guardrail'
  | 'diagnostic'
  | 'input'
  | 'constraint';
export type ValueSource = 'input' | 'derived' | 'observed';
export type KnowledgeStatus = 'fact' | 'assumption' | 'scenario' | 'target' | 'benchmark' | 'derived';
export type ValidationStatus = 'valid' | 'warning' | 'error' | 'incomplete';
export type RelationType = 'calc' | 'influence';
export type CalculationOperation = 'direct' | 'add' | 'subtract' | 'multiply' | 'divide' | 'mixed';
export type CalculationDirection = 'positive' | 'negative' | 'neutral' | 'dynamic';

export interface UnitSpec {
  symbol: string;
  dimensions: Record<string, number>;
}

export interface Grain {
  entity: 'station' | 'location' | 'network' | 'rental' | 'event';
  time: 'none' | 'day' | 'month' | 'timestamp';
}

export interface Provenance {
  source: string;
  version: string;
  validFrom?: string;
  asOf?: string;
  confidence: 'low' | 'medium' | 'high';
  comment?: string;
}

export interface InputConfig {
  min: number;
  max: number;
  step: number;
  integer?: boolean;
}

export type BinaryOperator = 'add' | 'subtract' | 'multiply' | 'divide';
export type ComparisonOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq';

export type FormulaNode =
  | {
      type: 'literal';
      value: number;
      unit?: UnitSpec;
    }
  | {
      type: 'metric';
      metricId: string;
    }
  | {
      type: 'binary';
      operator: BinaryOperator;
      left: FormulaNode;
      right: FormulaNode;
    }
  | {
      type: 'unary';
      operator: 'negate' | 'abs' | 'round';
      operand: FormulaNode;
    }
  | {
      type: 'function';
      name: 'min' | 'max';
      args: FormulaNode[];
    }
  | {
      type: 'comparison';
      operator: ComparisonOperator;
      left: FormulaNode;
      right: FormulaNode;
    }
  | {
      type: 'conditional';
      condition: FormulaNode;
      whenTrue: FormulaNode;
      whenFalse: FormulaNode;
    };

export interface FormulaSpec {
  source: string;
  ast: FormulaNode;
}

export interface MetricDef {
  id: string;
  definitionId: string;
  name: string;
  alias: string;
  description: string;
  behavior: MetricBehavior;
  unit: UnitSpec;
  grain: Grain;
  valueSource: ValueSource;
  knowledgeStatus: KnowledgeStatus;
  kind: MetricKind;
  domain: MetricDomain;
  domainIds: string[];
  role: MetricRole;
  value: number | null;
  formula?: FormulaSpec;
  provenance: Provenance;
  validationStatus: ValidationStatus;
  validationMessages: string[];
  position: { x: number; y: number };
  inputConfig?: InputConfig;
}

export interface Scenario {
  id: string;
  label: string;
  description: string;
  overrides: Record<string, number>;
}

export interface CalculationRelation {
  from: string;
  to: string;
  type: 'calc';
  sign: number;
  operation: CalculationOperation;
  direction: CalculationDirection;
}

export interface InfluenceRelation {
  id: string;
  from: string;
  to: string;
  type: 'influence';
  sign: number;
  weight?: number;
  confidence: 'low' | 'medium' | 'high';
  source?: string;
}

export type Edge = CalculationRelation | InfluenceRelation;

export interface DomainDef {
  id: string;
  name: string;
  color: string;
  description: string;
  metricIds: string[];
  order: number;
  collapsed?: boolean;
}

export interface VisualGroupDef {
  id: string;
  name: string;
  color: string;
  metricIds: string[];
  collapsed: boolean;
}

export type MetricBreakdownTemplate = 'amount_list' | 'quantity_rate';

export interface MetricBreakdownRowDef {
  id: string;
  name: string;
  comment: string;
  amountMetricId?: string;
  amountSourceMetricId?: string;
  quantityMetricId?: string;
  quantitySourceMetricId?: string;
  rateMetricId?: string;
  rateSourceMetricId?: string;
}

export interface MetricBreakdownDef {
  id: string;
  resultMetricId: string;
  template: MetricBreakdownTemplate;
  rows: MetricBreakdownRowDef[];
  expanded: boolean;
}

export interface ModelState {
  schemaVersion: typeof MODEL_SCHEMA_VERSION;
  id: string;
  name: string;
  description: string;
  activeNorthStarId: string | null;
  metrics: Record<string, MetricDef>;
  domains: Record<string, DomainDef>;
  visualGroups: Record<string, VisualGroupDef>;
  breakdowns?: Record<string, MetricBreakdownDef>;
  scenarios: Record<string, Scenario>;
  influenceRelations: InfluenceRelation[];
}

export interface ViewportState {
  x: number;
  y: number;
  scale: number;
}

export interface WorkspaceDocument {
  schemaVersion: typeof MODEL_SCHEMA_VERSION;
  savedAt: string;
  model: ModelState;
  activeScenarioId: string;
  inputOverridesByScenario: Record<string, Record<string, number>>;
  viewport: ViewportState;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface MetricEvaluationError {
  metricId: string;
  code: 'cycle' | 'formula' | 'unit' | 'dependency' | 'guardrail';
  message: string;
}

export interface EvaluationResult {
  metrics: Record<string, MetricDef>;
  errors: MetricEvaluationError[];
  warnings: MetricEvaluationError[];
  order: string[];
}

export type Shock =
  | { kind: 'relative'; amount: number }
  | { kind: 'absolute'; amount: number }
  | { kind: 'percentage_points'; amount: number };

export interface ImpactResult {
  inputId: string;
  northStarId: string | null;
  beforeInput: number;
  afterInput: number;
  beforeNorthStar: number | null;
  afterNorthStar: number | null;
  deltas: Record<string, number>;
}

export interface ThresholdResult {
  inputId: string;
  targetMetricId: string;
  value: number | null;
  reached: boolean;
  iterations: number;
  message?: string;
}
