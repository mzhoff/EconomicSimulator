export interface PlannedInvestment {
  id: string;
  name: string;
  monthIndex: number;
  amount: number;
  comment: string;
}

export interface MonthlyTimelineConfig {
  horizonMonths: number;
  operatingCashFlow: number;
  investments: PlannedInvestment[];
}

export interface MonthlyTimelinePoint {
  monthIndex: number;
  operatingCashFlow: number;
  capexOutflow: number;
  cumulativeCapex: number;
  cumulativeOperatingCashFlow: number;
  projectCashPosition: number;
}

export interface MonthlyTimelineResult {
  points: MonthlyTimelinePoint[];
  firstPaybackMonthIndex: number | null;
  stablePaybackMonthIndex: number | null;
}

export type MonthlyTimelineRunResult = MonthlyTimelineResult;

const MIN_HORIZON_MONTHS = 1;
const MAX_HORIZON_MONTHS = 600;

function validateConfig(config: MonthlyTimelineConfig): void {
  if (
    !Number.isInteger(config.horizonMonths)
    || config.horizonMonths < MIN_HORIZON_MONTHS
    || config.horizonMonths > MAX_HORIZON_MONTHS
  ) {
    throw new Error('Горизонт расчёта должен быть целым числом от 1 до 600 месяцев.');
  }

  if (!Number.isFinite(config.operatingCashFlow)) {
    throw new Error('Денежный поток за месяц должен быть конечным числом.');
  }

  for (const investment of config.investments) {
    if (
      !Number.isInteger(investment.monthIndex)
      || investment.monthIndex < 0
      || investment.monthIndex >= config.horizonMonths
    ) {
      throw new Error(
        `Месяц вложения «${investment.name || investment.id}» должен быть целым числом от 0 до ${config.horizonMonths - 1}.`,
      );
    }

    if (!Number.isFinite(investment.amount) || investment.amount < 0) {
      throw new Error(
        `Сумма вложения «${investment.name || investment.id}» должна быть конечным неотрицательным числом.`,
      );
    }
  }
}

export function runMonthlyTimeline(config: MonthlyTimelineConfig): MonthlyTimelineResult {
  validateConfig(config);

  const capexByMonth = new Array<number>(config.horizonMonths).fill(0);
  let firstCapexMonthIndex: number | null = null;

  for (const investment of config.investments) {
    capexByMonth[investment.monthIndex] += investment.amount;
    if (
      investment.amount > 0
      && (firstCapexMonthIndex === null || investment.monthIndex < firstCapexMonthIndex)
    ) {
      firstCapexMonthIndex = investment.monthIndex;
    }
  }

  let cumulativeCapex = 0;
  let cumulativeOperatingCashFlow = 0;
  const points: MonthlyTimelinePoint[] = [];

  for (let monthIndex = 0; monthIndex < config.horizonMonths; monthIndex += 1) {
    const capexOutflow = capexByMonth[monthIndex];
    cumulativeCapex += capexOutflow;
    cumulativeOperatingCashFlow += config.operatingCashFlow;

    points.push({
      monthIndex,
      operatingCashFlow: config.operatingCashFlow,
      capexOutflow,
      cumulativeCapex,
      cumulativeOperatingCashFlow,
      projectCashPosition: cumulativeOperatingCashFlow - cumulativeCapex,
    });
  }

  if (firstCapexMonthIndex === null) {
    return {
      points,
      firstPaybackMonthIndex: null,
      stablePaybackMonthIndex: null,
    };
  }

  const firstPaybackPoint = points.find(
    (point) => point.monthIndex >= firstCapexMonthIndex && point.projectCashPosition >= 0,
  );

  let stablePaybackMonthIndex: number | null = null;
  let allFuturePositionsAreNonNegative = true;

  for (let pointIndex = points.length - 1; pointIndex >= firstCapexMonthIndex; pointIndex -= 1) {
    allFuturePositionsAreNonNegative =
      allFuturePositionsAreNonNegative && points[pointIndex].projectCashPosition >= 0;
    if (allFuturePositionsAreNonNegative) {
      stablePaybackMonthIndex = points[pointIndex].monthIndex;
    }
  }

  return {
    points,
    firstPaybackMonthIndex: firstPaybackPoint?.monthIndex ?? null,
    stablePaybackMonthIndex,
  };
}
