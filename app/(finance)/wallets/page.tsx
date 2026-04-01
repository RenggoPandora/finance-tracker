"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TransferManager from "@/components/finance/transfer-manager";
import { useFinanceAppContext } from "@/components/finance/finance-app-provider";
import { formatCurrency } from "@/lib/finance/format";
import { walletTypeLabel } from "@/lib/finance/presentation";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import { type Wallet, type WalletType } from "@/lib/finance/types";

const walletTypeOptions: Array<{ value: WalletType; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "savings", label: "Savings" },
  { value: "investment", label: "Investment" },
];

function parseBalance(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Wallet balance must be a valid number.");
  }

  return parsed;
}

export default function WalletsPage() {
  const searchParams = useSearchParams();
  const { uid, syncStatus, createWallet, updateWallet, deleteWallet } = useFinanceAppContext();
  const { dataset, snapshot } = useFinanceData();
  const preferredGoalWalletId = searchParams.get("goalWalletId") ?? undefined;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<WalletType>("cash");
  const [newBalance, setNewBalance] = useState("");
  const [newIsSpendingLimitSource, setNewIsSpendingLimitSource] = useState(false);

  const [editingWalletId, setEditingWalletId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<WalletType>("cash");
  const [editBalance, setEditBalance] = useState("");
  const [editIsSpendingLimitSource, setEditIsSpendingLimitSource] = useState(false);

  const formDisabled = !uid || syncStatus === "loading" || isSubmitting;
  const canDeleteWallet = dataset.wallets.length > 1;

  const walletMap = useMemo(
    () => Object.fromEntries(dataset.wallets.map((wallet) => [wallet.id, wallet])),
    [dataset.wallets],
  );

  async function handleCreateWallet(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const name = newName.trim();
    if (!name) {
      setStatusMessage("Wallet name is required.");
      return;
    }

    try {
      const balance = parseBalance(newBalance || "0");
      setIsSubmitting(true);
      setStatusMessage(null);

      await createWallet({
        name,
        type: newType,
        balance,
        isSpendingLimitSource: newIsSpendingLimitSource,
      });

      setNewName("");
      setNewBalance("");
      setNewIsSpendingLimitSource(false);
      setStatusMessage("Wallet added.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to add wallet.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function beginEdit(wallet: Wallet): void {
    setEditingWalletId(wallet.id);
    setEditName(wallet.name);
    setEditType(wallet.type);
    setEditBalance(String(wallet.balance));
    setEditIsSpendingLimitSource(wallet.isSpendingLimitSource);
    setStatusMessage(null);
  }

  function cancelEdit(): void {
    setEditingWalletId(null);
    setEditName("");
    setEditBalance("");
    setEditIsSpendingLimitSource(false);
    setStatusMessage(null);
  }

  async function handleUpdateWallet(
    event: React.FormEvent<HTMLFormElement>,
    walletId: string,
  ): Promise<void> {
    event.preventDefault();

    const name = editName.trim();
    if (!name) {
      setStatusMessage("Wallet name is required.");
      return;
    }

    try {
      const balance = parseBalance(editBalance || "0");
      setIsSubmitting(true);
      setStatusMessage(null);

      await updateWallet(walletId, {
        name,
        type: editType,
        balance,
        isSpendingLimitSource: editIsSpendingLimitSource,
      });

      setEditingWalletId(null);
      setStatusMessage("Wallet updated.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to update wallet.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteWallet(walletId: string): Promise<void> {
    const target = walletMap[walletId];
    const confirmation = window.confirm(
      `Delete wallet ${target?.name ?? "this wallet"}? This action cannot be undone.`,
    );

    if (!confirmation) {
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMessage(null);
      await deleteWallet(walletId);
      setEditingWalletId((current) => (current === walletId ? null : current));
      setStatusMessage("Wallet deleted.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to delete wallet.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className="glass-panel p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Wallet Management</h2>
        <p className="mt-1 text-sm text-(--ink-muted)">
          Manage wallet balances and transfers in one place.
        </p>
        {snapshot.isSpendingLimitWalletSelectionActive ? (
          <p className="mt-2 text-xs text-(--ink-soft)">
            Spending limit source: {snapshot.spendingLimitSourceWalletCount} wallet(s)
            ({formatCurrency(snapshot.spendingLimitSourceBalance)}).
          </p>
        ) : (
          <p className="mt-2 text-xs text-(--warning)">
            No spending source selected. Limit currently uses all wallets.
          </p>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
          <form onSubmit={handleCreateWallet} className="metric-card space-y-3">
            <p className="text-sm font-semibold">Add Wallet</p>

            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Wallet name"
              className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
              disabled={formDisabled}
            />

            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={newType}
                onChange={(event) => setNewType(event.target.value as WalletType)}
                className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                disabled={formDisabled}
              >
                {walletTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                value={newBalance}
                onChange={(event) => setNewBalance(event.target.value)}
                placeholder="Opening balance"
                inputMode="numeric"
                className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                disabled={formDisabled}
              />
            </div>

            <label className="flex items-center gap-2 rounded-xl border border-(--line) bg-white px-3 py-2 text-xs text-(--ink-muted)">
              <input
                type="checkbox"
                checked={newIsSpendingLimitSource}
                onChange={(event) => setNewIsSpendingLimitSource(event.target.checked)}
                disabled={formDisabled}
              />
              Use this wallet for living expenses (spending limit source)
            </label>

            <button
              type="submit"
              disabled={formDisabled}
              className="w-full rounded-xl bg-(--accent) px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save Wallet
            </button>
          </form>

          <div className="h-[24rem] space-y-4 overflow-y-auto pr-1 sm:h-[30rem]">
            {snapshot.walletDistribution.map((wallet) => (
              <article
                key={wallet.id}
                className="rounded-2xl border border-(--line) bg-(--surface-solid) p-4"
              >
                {editingWalletId === wallet.id ? (
                  <form
                    onSubmit={(event) => handleUpdateWallet(event, wallet.id)}
                    className="space-y-3"
                  >
                    <input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                      disabled={formDisabled}
                    />

                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        value={editType}
                        onChange={(event) => setEditType(event.target.value as WalletType)}
                        className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                        disabled={formDisabled}
                      >
                        {walletTypeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={editBalance}
                        onChange={(event) => setEditBalance(event.target.value)}
                        inputMode="numeric"
                        className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                        disabled={formDisabled}
                      />
                    </div>

                    <label className="flex items-center gap-2 rounded-xl border border-(--line) bg-white px-3 py-2 text-xs text-(--ink-muted)">
                      <input
                        type="checkbox"
                        checked={editIsSpendingLimitSource}
                        onChange={(event) => setEditIsSpendingLimitSource(event.target.checked)}
                        disabled={formDisabled}
                      />
                      Use this wallet for living expenses (spending limit source)
                    </label>

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
                    <div className="flex items-center justify-between text-sm">
                      <p>
                        <span className="font-medium">{wallet.name}</span>
                        <span className="ml-2 text-xs uppercase tracking-wide text-(--ink-soft)">
                          {walletTypeLabel[wallet.type]}
                        </span>
                        {wallet.isSpendingLimitSource ? (
                          <span className="ml-2 rounded-full bg-(--safe-soft) px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-(--safe)">
                            Living
                          </span>
                        ) : null}
                      </p>
                      <p className="font-semibold">{formatCurrency(wallet.balance)}</p>
                    </div>

                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-(--line)">
                      <div
                        className="h-full rounded-full bg-(--accent)"
                        style={{ width: `${Math.max(6, Math.round(wallet.share * 100))}%` }}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => beginEdit(wallet)}
                        disabled={formDisabled}
                        className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--ink-muted) disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteWallet(wallet.id)}
                        disabled={formDisabled || !canDeleteWallet}
                        className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--over) disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </article>
            ))}

            {snapshot.walletDistribution.length === 0 ? (
              <p className="text-sm text-(--ink-muted)">
                No wallets yet. Add your first wallet to start tracking balances.
              </p>
            ) : null}

            {!canDeleteWallet ? (
              <p className="text-xs text-(--ink-soft)">
                At least one wallet must remain.
              </p>
            ) : null}
          </div>
        </div>

        {statusMessage ? (
          <p className="mt-4 text-sm text-(--ink-muted)">{statusMessage}</p>
        ) : null}
        {!uid ? (
          <p className="mt-2 text-sm text-(--over)">Sign in to manage wallets.</p>
        ) : null}
        {syncStatus === "loading" ? (
          <p className="mt-2 text-xs text-(--ink-soft)">Syncing wallet data...</p>
        ) : null}
      </section>

      <TransferManager preferredToWalletId={preferredGoalWalletId} />
    </>
  );
}
