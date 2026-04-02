import {
  type BudgetHealth,
  type DailySpendingPoint,
  type FinanceSnapshot,
  type FinanceSnapshotInput,
} from "@/lib/finance/types";

const WARNING_MULTIPLIER = 1.15;
const MIN_STRICT_SAVINGS_RATE = 0.1;
const MAX_STRICT_SAVINGS_RATE = 0.2;
const DEFAULT_STRICT_SAVINGS_RATE = 0.15;

function toDate(dateInput: string): Date {
  return new Date(`${dateInput}T00:00:00`);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sumBy<T>(items: T[], pick: (item: T) => number): number {
  return items.reduce((sum, item) => sum + pick(item), 0);
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function isSameMonth(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth()
  );
}

function createBudgetHealth(todaySpending: number, safeLimit: number): BudgetHealth {
  if (safeLimit <= 0 && todaySpending <= 0) {
    return {
      status: "safe",
      pointsDelta: 8,
      message: "No spending room today, and you stayed disciplined.",
    };
  }

  if (safeLimit <= 0 && todaySpending > 0) {
    return {
      status: "over",
      pointsDelta: -10,
      message: "Safe balance is depleted. Prioritize essentials first.",
    };
  }

  if (todaySpending <= safeLimit) {
    return {
      status: "safe",
      pointsDelta: 8,
      message: "Today's spending is within the safe limit.",
    };
  }

  if (todaySpending <= safeLimit * WARNING_MULTIPLIER) {
    return {
      status: "warning",
      pointsDelta: -2,
      message: "Slightly above limit. Reduce discretionary spending.",
    };
  }

  return {
    status: "over",
    pointsDelta: -10,
    message: "High overspend. Use a recovery plan for the rest of the month.",
  };
}

export function calculateFinanceSnapshot({
  wallets,
  transactions,
  routineExpenses,
  goals,
  transfers,
  today = new Date(),
  mode = "flexible",
  softCapMultiplier = 2.2,
  strictSavingsRate = DEFAULT_STRICT_SAVINGS_RATE,
}: FinanceSnapshotInput): FinanceSnapshot {
  const referenceDay =
    typeof today === "string" ? startOfDay(toDate(today)) : startOfDay(today);

  const monthTransactions = transactions.filter((transaction) =>
    isSameMonth(toDate(transaction.date), referenceDay),
  );

  const monthlyIncome = sumBy(
    monthTransactions.filter((transaction) => transaction.type === "income"),
    (transaction) => transaction.amount,
  );

  const monthlyExpense = sumBy(
    monthTransactions.filter((transaction) => transaction.type === "expense"),
    (transaction) => transaction.amount,
  );

  const personalTransactions = monthTransactions.filter(
    (transaction) => transaction.type === "expense" && transaction.isPersonalSpending,
  );

  const personalSpending = sumBy(personalTransactions, (transaction) => transaction.amount);

  const todayPersonalSpending = sumBy(
    personalTransactions.filter((transaction) =>
      isSameDay(toDate(transaction.date), referenceDay),
    ),
    (transaction) => transaction.amount,
  );

  const totalBalance = sumBy(wallets, (wallet) => wallet.balance);

  const plannedRoutineTotal = sumBy(
    routineExpenses,
    (routineExpense) => routineExpense.plannedAmount,
  );

  const actualRoutineTotal = sumBy(
    routineExpenses.filter((routineExpense) => routineExpense.isDone),
    (routineExpense) => routineExpense.actualAmount ?? routineExpense.plannedAmount,
  );

  const remainingPlannedExpenses = sumBy(
    routineExpenses.filter((routineExpense) => !routineExpense.isDone),
    (routineExpense) => routineExpense.plannedAmount,
  );

  const walletBalanceById = Object.fromEntries(
    wallets.map((wallet) => [wallet.id, wallet.balance]),
  );

  const spendingLimitWallets = wallets.filter((wallet) => wallet.isSpendingLimitSource);
  const isSpendingLimitWalletSelectionActive = spendingLimitWallets.length > 0;
  const spendingLimitSourceWallets = isSpendingLimitWalletSelectionActive
    ? spendingLimitWallets
    : wallets;

  const spendingLimitSourceWalletIds = new Set(
    spendingLimitSourceWallets.map((wallet) => wallet.id),
  );

  const spendingLimitSourceBalance = sumBy(
    spendingLimitSourceWallets,
    (wallet) => wallet.balance,
  );

  const spendingLimitExpenses = sumBy(
    monthTransactions.filter(
      (transaction) =>
        transaction.type === "expense" && spendingLimitSourceWalletIds.has(transaction.walletId),
    ),
    (transaction) => transaction.amount,
  );

  const goalWalletIds = new Set(goals.map((goal) => goal.linkedWalletId));

  const lockedGoals = Array.from(goalWalletIds).reduce((sum, walletId) => {
    const walletBalance = walletBalanceById[walletId];
    return sum + Math.max(0, walletBalance ?? 0);
  }, 0);

  // Wallet balances are already net of recorded transactions, so subtracting monthly
  // expenses again would double-count outflows and understate available funds.
  const availableMoney = Math.max(0, spendingLimitSourceBalance);
  const normalizedStrictSavingsRate = clamp(
    strictSavingsRate,
    MIN_STRICT_SAVINGS_RATE,
    MAX_STRICT_SAVINGS_RATE,
  );
  const strictSavingsAmount =
    mode === "strict"
      ? Math.max(0, spendingLimitSourceBalance * normalizedStrictSavingsRate)
      : 0;
  const spendingBudgetPool =
    mode === "strict" ? Math.max(0, availableMoney - strictSavingsAmount) : availableMoney;

  const year = referenceDay.getFullYear();
  const month = referenceDay.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = referenceDay.getDate();
  const remainingDays = Math.max(1, daysInMonth - dayOfMonth + 1);

  const baseDailyBudget = Math.max(0, spendingBudgetPool / remainingDays);

  const carryForwardBudgetRaw =
    mode === "flexible" ? Math.max(0, availableMoney - baseDailyBudget) : 0;

  const carryForwardBudget = mode === "flexible" ? carryForwardBudgetRaw : 0;

  const dailySafeBudget =
    mode === "strict"
      ? baseDailyBudget
      : Math.min(
          availableMoney,
          baseDailyBudget + carryForwardBudgetRaw,
          baseDailyBudget * softCapMultiplier,
        );

  const spendingByDay = Array.from({ length: daysInMonth }, (_, index) => ({
    day: index + 1,
    amount: 0,
  }));

  for (const transaction of personalTransactions) {
    const txDay = toDate(transaction.date).getDate();
    const point = spendingByDay[txDay - 1];
    if (point) {
      point.amount += transaction.amount;
    }
  }

  const dailySpending: DailySpendingPoint[] = spendingByDay.map((point) => ({
    day: point.day,
    amount: point.amount,
    overLimit: point.amount > baseDailyBudget * WARNING_MULTIPLIER,
  }));

  let streakDays = 0;
  for (let dayCursor = dayOfMonth; dayCursor >= 1; dayCursor -= 1) {
    const spendingPoint = spendingByDay[dayCursor - 1];
    if (!spendingPoint) {
      break;
    }

    if (spendingPoint.amount <= baseDailyBudget) {
      streakDays += 1;
      continue;
    }

    break;
  }

  const monthlyOverDays = spendingByDay
    .slice(0, dayOfMonth)
    .filter((point) => point.amount > baseDailyBudget * WARNING_MULTIPLIER).length;

  const budgetHealth = createBudgetHealth(todayPersonalSpending, dailySafeBudget);

  const streakBonus = Math.min(18, streakDays * 2);
  const overdayPenalty = monthlyOverDays * 4;
  const statusPenalty =
    budgetHealth.status === "safe"
      ? 0
      : budgetHealth.status === "warning"
        ? 6
        : 14;

  const disciplineScore = clamp(
    Math.round(74 + streakBonus - overdayPenalty - statusPenalty),
    0,
    100,
  );

  const walletDistribution = wallets.map((wallet) => ({
    ...wallet,
    share: totalBalance <= 0 ? 0 : wallet.balance / totalBalance,
  }));

  const goalProgress = goals.map((goal) => ({
    ...goal,
    currentSaved: Math.max(0, walletBalanceById[goal.linkedWalletId] ?? 0),
    progressRatio:
      goal.targetAmount <= 0
        ? 0
        : clamp((Math.max(0, walletBalanceById[goal.linkedWalletId] ?? 0)) / goal.targetAmount, 0, 1),
    amountLeft: Math.max(0, goal.targetAmount - Math.max(0, walletBalanceById[goal.linkedWalletId] ?? 0)),
  }));

  const transferVolume = sumBy(
    transfers.filter((transfer) => isSameMonth(toDate(transfer.date), referenceDay)),
    (transfer) => transfer.amount,
  );

  return {
    totalBalance,
    projectedBalance: totalBalance - remainingPlannedExpenses,
    monthlyIncome,
    monthlyExpense,
    personalSpending,
    netCashflow: monthlyIncome - monthlyExpense,
    transferVolume,
    plannedRoutineTotal,
    actualRoutineTotal,
    remainingPlannedExpenses,
    lockedGoals,
    spendingLimitSourceBalance,
    spendingLimitExpenses,
    spendingLimitSourceWalletCount: spendingLimitSourceWallets.length,
    isSpendingLimitWalletSelectionActive,
    availableMoney,
    strictSavingsRate: normalizedStrictSavingsRate,
    strictSavingsAmount,
    spendingBudgetPool,
    remainingDays,
    baseDailyBudget,
    carryForwardBudget,
    dailySafeBudget,
    todayPersonalSpending,
    streakDays,
    disciplineScore,
    budgetHealth,
    walletDistribution,
    goalProgress,
    dailySpending,
  };
}
