"use client";

import { useState } from "react";
import { useFinanceAppContext } from "@/components/finance/finance-app-provider";
import { formatCurrency, formatDate, formatPercent } from "@/lib/finance/format";
import { useFinanceData } from "@/lib/finance/use-finance-data";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RoutinePage() {
  const { uid, syncStatus, updateRoutineExpense } = useFinanceAppContext();
  const { dataset, routineCompletion, snapshot } = useFinanceData();

  const livingWallet = dataset.wallets.find(
    (wallet) => wallet.name.trim().toLowerCase() === "living wallet",
  );
  const livingWalletRealBalance = livingWallet?.balance ?? 0;
  const livingWalletProjectedBalance = livingWalletRealBalance - snapshot.remainingPlannedExpenses;

  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [editPlannedAmount, setEditPlannedAmount] = useState("");
  const [editStatus, setEditStatus] = useState<"planned" | "done">("planned");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const formDisabled = !uid || syncStatus === "loading" || isSubmitting;

  function beginEdit(
    item: (typeof dataset.routineExpenses)[number],
  ): void {
    setEditingRoutineId(item.id);
    setEditPlannedAmount(String(item.plannedAmount));
    setEditStatus(item.isDone ? "done" : "planned");
    setStatusMessage(null);
  }

  function cancelEdit(): void {
    setEditingRoutineId(null);
    setEditPlannedAmount("");
    setEditStatus("planned");
    setStatusMessage(null);
  }

  async function handleSaveRoutine(
    event: React.FormEvent<HTMLFormElement>,
    item: (typeof dataset.routineExpenses)[number],
  ): Promise<void> {
    event.preventDefault();

    const plannedAmount = Number(editPlannedAmount);
    if (!Number.isFinite(plannedAmount) || plannedAmount <= 0) {
      setStatusMessage("Routine estimate must be greater than 0.");
      return;
    }

    const isDone = editStatus === "done";

    try {
      setIsSubmitting(true);
      setStatusMessage(null);

      await updateRoutineExpense(item.id, {
        plannedAmount,
        isDone,
        actualAmount: isDone ? item.actualAmount ?? plannedAmount : item.actualAmount,
        actualDate: isDone ? item.actualDate ?? todayIsoDate() : item.actualDate,
      });

      setEditingRoutineId(null);
      setStatusMessage("Routine updated.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to update routine.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="glass-panel p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Routine Expenses</h2>
          <p className="text-sm text-(--ink-muted)">
            Monthly planned vs actual. Status and estimate are edited manually.
          </p>
        </div>
        <span className="chip">{formatPercent(routineCompletion)} completed</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <article className="metric-card">
          <p className="stat-label">Real Balance</p>
          <p className="mt-1 text-lg font-semibold">{formatCurrency(livingWalletRealBalance)}</p>
          <p className="mt-1 text-xs text-(--ink-muted)">
            {livingWallet
              ? "Current balance in Living Wallet."
              : "Living Wallet not found. Add a wallet named Living Wallet."}
          </p>
        </article>
        <article className="metric-card">
          <p className="stat-label">Projected Balance</p>
          <p className="mt-1 text-lg font-semibold text-(--warning)">
            {formatCurrency(livingWalletProjectedBalance)}
          </p>
          <p className="mt-1 text-xs text-(--ink-muted)">
            Estimated Living Wallet balance after planned routines.
          </p>
        </article>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-(--line)">
        <div
          className="h-full rounded-full bg-(--safe)"
          style={{ width: `${Math.round(routineCompletion * 100)}%` }}
        />
      </div>

      <div className="mt-4 space-y-3">
        {dataset.routineExpenses.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-(--line) bg-(--surface-solid) p-4"
          >
            {editingRoutineId === item.id ? (
              <form onSubmit={(event) => handleSaveRoutine(event, item)} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{item.name}</p>
                  <span className="text-xs text-(--ink-soft)">
                    {item.dueDate ? `Due ${formatDate(item.dueDate)}` : "No due date"}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={editPlannedAmount}
                    onChange={(event) => setEditPlannedAmount(event.target.value)}
                    inputMode="numeric"
                    placeholder="Estimated amount"
                    className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                    disabled={formDisabled}
                  />

                  <select
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value as "planned" | "done")}
                    className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                    disabled={formDisabled}
                  >
                    <option value="planned">Planned</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={formDisabled}
                    className="rounded-xl bg-(--accent) px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={isSubmitting}
                    className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--ink-muted) disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{item.name}</p>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      item.isDone
                        ? "bg-(--safe-soft) text-(--safe)"
                        : "bg-(--warning-soft) text-(--warning)"
                    }`}
                  >
                    {item.isDone ? "Done" : "Planned"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-(--ink-muted)">
                  Planned {formatCurrency(item.plannedAmount)}
                  {item.dueDate ? ` - due ${formatDate(item.dueDate)}` : ""}
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => beginEdit(item)}
                    disabled={formDisabled}
                    className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--ink-muted) disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Edit
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>

      {statusMessage ? <p className="mt-4 text-sm text-(--ink-muted)">{statusMessage}</p> : null}
      {!uid ? (
        <p className="mt-2 text-sm text-(--over)">Sign in to edit routines.</p>
      ) : null}
      {syncStatus === "loading" ? (
        <p className="mt-2 text-xs text-(--ink-soft)">Syncing routine data...</p>
      ) : null}
    </section>
  );
}
