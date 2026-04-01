"use client";

import { useMemo } from "react";
import { calculateFinanceSnapshot } from "@/lib/finance/engine";
import { useFinanceStore } from "@/lib/finance/store";

export function useFinanceData() {
  const mode = useFinanceStore((state) => state.mode);
  const wallets = useFinanceStore((state) => state.wallets);
  const transactions = useFinanceStore((state) => state.transactions);
  const routineExpenses = useFinanceStore((state) => state.routineExpenses);
  const goals = useFinanceStore((state) => state.goals);
  const transfers = useFinanceStore((state) => state.transfers);

  const dataset = useMemo(
    () => ({
      wallets,
      transactions,
      routineExpenses,
      goals,
      transfers,
    }),
    [wallets, transactions, routineExpenses, goals, transfers],
  );

  const snapshot = useMemo(
    () =>
      calculateFinanceSnapshot({
        ...dataset,
        today: new Date(),
        mode,
      }),
    [dataset, mode],
  );

  const recentTransactions = useMemo(
    () => [...transactions].sort((left, right) => right.date.localeCompare(left.date)),
    [transactions],
  );

  const recentTransfers = useMemo(
    () => [...transfers].sort((left, right) => right.date.localeCompare(left.date)),
    [transfers],
  );

  const walletNameById = useMemo(
    () => Object.fromEntries(wallets.map((wallet) => [wallet.id, wallet.name])),
    [wallets],
  );

  const routineCompletion =
    snapshot.plannedRoutineTotal <= 0
      ? 0
      : snapshot.actualRoutineTotal / snapshot.plannedRoutineTotal;

  const personalShare =
    snapshot.monthlyExpense <= 0 ? 0 : snapshot.personalSpending / snapshot.monthlyExpense;

  return {
    mode,
    dataset,
    snapshot,
    recentTransactions,
    recentTransfers,
    walletNameById,
    routineCompletion,
    personalShare,
  };
}
