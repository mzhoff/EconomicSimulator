import {
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  Plus,
  Save,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import {
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  runMonthlyTimeline,
  type MonthlyTimelineRunResult,
  type PlannedInvestment,
} from '../../core/monthly-timeline';

export interface MonthlyTimelineDialogProps {
  open: boolean;
  modelName: string;
  sourceMetricName: string;
  horizonMonths: number;
  operatingCashFlow: number;
  investments: PlannedInvestment[];
  result: MonthlyTimelineRunResult;
  onSave: (config: {
    horizonMonths: number;
    investments: PlannedInvestment[];
  }) => void;
  onClose: () => void;
}

type TimelineView = 'chart' | 'table';

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 0,
});

const compactMoneyFormatter = new Intl.NumberFormat('ru-RU', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

function nextInvestmentId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatMoney(value: number): string {
  return moneyFormatter.format(value);
}

function paybackLabel(
  monthIndex: number | null,
  hasInvestments: boolean,
): string {
  if (monthIndex !== null) return `${monthIndex + 1}-й месяц`;
  return hasInvestments ? 'За горизонтом' : 'Нет CAPEX';
}

function MonthlyTimelineDialogContent({
  modelName,
  sourceMetricName,
  horizonMonths: initialHorizonMonths,
  operatingCashFlow,
  investments: initialInvestments,
  result,
  onSave,
  onClose,
}: Omit<MonthlyTimelineDialogProps, 'open'>) {
  const [horizonMonths, setHorizonMonths] = useState(initialHorizonMonths);
  const [investments, setInvestments] = useState<PlannedInvestment[]>(
    initialInvestments.map((investment) => ({ ...investment })),
  );
  const [view, setView] = useState<TimelineView>('chart');

  const horizonIsValid = Number.isInteger(horizonMonths)
    && horizonMonths >= 1
    && horizonMonths <= 600;
  const investmentsAreValid = investments.every((investment) => (
    Boolean(investment.name.trim())
    && Number.isInteger(investment.monthIndex)
    && investment.monthIndex >= 0
    && investment.monthIndex < horizonMonths
    && Number.isFinite(investment.amount)
    && investment.amount >= 0
  ));
  const canSave = horizonIsValid && investmentsAreValid;

  const previewResult = useMemo(() => {
    if (!canSave) return result;
    return runMonthlyTimeline({
      horizonMonths,
      operatingCashFlow,
      investments,
    });
  }, [
    canSave,
    horizonMonths,
    investments,
    operatingCashFlow,
    result,
  ]);

  const chartData = useMemo(
    () => previewResult.points.map((point) => ({
      ...point,
      month: point.monthIndex + 1,
      capexChart: -point.capexOutflow,
    })),
    [previewResult],
  );

  const lastPoint = previewResult.points.at(-1);
  const hasInvestments = investments.some((investment) => investment.amount > 0);
  const totalCapex = lastPoint?.cumulativeCapex ?? 0;

  const updateInvestment = (
    id: string,
    patch: Partial<PlannedInvestment>,
  ) => {
    setInvestments((current) => current.map((investment) => (
      investment.id === id ? { ...investment, ...patch } : investment
    )));
  };

  const addInvestment = () => {
    setInvestments((current) => [
      ...current,
      {
        id: nextInvestmentId(),
        name: `Вложение ${current.length + 1}`,
        monthIndex: 0,
        amount: 0,
        comment: '',
      },
    ]);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    onSave({
      horizonMonths,
      investments: investments.map((investment) => ({
        ...investment,
        name: investment.name.trim(),
        comment: investment.comment.trim(),
      })),
    });
  };

  return (
    <div
      data-canvas-interactive="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/20 p-[1rem] backdrop-blur-[1px]"
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`План окупаемости ${modelName}`}
        className="flex max-h-[calc(100vh-2rem)] w-[min(78rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card shadow-2xl"
        onSubmit={handleSubmit}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <header className="flex items-start justify-between gap-[1rem] border-b border-border px-[1.25rem] py-[0.875rem]">
          <div className="min-w-0">
            <div className="flex items-center gap-[0.5rem]">
              <CalendarClock className="size-[1rem] shrink-0 text-violet-600" />
              <h2
                className="truncate text-[0.9375rem] text-foreground"
                style={{ fontWeight: 650 }}
              >
                Окупаемость — {modelName}
              </h2>
            </div>
            <p className="mt-[0.1875rem] text-[0.6875rem] text-muted-foreground">
              Snapshot «{sourceMetricName}» повторяется каждый месяц; запланированные
              вложения уменьшают накопленный денежный результат.
            </p>
          </div>
          <button
            type="button"
            aria-label="Закрыть план окупаемости"
            onClick={onClose}
            className="flex size-[2rem] shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-[1rem]" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-[1.25rem] py-[1rem]">
          <div className="grid gap-[0.75rem] lg:grid-cols-[minmax(13rem,0.8fr)_minmax(0,3.2fr)]">
            <section className="rounded-[var(--radius-lg)] border border-border bg-secondary/25 p-[0.875rem]">
              <div className="flex items-center gap-[0.375rem] text-[0.75rem] text-foreground" style={{ fontWeight: 650 }}>
                <CircleDollarSign className="size-[0.875rem] text-emerald-600" />
                Параметры расчёта
              </div>
              <label className="mt-[0.75rem] block">
                <span className="mb-[0.25rem] block text-[0.625rem] text-muted-foreground">
                  Flow за месяц
                </span>
                <output className="block rounded-[var(--radius-md)] border border-border bg-card px-[0.75rem] py-[0.5rem] text-[0.8125rem] tabular-nums text-foreground">
                  {formatMoney(operatingCashFlow)}
                </output>
              </label>
              <label className="mt-[0.625rem] block">
                <span className="mb-[0.25rem] block text-[0.625rem] text-muted-foreground">
                  Горизонт, месяцев
                </span>
                <input
                  type="number"
                  min={1}
                  max={600}
                  step={1}
                  value={horizonMonths}
                  onChange={(event) => {
                    const next = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(next)) setHorizonMonths(next);
                  }}
                  className="field-input tabular-nums"
                />
              </label>
              {!horizonIsValid ? (
                <p className="mt-[0.375rem] text-[0.625rem] text-red-600">
                  Укажите целое число от 1 до 600.
                </p>
              ) : null}
            </section>

            <section className="grid grid-cols-2 gap-[0.5rem] lg:grid-cols-4">
              <SummaryCard
                label="Flow за месяц"
                value={formatMoney(operatingCashFlow)}
                tone="positive"
              />
              <SummaryCard
                label="CAPEX за горизонт"
                value={formatMoney(totalCapex)}
                tone="negative"
              />
              <SummaryCard
                label="Баланс к концу"
                value={formatMoney(lastPoint?.projectCashPosition ?? 0)}
                tone={(lastPoint?.projectCashPosition ?? 0) >= 0 ? 'positive' : 'negative'}
              />
              <SummaryCard
                label="Устойчивая окупаемость"
                value={paybackLabel(
                  previewResult.stablePaybackMonthIndex,
                  hasInvestments,
                )}
                tone="neutral"
                hint={previewResult.firstPaybackMonthIndex !== previewResult.stablePaybackMonthIndex
                  ? `Первый выход в плюс: ${paybackLabel(previewResult.firstPaybackMonthIndex, hasInvestments)}`
                  : undefined}
              />
            </section>
          </div>

          <section className="mt-[1rem] overflow-hidden rounded-[var(--radius-lg)] border border-border">
            <div className="flex items-start justify-between gap-[1rem] border-b border-border bg-secondary/45 px-[0.875rem] py-[0.625rem]">
              <div>
                <h3 className="text-[0.75rem] text-foreground" style={{ fontWeight: 650 }}>
                  План капитальных вложений
                </h3>
                <p className="mt-[0.125rem] text-[0.625rem] text-muted-foreground">
                  Месяц 1 — старт проекта. Повторные закупки можно поставить на любой следующий месяц.
                </p>
              </div>
              <button
                type="button"
                onClick={addInvestment}
                className="flex shrink-0 cursor-pointer items-center gap-[0.375rem] rounded-[var(--radius-md)] border border-violet-200 bg-violet-50 px-[0.625rem] py-[0.375rem] text-[0.6875rem] text-violet-700 hover:border-violet-400"
              >
                <Plus className="size-[0.75rem]" />
                Добавить вложение
              </button>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[58rem]">
                <div className="grid grid-cols-[6rem_minmax(12rem,1fr)_10rem_minmax(14rem,1.2fr)_2rem] items-center gap-[0.5rem] border-b border-border bg-secondary/25 px-[0.75rem] py-[0.5rem] text-[0.625rem] text-muted-foreground">
                  <span>Месяц</span>
                  <span>Название</span>
                  <span className="text-right">Сумма</span>
                  <span>Комментарий</span>
                  <span />
                </div>
                <div className="divide-y divide-border">
                  {investments.map((investment) => {
                    const monthIsInvalid = !Number.isInteger(investment.monthIndex)
                      || investment.monthIndex < 0
                      || investment.monthIndex >= horizonMonths;
                    return (
                      <div
                        key={investment.id}
                        className="grid grid-cols-[6rem_minmax(12rem,1fr)_10rem_minmax(14rem,1.2fr)_2rem] items-center gap-[0.5rem] px-[0.75rem] py-[0.625rem]"
                      >
                        <input
                          type="number"
                          min={1}
                          max={horizonMonths}
                          step={1}
                          value={investment.monthIndex + 1}
                          aria-label={`Месяц вложения ${investment.name}`}
                          onChange={(event) => {
                            const next = event.currentTarget.valueAsNumber;
                            if (Number.isFinite(next)) {
                              updateInvestment(investment.id, { monthIndex: next - 1 });
                            }
                          }}
                          className={`field-input text-right tabular-nums ${
                            monthIsInvalid ? 'border-red-400' : ''
                          }`}
                        />
                        <input
                          value={investment.name}
                          aria-label="Название капитального вложения"
                          placeholder="Например, первая партия станций"
                          onChange={(event) => updateInvestment(
                            investment.id,
                            { name: event.target.value },
                          )}
                          className="field-input"
                        />
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={investment.amount}
                          aria-label={`Сумма вложения ${investment.name}`}
                          onChange={(event) => {
                            const next = event.currentTarget.valueAsNumber;
                            if (Number.isFinite(next)) {
                              updateInvestment(investment.id, { amount: next });
                            }
                          }}
                          className="field-input text-right tabular-nums"
                        />
                        <input
                          value={investment.comment}
                          aria-label={`Комментарий к вложению ${investment.name}`}
                          placeholder="Необязательно"
                          onChange={(event) => updateInvestment(
                            investment.id,
                            { comment: event.target.value },
                          )}
                          className="field-input"
                        />
                        <button
                          type="button"
                          aria-label={`Удалить вложение ${investment.name}`}
                          title="Удалить вложение"
                          onClick={() => setInvestments((current) => (
                            current.filter((item) => item.id !== investment.id)
                          ))}
                          className="flex size-[2rem] cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="size-[0.75rem]" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                {investments.length === 0 ? (
                  <div className="px-[1rem] py-[1.5rem] text-center text-[0.6875rem] text-muted-foreground">
                    Вложений пока нет. Добавьте стартовый CAPEX, чтобы рассчитать окупаемость.
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="mt-[1rem] overflow-hidden rounded-[var(--radius-lg)] border border-border">
            <div className="flex items-center justify-between gap-[1rem] border-b border-border px-[0.875rem] py-[0.625rem]">
              <div>
                <h3 className="text-[0.75rem] text-foreground" style={{ fontWeight: 650 }}>
                  Динамика проекта
                </h3>
                <p className="mt-[0.125rem] text-[0.625rem] text-muted-foreground">
                  Все значения показаны после учёта потока и вложений соответствующего месяца.
                </p>
              </div>
              <div className="flex rounded-[var(--radius-lg)] bg-secondary p-[0.1875rem]">
                <ViewButton
                  active={view === 'chart'}
                  label="График"
                  icon={<BarChart3 className="size-[0.75rem]" />}
                  onClick={() => setView('chart')}
                />
                <ViewButton
                  active={view === 'table'}
                  label="Таблица"
                  icon={<Table2 className="size-[0.75rem]" />}
                  onClick={() => setView('table')}
                />
              </div>
            </div>

            {view === 'chart' ? (
              <div className="h-[24rem] px-[0.5rem] py-[0.875rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={chartData}
                    margin={{ top: 18, right: 24, bottom: 8, left: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 4" stroke="var(--border)" />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border)' }}
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      label={{
                        value: 'Месяц',
                        position: 'insideBottomRight',
                        offset: -3,
                        fontSize: 10,
                        fill: 'var(--muted-foreground)',
                      }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                      tickFormatter={(value: number) => compactMoneyFormatter.format(value)}
                    />
                    <Tooltip
                      labelFormatter={(month) => `${month}-й месяц`}
                      formatter={(value, name) => [
                        formatMoney(Number(value)),
                        name,
                      ]}
                      contentStyle={{
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-lg)',
                        background: 'var(--card)',
                        boxShadow: '0 12px 30px rgb(15 23 42 / 0.12)',
                        fontSize: '0.6875rem',
                      }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={7}
                      wrapperStyle={{ fontSize: '0.6875rem' }}
                    />
                    <ReferenceLine
                      y={0}
                      stroke="#64748b"
                      strokeDasharray="4 4"
                    />
                    {previewResult.stablePaybackMonthIndex !== null ? (
                      <ReferenceLine
                        x={previewResult.stablePaybackMonthIndex + 1}
                        stroke="#7c3aed"
                        strokeDasharray="4 3"
                        label={{
                          value: 'Окупаемость',
                          position: 'top',
                          fill: '#7c3aed',
                          fontSize: 10,
                        }}
                      />
                    ) : null}
                    <Bar
                      dataKey="operatingCashFlow"
                      name="Flow за месяц"
                      fill="#22c55e"
                      fillOpacity={0.42}
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="capexChart"
                      name="CAPEX"
                      fill="#ef4444"
                      fillOpacity={0.55}
                      radius={[0, 0, 2, 2]}
                    />
                    <Line
                      type="monotone"
                      dataKey="projectCashPosition"
                      name="Накопленный результат"
                      stroke="#7c3aed"
                      strokeWidth={2.25}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="max-h-[24rem] overflow-auto">
                <table className="w-full min-w-[58rem] border-collapse text-[0.6875rem]">
                  <thead className="sticky top-0 z-10 bg-secondary">
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-[0.75rem] py-[0.5rem] text-left" style={{ fontWeight: 500 }}>Месяц</th>
                      <th className="px-[0.75rem] py-[0.5rem] text-right" style={{ fontWeight: 500 }}>Flow</th>
                      <th className="px-[0.75rem] py-[0.5rem] text-right" style={{ fontWeight: 500 }}>CAPEX</th>
                      <th className="px-[0.75rem] py-[0.5rem] text-right" style={{ fontWeight: 500 }}>Накопленный CAPEX</th>
                      <th className="px-[0.75rem] py-[0.5rem] text-right" style={{ fontWeight: 500 }}>Накопленный Flow</th>
                      <th className="px-[0.75rem] py-[0.5rem] text-right" style={{ fontWeight: 500 }}>Баланс проекта</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previewResult.points.map((point) => (
                      <tr
                        key={point.monthIndex}
                        className="hover:bg-secondary/35"
                      >
                        <td className="px-[0.75rem] py-[0.5rem] text-foreground">
                          {point.monthIndex + 1}
                        </td>
                        <MoneyCell value={point.operatingCashFlow} />
                        <MoneyCell value={-point.capexOutflow} />
                        <MoneyCell value={point.cumulativeCapex} />
                        <MoneyCell value={point.cumulativeOperatingCashFlow} />
                        <MoneyCell
                          value={point.projectCashPosition}
                          emphasize
                        />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <footer className="flex items-center justify-between gap-[1rem] border-t border-border px-[1.25rem] py-[0.875rem]">
          <p className="max-w-[42rem] text-[0.625rem] leading-[1.4] text-muted-foreground">
            CAPEX учитывается целиком в выбранном месяце, а накопленный результат
            пересчитывается последовательно от месяца к месяцу.
          </p>
          <div className="flex shrink-0 items-center gap-[0.5rem]">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-[var(--radius-lg)] border border-border px-[0.875rem] py-[0.5rem] text-[0.75rem] text-muted-foreground hover:text-foreground"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="flex cursor-pointer items-center gap-[0.375rem] rounded-[var(--radius-lg)] bg-primary px-[1rem] py-[0.5rem] text-[0.75rem] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
              style={{ fontWeight: 600 }}
            >
              <Save className="size-[0.75rem]" />
              Сохранить план
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

export function MonthlyTimelineDialog(props: MonthlyTimelineDialogProps) {
  if (!props.open) return null;
  const resetKey = [
    props.modelName,
    props.horizonMonths,
    props.investments.map((investment) => (
      `${investment.id}:${investment.monthIndex}:${investment.amount}`
    )).join('|'),
  ].join(':');

  return (
    <MonthlyTimelineDialogContent
      key={resetKey}
      modelName={props.modelName}
      sourceMetricName={props.sourceMetricName}
      horizonMonths={props.horizonMonths}
      operatingCashFlow={props.operatingCashFlow}
      investments={props.investments}
      result={props.result}
      onSave={props.onSave}
      onClose={props.onClose}
    />
  );
}

function SummaryCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral';
  hint?: string;
}) {
  const toneClass = tone === 'positive'
    ? 'text-emerald-700'
    : tone === 'negative'
      ? 'text-red-700'
      : 'text-violet-700';
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-card px-[0.75rem] py-[0.625rem]">
      <div className="text-[0.625rem] text-muted-foreground">{label}</div>
      <div
        className={`mt-[0.25rem] text-[0.9375rem] tabular-nums ${toneClass}`}
        style={{ fontWeight: 700 }}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-[0.1875rem] text-[0.5625rem] text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ViewButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex cursor-pointer items-center gap-[0.3125rem] rounded-[var(--radius-md)] px-[0.625rem] py-[0.3125rem] text-[0.6875rem] ${
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
      style={{ fontWeight: active ? 600 : 450 }}
    >
      {icon}
      {label}
    </button>
  );
}

function MoneyCell({
  value,
  emphasize = false,
}: {
  value: number;
  emphasize?: boolean;
}) {
  const colorClass = emphasize
    ? value >= 0 ? 'text-emerald-700' : 'text-red-700'
    : 'text-foreground';
  return (
    <td
      className={`px-[0.75rem] py-[0.5rem] text-right tabular-nums ${colorClass}`}
      style={{ fontWeight: emphasize ? 650 : 450 }}
    >
      {formatMoney(value)}
    </td>
  );
}
