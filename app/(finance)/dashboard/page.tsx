"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFinanceAppContext } from "@/components/finance/finance-app-provider";
import { compactCurrency, formatCurrency, formatDate } from "@/lib/finance/format";
import { budgetStatusMeta } from "@/lib/finance/presentation";
import { useFinanceData } from "@/lib/finance/use-finance-data";

function toDate(dateInput: string): Date {
  return new Date(`${dateInput}T00:00:00`);
}

type CashflowSignalDotProps = {
  cx?: number;
  cy?: number;
  payload?: {
    incomeSignal?: number;
    expenseSignal?: number;
  };
};

type CashflowRange = "weekly" | "monthly" | "yearly";

const cashflowRangeMeta: Record<
  CashflowRange,
  {
    title: string;
    periodLabel: string;
    scopeLabel: string;
  }
> = {
  weekly: {
    title: "Weekly",
    periodLabel: "This Week",
    scopeLabel: "last 7 days",
  },
  monthly: {
    title: "Monthly",
    periodLabel: "This Month",
    scopeLabel: "current month",
  },
  yearly: {
    title: "Yearly",
    periodLabel: "Last 12 Months",
    scopeLabel: "last 12 months",
  },
};

function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function CashflowSignalDot({ cx = 0, cy = 0, payload }: CashflowSignalDotProps) {
  const hasIncomeSignal = (payload?.incomeSignal ?? 0) > 0;
  const hasExpenseSignal = (payload?.expenseSignal ?? 0) > 0;

  if (!hasIncomeSignal && !hasExpenseSignal) {
    return null;
  }

  return (
    <g>
      {hasIncomeSignal ? (
        <polygon
          points={`${cx - 4.5},${cy - 15} ${cx + 4.5},${cy - 15} ${cx},${cy - 7}`}
          fill="#9fd8ff"
          opacity={0.95}
        />
      ) : null}
      {hasExpenseSignal ? (
        <polygon
          points={`${cx},${cy + 7} ${cx - 4.5},${cy + 15} ${cx + 4.5},${cy + 15}`}
          fill="#ff5f6a"
          opacity={0.95}
        />
      ) : null}
    </g>
  );
}

