"use client";

import { useEffect, useState } from "react";
import {
  type NewGoalInput,
  type NewRoutineExpenseInput,
  type NewTransactionInput,
  type Wallet,
} from "@/lib/finance/types";

interface QuickEntryPanelProps {
  wallets: Wallet[];
  goalWalletIdsInUse: string[];
  disabled?: boolean;
  onCreateTransaction: (payload: NewTransactionInput) => Promise<void>;
  onCreateRoutineExpense: (payload: NewRoutineExpenseInput) => Promise<void>;
  onCreateGoal: (payload: NewGoalInput) => Promise<void>;
}

function isoDateOffset(days: number): string {
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

export default function QuickEntryPanel({
  wallets,
  goalWalletIdsInUse,
  disabled = false,
  onCreateTransaction,
  onCreateRoutineExpense,
  onCreateGoal,
}: QuickEntryPanelProps) {
  const fallbackWalletId = wallets[0]?.id ?? "";

  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [txAmount, setTxAmount] = useState("");
  const [txType, setTxType] = useState<"income" | "expense">("expense");
  const [txCategory, setTxCategory] = useState("Makanan");
  const [txWalletId, setTxWalletId] = useState(fallbackWalletId);
  const [txPersonal, setTxPersonal] = useState(true);

  const [routineName, setRoutineName] = useState("Internet");
  const [routinePlanned, setRoutinePlanned] = useState("");
  const [routineDueDate, setRoutineDueDate] = useState(isoDateOffset(2));

  const [goalName, setGoalName] = useState("Dana Darurat");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalDeadline, setGoalDeadline] = useState(isoDateOffset(30));
  const [goalWalletId, setGoalWalletId] = useState(fallbackWalletId);

  const goalWalletOptions = wallets.filter(
    (wallet) => !goalWalletIdsInUse.includes(wallet.id) || wallet.id === goalWalletId,
  );
  const hasGoalWalletOption = goalWalletOptions.length > 0;

  const hasWallets = wallets.length > 0;
  const formDisabled = disabled || isSubmitting || !hasWallets;

  useEffect(() => {
    if (goalWalletOptions.length === 0) {
      setGoalWalletId("");
      return;
    }

    setGoalWalletId((current) => {
      if (goalWalletOptions.some((wallet) => wallet.id === current)) {
        return current;
      }

      return goalWalletOptions[0].id;
    });
  }, [goalWalletOptions]);

  useEffect(() => {
    if (wallets.length === 0) {
      return;
    }

    setTxWalletId((current) => current || wallets[0].id);
  }, [wallets]);

  async function handleTransactionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const amount = Number(txAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !txWalletId) {
      setStatusMessage("Nominal transaksi dan wallet harus valid.");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      await onCreateTransaction({
        amount,
        type: txType,
        category: txCategory.trim() || "Uncategorized",
        date: new Date().toISOString().slice(0, 10),
        walletId: txWalletId,
        isPersonalSpending: txPersonal,
      });

      setTxAmount("");
      setStatusMessage("Transaksi berhasil disimpan.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Gagal menyimpan transaksi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRoutineSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const plannedAmount = Number(routinePlanned);
    if (!Number.isFinite(plannedAmount) || plannedAmount <= 0) {
      setStatusMessage("Nominal routine expense harus valid.");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      await onCreateRoutineExpense({
        name: routineName.trim() || "Routine Expense",
        plannedAmount,
        isDone: false,
        dueDate: routineDueDate,
      });

      setRoutinePlanned("");
      setStatusMessage("Routine expense berhasil ditambahkan.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Gagal menambah routine.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoalSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const targetAmount = Number(goalTarget);
    if (!Number.isFinite(targetAmount) || targetAmount <= 0 || !goalWalletId) {
      setStatusMessage("Target goal dan wallet harus valid.");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      await onCreateGoal({
        name: goalName.trim() || "Goal Baru",
        targetAmount,
        deadline: goalDeadline,
        currentSaved: 0,
        linkedWalletId: goalWalletId,
      });

      setGoalTarget("");
      setStatusMessage("Goal berhasil dibuat.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Gagal menambah goal.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <form onSubmit={handleTransactionSubmit} className="metric-card space-y-3">
          <p className="text-sm font-semibold">Quick Transaction</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={txAmount}
              onChange={(event) => setTxAmount(event.target.value)}
              placeholder="Nominal"
              inputMode="numeric"
              className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
              disabled={formDisabled}
            />
            <select
              value={txType}
              onChange={(event) => setTxType(event.target.value as "income" | "expense")}
              className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
              disabled={formDisabled}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <input
            value={txCategory}
            onChange={(event) => setTxCategory(event.target.value)}
            placeholder="Kategori"
            className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
            disabled={formDisabled}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={txWalletId}
              onChange={(event) => setTxWalletId(event.target.value)}
              className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
              disabled={formDisabled}
            >
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-(--line) bg-white px-3 py-2 text-xs text-(--ink-muted)">
              <input
                type="checkbox"
                checked={txPersonal}
                onChange={(event) => setTxPersonal(event.target.checked)}
                disabled={formDisabled}
              />
              Personal
            </label>
          </div>
          <button
            type="submit"
            disabled={formDisabled}
            className="w-full rounded-xl bg-(--accent) px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Simpan Transaksi
          </button>
        </form>

        <form onSubmit={handleRoutineSubmit} className="metric-card space-y-3">
          <p className="text-sm font-semibold">Quick Routine</p>
          <input
            value={routineName}
            onChange={(event) => setRoutineName(event.target.value)}
            placeholder="Nama routine"
            className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
            disabled={formDisabled}
          />
          <input
            value={routinePlanned}
            onChange={(event) => setRoutinePlanned(event.target.value)}
            placeholder="Planned amount"
            inputMode="numeric"
            className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
            disabled={formDisabled}
          />
          <input
            type="date"
            value={routineDueDate}
            onChange={(event) => setRoutineDueDate(event.target.value)}
            className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
            disabled={formDisabled}
          />
          <button
            type="submit"
            disabled={formDisabled}
            className="w-full rounded-xl bg-(--accent) px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Tambah Routine
          </button>
        </form>

        <form onSubmit={handleGoalSubmit} className="metric-card space-y-3">
          <p className="text-sm font-semibold">Quick Goal</p>
          <input
            value={goalName}
            onChange={(event) => setGoalName(event.target.value)}
            placeholder="Nama goal"
            className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
            disabled={formDisabled}
          />
          <input
            value={goalTarget}
            onChange={(event) => setGoalTarget(event.target.value)}
            placeholder="Target amount"
            inputMode="numeric"
            className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
            disabled={formDisabled}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="date"
              value={goalDeadline}
              onChange={(event) => setGoalDeadline(event.target.value)}
              className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
              disabled={formDisabled}
            />
            <select
              value={goalWalletId}
              onChange={(event) => setGoalWalletId(event.target.value)}
              className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
              disabled={formDisabled || !hasGoalWalletOption}
            >
              {goalWalletOptions.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={formDisabled || !hasGoalWalletOption}
            className="w-full rounded-xl bg-(--accent) px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Buat Goal
          </button>
          {!hasGoalWalletOption ? (
            <p className="text-xs text-(--warning)">
              Semua wallet sudah dipakai goal. Tambah wallet baru untuk membuat goal lain.
            </p>
          ) : null}
        </form>
      </div>

      <p className="text-sm text-(--ink-muted)">
        {statusMessage ??
          "Quick input dirancang untuk input inti transaksi, routine, dan goal dalam beberapa detik."}
      </p>
      {!hasWallets ? (
        <p className="text-sm text-(--warning)">
          Tambahkan minimal satu wallet agar quick input aktif.
        </p>
      ) : null}
    </section>
  );
}
