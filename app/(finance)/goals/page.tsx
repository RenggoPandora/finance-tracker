"use client";

import { useState } from "react";
import { useFinanceAppContext } from "@/components/finance/finance-app-provider";
import { compactCurrency, formatCurrency, formatDate, formatPercent } from "@/lib/finance/format";
import { useFinanceData } from "@/lib/finance/use-finance-data";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseTopUpAmount(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Top-up amount must be greater than 0.");
  }

  return parsed;
}

export default function GoalsPage() {
  const { uid, syncStatus, createTransfer, updateGoal, deleteGoal } = useFinanceAppContext();
  const { dataset, snapshot, walletNameById } = useFinanceData();
  const totalGoals = snapshot.goalProgress.length;

  const [activeTopUpGoalId, setActiveTopUpGoalId] = useState<string | null>(null);
  const [fromWalletId, setFromWalletId] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpNote, setTopUpNote] = useState("");
  const [activeEditGoalId, setActiveEditGoalId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTargetAmount, setEditTargetAmount] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editWalletId, setEditWalletId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const formDisabled = !uid || syncStatus === "loading" || isSubmitting;

  function startTopUp(goalId: string, targetWalletId: string): void {
    const sourceWalletOptions = dataset.wallets.filter((wallet) => wallet.id !== targetWalletId);
    setActiveEditGoalId(null);
    setActiveTopUpGoalId(goalId);
    setFromWalletId(sourceWalletOptions[0]?.id ?? "");
    setTopUpAmount("");
    setTopUpNote("");
    setStatusMessage(null);
  }

  function cancelTopUp(): void {
    setActiveTopUpGoalId(null);
    setFromWalletId("");
    setTopUpAmount("");
    setTopUpNote("");
    setStatusMessage(null);
  }

  function startEdit(
    goalId: string,
    name: string,
    targetAmount: number,
    deadline: string,
    linkedWalletId: string,
  ): void {
    setActiveTopUpGoalId(null);
    setActiveEditGoalId(goalId);
    setEditName(name);
    setEditTargetAmount(String(targetAmount));
    setEditDeadline(deadline);
    setEditWalletId(linkedWalletId);
    setStatusMessage(null);
  }

  function cancelEdit(): void {
    setActiveEditGoalId(null);
    setEditName("");
    setEditTargetAmount("");
    setEditDeadline("");
    setEditWalletId("");
    setStatusMessage(null);
  }

  async function handleTopUpSubmit(
    event: React.FormEvent<HTMLFormElement>,
    goalId: string,
    targetWalletId: string,
    goalName: string,
  ): Promise<void> {
    event.preventDefault();

    if (!uid) {
      setStatusMessage("Sign in to top up a goal.");
      return;
    }

    if (!fromWalletId) {
      setStatusMessage("Select a source wallet for top-up.");
      return;
    }

    if (fromWalletId === targetWalletId) {
      setStatusMessage("Source wallet and goal wallet must be different.");
      return;
    }

    try {
      const amount = parseTopUpAmount(topUpAmount);
      setIsSubmitting(true);
      setStatusMessage(null);

      await createTransfer({
        fromWalletId,
        toWalletId: targetWalletId,
        amount,
        date: todayIsoDate(),
        note: topUpNote.trim() || `Goal top-up: ${goalName}`,
      });

      setTopUpAmount("");
      setTopUpNote("");
      setStatusMessage(`Top-up for ${goalName} completed.`);
      setActiveTopUpGoalId(goalId);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to top up goal.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoalEditSubmit(
    event: React.FormEvent<HTMLFormElement>,
    goalId: string,
  ): Promise<void> {
    event.preventDefault();

    if (!uid) {
      setStatusMessage("Sign in to edit goals.");
      return;
    }

    const name = editName.trim();
    const targetAmount = Number(editTargetAmount);

    if (!name) {
      setStatusMessage("Goal name is required.");
      return;
    }

    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      setStatusMessage("Target amount must be greater than 0.");
      return;
    }

    if (!editDeadline.trim()) {
      setStatusMessage("Goal deadline is required.");
      return;
    }

    if (!editWalletId) {
      setStatusMessage("Select a wallet for the goal.");
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMessage(null);

      await updateGoal(goalId, {
        name,
        targetAmount,
        deadline: editDeadline,
        linkedWalletId: editWalletId,
      });

      setActiveEditGoalId(null);
      setEditName("");
      setEditTargetAmount("");
      setEditDeadline("");
      setEditWalletId("");
      setStatusMessage(`Goal ${name} updated.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to update goal.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoalDelete(goalId: string, goalName: string): Promise<void> {
    if (!uid) {
      setStatusMessage("Sign in to delete goals.");
      return;
    }

    const isConfirmed = window.confirm(`Delete goal "${goalName}"?`);
    if (!isConfirmed) {
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMessage(null);

      await deleteGoal(goalId);

      if (activeTopUpGoalId === goalId) {
        setActiveTopUpGoalId(null);
        setFromWalletId("");
        setTopUpAmount("");
        setTopUpNote("");
      }

      if (activeEditGoalId === goalId) {
        setActiveEditGoalId(null);
        setEditName("");
        setEditTargetAmount("");
        setEditDeadline("");
        setEditWalletId("");
      }

      setStatusMessage(`Goal ${goalName} deleted.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to delete goal.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="glass-panel p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Financial Goals</h2>
      <p className="mt-1 text-sm text-(--ink-muted)">
        Goal progress is automatically linked to wallet balances.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {snapshot.goalProgress.map((goal, index) => (
          (() => {
            const sourceWalletOptions = dataset.wallets.filter(
              (wallet) => wallet.id !== goal.linkedWalletId,
            );
            const isTopUpOpen = activeTopUpGoalId === goal.id;
            const isEditOpen = activeEditGoalId === goal.id;
            const walletIdsUsedByOtherGoals = new Set(
              dataset.goals
                .filter((existingGoal) => existingGoal.id !== goal.id)
                .map((existingGoal) => existingGoal.linkedWalletId),
            );
            const editWalletOptions = dataset.wallets.filter(
              (wallet) =>
                !walletIdsUsedByOtherGoals.has(wallet.id) ||
                wallet.id === goal.linkedWalletId ||
                wallet.id === editWalletId,
            );

            return (
              <article
                key={goal.id}
                className={`rounded-2xl border border-(--line) bg-(--surface-solid) p-4 ${
                  totalGoals % 2 === 1 && index === totalGoals - 1
                    ? "sm:col-span-2 xl:col-span-1"
                    : ""
                }`}
              >
                <p className="font-semibold">{goal.name}</p>
                <p className="mt-1 text-sm text-(--ink-muted)">
                  Target {formatCurrency(goal.targetAmount)} - deadline {formatDate(goal.deadline)}
                </p>
                <p className="mt-1 text-xs text-(--ink-soft)">
                  Wallet: {walletNameById[goal.linkedWalletId] ?? goal.linkedWalletId}
                </p>
                <p className="mt-1 text-sm font-semibold text-(--accent-deep)">
                  Locked funds: {formatCurrency(goal.currentSaved)}
                </p>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-(--line)">
                  <div
                    className="h-full rounded-full bg-(--accent-deep)"
                    style={{ width: `${Math.round(goal.progressRatio * 100)}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-sm">
                  <p className="font-semibold">{formatPercent(goal.progressRatio)}</p>
                  <p className="text-(--ink-muted)">Left {compactCurrency(goal.amountLeft)}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      isTopUpOpen ? cancelTopUp() : startTopUp(goal.id, goal.linkedWalletId)
                    }
                    disabled={formDisabled}
                    className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--ink-muted) transition-colors hover:bg-(--surface-solid)"
                  >
                    {isTopUpOpen ? "Close Top-up" : "Top Up Goal"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      isEditOpen
                        ? cancelEdit()
                        : startEdit(
                            goal.id,
                            goal.name,
                            goal.targetAmount,
                            goal.deadline,
                            goal.linkedWalletId,
                          )
                    }
                    disabled={formDisabled}
                    className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--ink-muted) transition-colors hover:bg-(--surface-solid)"
                  >
                    {isEditOpen ? "Close Edit" : "Edit Goal"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGoalDelete(goal.id, goal.name)}
                    disabled={formDisabled}
                    className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--over) transition-colors hover:bg-(--surface-solid)"
                  >
                    Delete Goal
                  </button>
                </div>

                {isTopUpOpen ? (
                  <form
                    onSubmit={(event) =>
                      void handleTopUpSubmit(event, goal.id, goal.linkedWalletId, goal.name)
                    }
                    className="mt-3 space-y-2 rounded-xl border border-(--line) bg-white p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        value={fromWalletId}
                        onChange={(event) => setFromWalletId(event.target.value)}
                        className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                        disabled={formDisabled || sourceWalletOptions.length === 0}
                      >
                        {sourceWalletOptions.map((wallet) => (
                          <option key={wallet.id} value={wallet.id}>
                            From: {wallet.name}
                          </option>
                        ))}
                      </select>

                      <input
                        value={topUpAmount}
                        onChange={(event) => setTopUpAmount(event.target.value)}
                        placeholder="Top-up amount"
                        inputMode="numeric"
                        className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                        disabled={formDisabled || sourceWalletOptions.length === 0}
                      />
                    </div>

                    <input
                      value={topUpNote}
                      onChange={(event) => setTopUpNote(event.target.value)}
                      placeholder="Note (optional)"
                      className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                      disabled={formDisabled || sourceWalletOptions.length === 0}
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={formDisabled || sourceWalletOptions.length === 0}
                        className="rounded-xl bg-(--accent) px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Save Top-up
                      </button>
                      <button
                        type="button"
                        onClick={cancelTopUp}
                        disabled={isSubmitting}
                        className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--ink-muted) disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>

                    {sourceWalletOptions.length === 0 ? (
                      <p className="text-xs text-(--warning)">
                        No source wallet available. Add another wallet to top up this goal.
                      </p>
                    ) : null}
                  </form>
                ) : null}

                {isEditOpen ? (
                  <form
                    onSubmit={(event) => void handleGoalEditSubmit(event, goal.id)}
                    className="mt-3 space-y-2 rounded-xl border border-(--line) bg-white p-3"
                  >
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      placeholder="Goal name"
                      className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                      disabled={formDisabled}
                    />

                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={editTargetAmount}
                        onChange={(event) => setEditTargetAmount(event.target.value)}
                        placeholder="Target amount"
                        inputMode="numeric"
                        className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                        disabled={formDisabled}
                      />

                      <input
                        type="date"
                        value={editDeadline}
                        onChange={(event) => setEditDeadline(event.target.value)}
                        className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                        disabled={formDisabled}
                      />
                    </div>

                    <select
                      value={editWalletId}
                      onChange={(event) => setEditWalletId(event.target.value)}
                      className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                      disabled={formDisabled || editWalletOptions.length === 0}
                    >
                      {editWalletOptions.map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          Wallet: {wallet.name}
                        </option>
                      ))}
                    </select>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={formDisabled || editWalletOptions.length === 0}
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

                    {editWalletOptions.length === 0 ? (
                      <p className="text-xs text-(--warning)">
                        No wallet is available for this goal right now.
                      </p>
                    ) : null}
                  </form>
                ) : null}
              </article>
            );
          })()
        ))}
      </div>

      {statusMessage ? <p className="mt-4 text-sm text-(--ink-muted)">{statusMessage}</p> : null}
      {!uid ? (
        <p className="mt-2 text-sm text-(--over)">Sign in to top up goals.</p>
      ) : null}
      {syncStatus === "loading" ? (
        <p className="mt-2 text-xs text-(--ink-soft)">Syncing goal data...</p>
      ) : null}
    </section>
  );
}