export default function DashboardPage() {
  const { mode, setMode } = useFinanceAppContext();
  const { dataset, snapshot, recentTransactions, walletNameById } = useFinanceData();
  const [cashflowRange, setCashflowRange] = useState<CashflowRange>("monthly");

  const budgetStatus = budgetStatusMeta[snapshot.budgetHealth.status];
  const dashboardTransactions = recentTransactions.slice(0, 40);
  const selectedRangeMeta = cashflowRangeMeta[cashflowRange];

  const cashflowTracker = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayLabelFormatter = new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
    });
    const monthLabelFormatter = new Intl.DateTimeFormat("id-ID", {
      month: "short",
    });

    const buckets: Array<{
      key: string;
      label: string;
      income: number;
      expense: number;
      incomeTransactions: number;
      expenseTransactions: number;
    }> = [];
    const bucketIndexMap = new Map<string, number>();

    if (cashflowRange === "weekly") {
      for (let offset = 6; offset >= 0; offset -= 1) {
        const date = new Date(today);
        date.setDate(today.getDate() - offset);
        const key = getDayKey(date);

        buckets.push({
          key,
          label: dayLabelFormatter.format(date).replace(".", ""),
          income: 0,
          expense: 0,
          incomeTransactions: 0,
          expenseTransactions: 0,
        });
        bucketIndexMap.set(key, buckets.length - 1);
      }
    } else if (cashflowRange === "monthly") {
      const year = today.getFullYear();
      const month = today.getMonth();
      const currentDay = today.getDate();

      for (let day = 1; day <= currentDay; day += 1) {
        const date = new Date(year, month, day);
        const key = getDayKey(date);

        buckets.push({
          key,
          label: String(day).padStart(2, "0"),
          income: 0,
          expense: 0,
          incomeTransactions: 0,
          expenseTransactions: 0,
        });
        bucketIndexMap.set(key, buckets.length - 1);
      }
    } else {
      for (let offset = 11; offset >= 0; offset -= 1) {
        const date = new Date(today.getFullYear(), today.getMonth() - offset, 1);
        const key = getMonthKey(date);

        buckets.push({
          key,
          label: monthLabelFormatter.format(date).replace(".", ""),
          income: 0,
          expense: 0,
          incomeTransactions: 0,
          expenseTransactions: 0,
        });
        bucketIndexMap.set(key, buckets.length - 1);
      }
    }

    for (const transaction of dataset.transactions) {
      const transactionDate = toDate(transaction.date);
      const bucketKey =
        cashflowRange === "yearly" ? getMonthKey(transactionDate) : getDayKey(transactionDate);
      const pointIndex = bucketIndexMap.get(bucketKey);

      if (pointIndex === undefined) {
        continue;
      }

      const point = buckets[pointIndex];
      if (!point) {
        continue;
      }

      if (transaction.type === "income") {
        point.income += transaction.amount;
        point.incomeTransactions += 1;
      } else {
        point.expense += transaction.amount;
        point.expenseTransactions += 1;
      }
    }

    const periodIncome = buckets.reduce((sum, point) => sum + point.income, 0);
    const periodExpense = buckets.reduce((sum, point) => sum + point.expense, 0);
    const openingNetWorthEstimate = snapshot.totalBalance - (periodIncome - periodExpense);
    const averageBucketFlow = (periodIncome + periodExpense) / Math.max(1, buckets.length);
    const signalThreshold = Math.max(10000, averageBucketFlow * 0.45);

    let runningNetWorth = openingNetWorthEstimate;
    const chartData = buckets.map((point) => {
      const previousNetWorth = runningNetWorth;
      const netFlow = point.income - point.expense;
      runningNetWorth += netFlow;
      const isUpTrend = runningNetWorth >= previousNetWorth;

      return {
        ...point,
        netFlow,
        netWorth: runningNetWorth,
        trendUp: isUpTrend ? runningNetWorth : null,
        trendDown: isUpTrend ? null : runningNetWorth,
        incomeSignal:
          point.incomeTransactions > 0 && point.income >= signalThreshold ? point.income : 0,
        expenseSignal:
          point.expenseTransactions > 0 && point.expense >= signalThreshold ? point.expense : 0,
      };
    });

    return {
      chartData,
      periodIncome,
      periodExpense,
      periodNet: periodIncome - periodExpense,
    };
  }, [cashflowRange, dataset.transactions, snapshot.totalBalance]);

  const budgetUsageRatio =
    snapshot.dailySafeBudget <= 0
      ? snapshot.todayPersonalSpending > 0
        ? 1.5
        : 0
      : snapshot.todayPersonalSpending / snapshot.dailySafeBudget;

  const budgetUsageWidth = Math.min(100, Math.round(budgetUsageRatio * 100));

  return (
    <>
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <article className="metric-card">
          <p className="stat-label">Real Balance</p>
          <p className="mt-2 text-xl font-semibold sm:text-2xl">
            {formatCurrency(snapshot.totalBalance)}
          </p>
          <p className="mt-1 text-xs text-(--ink-muted) sm:text-sm">Current balance across wallets</p>
        </article>
        <article className="metric-card">
          <p className="stat-label">Projected Balance</p>
          <p className="mt-2 text-xl font-semibold text-(--warning) sm:text-2xl">
            {formatCurrency(snapshot.projectedBalance)}
          </p>
          <p className="mt-1 text-xs text-(--ink-muted) sm:text-sm">After all planned routines</p>
        </article>
        <article className="metric-card">
          <p className="stat-label">Available Money</p>
          <p className="mt-2 text-xl font-semibold text-(--safe) sm:text-2xl">
            {formatCurrency(snapshot.availableMoney)}
          </p>
          <p className="mt-1 text-xs text-(--ink-muted) sm:text-sm">
            Living funds minus expenses from source wallets.
          </p>
        </article>
        <article className="metric-card">
          <p className="stat-label">Discipline Score</p>
          <p className="mt-2 text-xl font-semibold sm:text-2xl">{snapshot.disciplineScore}/100</p>
          <p className="mt-1 text-xs text-(--ink-muted) sm:text-sm">{snapshot.streakDays}-day discipline streak</p>
        </article>
      </section>

      <section className="glass-panel p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Wallet Snapshot</h2>
            <p className="text-sm text-(--ink-muted)">
              Balance distribution across wallets.
            </p>
          </div>
          <p className="text-sm font-semibold text-(--ink-muted)">
            Total {formatCurrency(snapshot.totalBalance)}
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {snapshot.walletDistribution.map((wallet) => (
            <article
              key={wallet.id}
              className="rounded-2xl border border-(--line) bg-(--surface-solid) p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{wallet.name}</p>
                <p className="text-sm font-semibold">{formatCurrency(wallet.balance)}</p>
              </div>
              <p className="mt-1 text-xs uppercase tracking-wide text-(--ink-soft)">
                {Math.round(wallet.share * 100)}% of total balance
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-(--line)">
                <div
                  className="h-full rounded-full bg-(--accent)"
                  style={{ width: `${Math.max(5, Math.round(wallet.share * 100))}%` }}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="glass-panel p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Cashflow Tracker</h2>
            <p className="text-sm text-(--ink-muted)">
              Market-style chart for net worth momentum, flow zones, and activity signals over
              {` ${selectedRangeMeta.scopeLabel}`}.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs font-semibold text-[#90abcb]">
            <div className="rounded-xl border border-(--line) bg-(--surface-solid) p-1">
              {(["weekly", "monthly", "yearly"] as const).map((rangeKey) => (
                <button
                  key={rangeKey}
                  type="button"
                  onClick={() => setCashflowRange(rangeKey)}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    cashflowRange === rangeKey
                      ? "bg-[radial-gradient(circle_at_20%_0%,#355f90_0%,#1e3857_55%,#13253b_100%)] text-[#d9ecff]"
                      : "text-(--ink-soft) hover:text-(--ink)"
                  }`}
                >
                  {cashflowRangeMeta[rangeKey].title}
                </button>
              ))}
            </div>
            <span className="inline-flex items-center gap-2">
              <span className="h-[3px] w-5 rounded-full bg-[#9fd8ff]" /> Up Trend
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-[3px] w-5 rounded-full bg-[#ff5f6a]" /> Down Trend
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 bg-[linear-gradient(180deg,#9fd8ff_50%,#ff5f6a_50%)] [clip-path:polygon(50%_0,0_100%,100%_100%)]" />
              Income/Expense Signals
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="h-72 rounded-2xl border border-[#24354f] bg-[radial-gradient(circle_at_20%_20%,#1f3350_0%,#0b1524_58%,#060c16_100%)] p-3 shadow-[inset_0_0_0_1px_rgba(122,162,201,0.08)] sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={cashflowTracker.chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                {cashflowTracker.chartData.slice(0, -1).map((point, index) => {
                  const nextPoint = cashflowTracker.chartData[index + 1];
                  if (!nextPoint) {
                    return null;
                  }

                  return (
                    <ReferenceArea
                      key={`zone-${point.label}`}
                      x1={point.label}
                      x2={nextPoint.label}
                      yAxisId="netWorth"
                      fill={
                        point.netFlow >= 0 ? "rgba(63, 136, 193, 0.16)" : "rgba(168, 56, 74, 0.15)"
                      }
                      strokeOpacity={0}
                    />
                  );
                })}
                <CartesianGrid vertical={false} stroke="rgba(160, 186, 215, 0.16)" strokeDasharray="4 4" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#9eb6d5", fontSize: 11 }}
                  axisLine={{ stroke: "rgba(154, 183, 215, 0.22)" }}
                  tickLine={false}
                  minTickGap={12}
                />
                <YAxis
                  yAxisId="netWorth"
                  orientation="right"
                  tickFormatter={(value) => compactCurrency(Number(value ?? 0))}
                  tick={{ fill: "#9eb6d5", fontSize: 11 }}
                  width={68}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ stroke: "rgba(176, 205, 236, 0.35)", strokeWidth: 1 }}
                  content={({ active, label, payload }) => {
                    if (!active || !payload || payload.length === 0) {
                      return null;
                    }

                    const point = payload[0]?.payload as
                      | {
                          income: number;
                          expense: number;
                          netFlow: number;
                          netWorth: number;
                        }
                      | undefined;

                    if (!point) {
                      return null;
                    }

                    return (
                      <div className="min-w-44 rounded-xl border border-[#2b3e57] bg-[#0a1320]/95 px-3 py-2 text-xs text-[#d7e8fb] shadow-xl">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#93adcd]">
                          Date {label}
                        </p>
                        <p className="mt-1 flex items-center justify-between gap-3">
                          <span>Income</span>
                          <span className="font-semibold text-[#9fd8ff]">{formatCurrency(point.income)}</span>
                        </p>
                        <p className="mt-1 flex items-center justify-between gap-3">
                          <span>Expense</span>
                          <span className="font-semibold text-[#ff8992]">{formatCurrency(point.expense)}</span>
                        </p>
                        <p className="mt-1 flex items-center justify-between gap-3">
                          <span>Net Flow</span>
                          <span
                            className={`font-semibold ${
                              point.netFlow >= 0 ? "text-[#9fd8ff]" : "text-[#ff8992]"
                            }`}
                          >
                            {point.netFlow >= 0 ? "+" : ""}
                            {formatCurrency(point.netFlow)}
                          </span>
                        </p>
                        <p className="mt-1 flex items-center justify-between gap-3 border-t border-[#2b3e57] pt-1.5">
                          <span>Net Worth</span>
                          <span className="font-semibold">{formatCurrency(point.netWorth)}</span>
                        </p>
                      </div>
                    );
                  }}
                />
                <Line
                  yAxisId="netWorth"
                  type="monotone"
                  dataKey="netWorth"
                  name="Net Worth"
                  stroke="rgba(211, 227, 246, 0.35)"
                  strokeWidth={1.2}
                  dot={<CashflowSignalDot />}
                  activeDot={{ r: 3, fill: "#e8f3ff", stroke: "#0f1a2b", strokeWidth: 1.2 }}
                />
                <Line
                  yAxisId="netWorth"
                  type="monotone"
                  dataKey="trendUp"
                  name="Up Trend"
                  stroke="#9fd8ff"
                  strokeWidth={2.4}
                  dot={false}
                />
                <Line
                  yAxisId="netWorth"
                  type="monotone"
                  dataKey="trendDown"
                  name="Down Trend"
                  stroke="#ff5f6a"
                  strokeWidth={2.4}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
            <div className="metric-card">
              <dt className="stat-label">Income {selectedRangeMeta.periodLabel}</dt>
              <dd className="mt-1 text-lg font-semibold text-(--safe)">
                {formatCurrency(cashflowTracker.periodIncome)}
              </dd>
            </div>
            <div className="metric-card">
              <dt className="stat-label">Expense {selectedRangeMeta.periodLabel}</dt>
              <dd className="mt-1 text-lg font-semibold text-(--over)">
                {formatCurrency(cashflowTracker.periodExpense)}
              </dd>
            </div>
            <div className="metric-card col-span-2 lg:col-span-1">
              <dt className="stat-label">Net Flow {selectedRangeMeta.periodLabel}</dt>
              <dd
                className={`mt-1 text-lg font-semibold ${
                  cashflowTracker.periodNet >= 0 ? "text-(--safe)" : "text-(--over)"
                }`}
              >
                {cashflowTracker.periodNet >= 0 ? "+" : ""}
                {formatCurrency(cashflowTracker.periodNet)}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="glass-panel p-5 sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-semibold">Recent Transactions</h2>
          <div className="flex items-center gap-3">
            <p className="text-sm text-(--ink-muted)">Latest income and expense activity.</p>
            <Link
              href="/all-transactions"
              className="rounded-xl border border-(--line) bg-white px-3 py-1.5 text-xs font-semibold text-(--ink-muted) hover:bg-(--surface-solid)"
            >
              View All
            </Link>
          </div>
        </div>

        <div className="mt-4 h-[24rem] space-y-3 overflow-y-auto pr-1 sm:h-[30rem]">
          {dashboardTransactions.length === 0 ? (
            <p className="text-sm text-(--ink-muted)">No transactions yet.</p>
          ) : (
            dashboardTransactions.map((transaction) => {
              const isIncome = transaction.type === "income";
              return (
                <article
                  key={transaction.id}
                  className="rounded-2xl border border-(--line) bg-(--surface-solid) p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{transaction.category}</p>
                      <p className="text-xs text-(--ink-muted)">
                        {formatDate(transaction.date)} -{" "}
                        {walletNameById[transaction.walletId] ?? transaction.walletId}
                      </p>
                    </div>
                    <p
                      className={`text-lg font-semibold ${
                        isIncome ? "text-(--safe)" : "text-(--over)"
                      }`}
                    >
                      {isIncome ? "+" : "-"}
                      {formatCurrency(transaction.amount)}
                    </p>
                  </div>
                  <p className="mt-2 text-xs uppercase tracking-wide text-(--ink-soft)">
                    {transaction.isPersonalSpending ? "Personal spending" : "Non-personal"}
                  </p>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="glass-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Smart Spending Limit</h2>
            <p className="text-sm text-(--ink-muted)">
              Adaptive budgeting with strict and flexible carry-forward modes.
            </p>
            <p className="mt-1 text-xs text-(--ink-soft)">
              {snapshot.isSpendingLimitWalletSelectionActive
                ? `Spending source: ${snapshot.spendingLimitSourceWalletCount} wallet(s) (${formatCurrency(snapshot.spendingLimitSourceBalance)}).`
                : "No spending source selected. Limit currently uses all wallet balances."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("strict")}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                mode === "strict"
                  ? "border-(--accent) bg-(--accent) text-white"
                  : "border-(--line) bg-white text-(--ink-muted)"
              }`}
            >
              Strict
            </button>
            <button
              type="button"
              onClick={() => setMode("flexible")}
              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                mode === "flexible"
                  ? "border-(--accent) bg-(--accent) text-white"
                  : "border-(--line) bg-white text-(--ink-muted)"
              }`}
            >
              Flexible
            </button>
            <span className={`chip ${budgetStatus.chipClass}`}>{budgetStatus.label}</span>
          </div>
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4 rounded-2xl border border-(--line) bg-(--surface-solid) p-4">
            <div className="flex items-center justify-between text-sm">
              <p className="text-(--ink-muted)">Today&apos;s personal spending</p>
              <p className="font-semibold">{formatCurrency(snapshot.todayPersonalSpending)}</p>
            </div>
            <div className="flex items-center justify-between text-sm">
              <p className="text-(--ink-muted)">Today&apos;s safe limit</p>
              <p className="font-semibold">{formatCurrency(snapshot.dailySafeBudget)}</p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-(--line)">
              <div
                className={`h-full rounded-full transition-all ${budgetStatus.barClass}`}
                style={{ width: `${budgetUsageWidth}%` }}
              />
            </div>
            <p className="text-sm text-(--ink-muted)">{snapshot.budgetHealth.message}</p>
          </div>

          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div className="metric-card">
              <dt className="stat-label">Daily Safe</dt>
              <dd className="mt-1 font-semibold">{formatCurrency(snapshot.dailySafeBudget)}</dd>
            </div>
            <div className="metric-card">
              <dt className="stat-label">Monthly Expenses</dt>
              <dd className="mt-1 font-semibold">{formatCurrency(snapshot.spendingLimitExpenses)}</dd>
            </div>
            <div className="metric-card">
              <dt className="stat-label">Carry Forward</dt>
              <dd className="mt-1 font-semibold">{formatCurrency(snapshot.carryForwardBudget)}</dd>
            </div>
            <div className="metric-card">
              <dt className="stat-label">Remaining Days</dt>
              <dd className="mt-1 font-semibold">{snapshot.remainingDays} days</dd>
            </div>
            <div className="metric-card">
              <dt className="stat-label">Locked Goals</dt>
              <dd className="mt-1 font-semibold">{formatCurrency(snapshot.lockedGoals)}</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}
