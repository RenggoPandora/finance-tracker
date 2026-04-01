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
    throw new Error("Nominal top up harus lebih dari 0.");
  }

  return parsed;
}

export default function GoalsPage() {
  const { uid, syncStatus, createTransfer } = useFinanceAppContext();
  const { dataset, snapshot, walletNameById } = useFinanceData();
  const totalGoals = snapshot.goalProgress.length;

  const [activeTopUpGoalId, setActiveTopUpGoalId] = useState<string | null>(null);
  const [fromWalletId, setFromWalletId] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpNote, setTopUpNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const formDisabled = !uid || syncStatus === "loading" || isSubmitting;

  function startTopUp(goalId: string, targetWalletId: string): void {
    const sourceWalletOptions = dataset.wallets.filter((wallet) => wallet.id !== targetWalletId);
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

  async function handleTopUpSubmit(
    event: React.FormEvent<HTMLFormElement>,
    goalId: string,
    targetWalletId: string,
    goalName: string,
  ): Promise<void> {
    event.preventDefault();

    if (!uid) {
      setStatusMessage("Login dulu untuk top up goal.");
      return;
    }

    if (!fromWalletId) {
      setStatusMessage("Pilih wallet asal untuk top up goal.");
      return;
    }

    if (fromWalletId === targetWalletId) {
      setStatusMessage("Wallet asal dan wallet goal harus berbeda.");
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
        note: topUpNote.trim() || `Top up goal: ${goalName}`,
      });

      setTopUpAmount("");
      setTopUpNote("");
      setStatusMessage(`Top up untuk goal ${goalName} berhasil.`);
      setActiveTopUpGoalId(goalId);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Gagal top up goal.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="glass-panel p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Financial Goals</h2>
      <p className="mt-1 text-sm text-(--ink-muted)">
        Progress goal dibaca otomatis dari saldo wallet yang ditautkan.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {snapshot.goalProgress.map((goal, index) => (
          (() => {
            const sourceWalletOptions = dataset.wallets.filter(
              (wallet) => wallet.id !== goal.linkedWalletId,
            );
            const isTopUpOpen = activeTopUpGoalId === goal.id;

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
                  Dana terkunci: {formatCurrency(goal.currentSaved)}
                </p>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-(--line)">
                  <div
                    className="h-full rounded-full bg-(--accent-deep)"
                    style={{ width: `${Math.round(goal.progressRatio * 100)}%` }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-sm">
                  <p className="font-semibold">{formatPercent(goal.progressRatio)}</p>
                  <p className="text-(--ink-muted)">Sisa {compactCurrency(goal.amountLeft)}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      isTopUpOpen ? cancelTopUp() : startTopUp(goal.id, goal.linkedWalletId)
                    }
                    className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--ink-muted) transition-colors hover:bg-(--surface-solid)"
                  >
                    {isTopUpOpen ? "Tutup Top Up" : "Top Up Goal"}
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
                            Dari: {wallet.name}
                          </option>
                        ))}
                      </select>

                      <input
                        value={topUpAmount}
                        onChange={(event) => setTopUpAmount(event.target.value)}
                        placeholder="Nominal top up"
                        inputMode="numeric"
                        className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                        disabled={formDisabled || sourceWalletOptions.length === 0}
                      />
                    </div>

                    <input
                      value={topUpNote}
                      onChange={(event) => setTopUpNote(event.target.value)}
                      placeholder="Catatan (opsional)"
                      className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                      disabled={formDisabled || sourceWalletOptions.length === 0}
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={formDisabled || sourceWalletOptions.length === 0}
                        className="rounded-xl bg-(--accent) px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Simpan Top Up
                      </button>
                      <button
                        type="button"
                        onClick={cancelTopUp}
                        disabled={isSubmitting}
                        className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--ink-muted) disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Batal
                      </button>
                    </div>

                    {sourceWalletOptions.length === 0 ? (
                      <p className="text-xs text-(--warning)">
                        Tidak ada wallet sumber. Tambahkan wallet lain untuk top up goal ini.
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
        <p className="mt-2 text-sm text-(--over)">Login dulu untuk melakukan top up goal.</p>
      ) : null}
      {syncStatus === "loading" ? (
        <p className="mt-2 text-xs text-(--ink-soft)">Sedang sinkronisasi data goal...</p>
      ) : null}
    </section>
  );
}
