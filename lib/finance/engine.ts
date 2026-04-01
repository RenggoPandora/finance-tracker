import {
  type BudgetHealth,
  type DailySpendingPoint,
  type FinanceSnapshot,
  type FinanceSnapshotInput,
} from "@/lib/finance/types";

const WARNING_MULTIPLIER = 1.15;

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
      message: "Tidak ada ruang spending hari ini, dan kamu tetap disiplin.",
    };
  }

  if (safeLimit <= 0 && todaySpending > 0) {
    return {
      status: "over",
      pointsDelta: -10,
      message: "Saldo aman sudah habis. Prioritaskan kebutuhan wajib dulu.",
    };
  }

  if (todaySpending <= safeLimit) {
    return {
      status: "safe",
      pointsDelta: 8,
      message: "Spending hari ini masih dalam batas aman.",
    };
  }

  if (todaySpending <= safeLimit * WARNING_MULTIPLIER) {
    return {
      status: "warning",
      pointsDelta: -2,
      message: "Sedikit melewati limit. Kurangi spending discretionary.",
    };
  }

  return {
    status: "over",
    pointsDelta: -10,
    message: "Overspend tinggi. Perlu recovery plan untuk sisa bulan.",
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

  const spentBeforeToday = sumBy(
    personalTransactions.filter(
      (transaction) => toDate(transaction.date).getTime() < referenceDay.getTime(),
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

  const goalWalletIds = new Set(goals.map((goal) => goal.linkedWalletId));
  const lockedGoals = Array.from(goalWalletIds).reduce((sum, walletId) => {
    const walletBalance = walletBalanceById[walletId];
    return sum + Math.max(0, walletBalance ?? 0);
  }, 0);

  const availableMoney = totalBalance - remainingPlannedExpenses - lockedGoals;

  const year = referenceDay.getFullYear();
  const month = referenceDay.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = referenceDay.getDate();
  const elapsedDays = Math.max(0, dayOfMonth - 1);
  const remainingDays = Math.max(1, daysInMonth - dayOfMonth + 1);

  const baseDailyBudget = Math.max(0, availableMoney / remainingDays);

  const carryForwardBudgetRaw = Math.max(
    0,
    baseDailyBudget * elapsedDays - spentBeforeToday,
  );

  const carryForwardBudget = mode === "flexible" ? carryForwardBudgetRaw : 0;

  const dailySafeBudget =
    mode === "strict"
      ? baseDailyBudget
      : Math.min(
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
    availableMoney,
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
