"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFinanceAppContext } from "@/components/finance/finance-app-provider";
import { formatCurrency, formatDate } from "@/lib/finance/format";
import { useFinanceData } from "@/lib/finance/use-finance-data";
import { type Transfer } from "@/lib/finance/types";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseTransferAmount(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Nominal transfer harus lebih dari 0.");
  }

  return parsed;
}

function parseIsoDate(dateInput: string): Date {
  return new Date(`${dateInput}T00:00:00`);
}

function matchesDateFilter(
  transferDateInput: string,
  filterMode: "all" | "7d" | "30d" | "this-month",
): boolean {
  if (filterMode === "all") {
    return true;
  }

  const now = new Date();
  const transferDate = parseIsoDate(transferDateInput);

  if (filterMode === "this-month") {
    return (
      transferDate.getFullYear() === now.getFullYear() &&
      transferDate.getMonth() === now.getMonth()
    );
  }

  const minimumDate = new Date();
  minimumDate.setDate(now.getDate() - (filterMode === "7d" ? 7 : 30));
  minimumDate.setHours(0, 0, 0, 0);

  return transferDate >= minimumDate;
}

interface TransferManagerProps {
  preferredToWalletId?: string;
}

export default function TransferManager({ preferredToWalletId }: TransferManagerProps) {
  const { uid, syncStatus, createTransfer, updateTransfer, deleteTransfer } =
    useFinanceAppContext();
  const { dataset, recentTransfers, walletNameById } = useFinanceData();
  const lastAppliedPreferredTargetRef = useRef<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [fromWalletId, setFromWalletId] = useState("");
  const [toWalletId, setToWalletId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [note, setNote] = useState("");

  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);
  const [editFromWalletId, setEditFromWalletId] = useState("");
  const [editToWalletId, setEditToWalletId] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState(todayIsoDate());
  const [editNote, setEditNote] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [walletFilter, setWalletFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<"all" | "7d" | "30d" | "this-month">("all");

  const formDisabled = !uid || syncStatus === "loading" || isSubmitting;
  const hasEnoughWallets = dataset.wallets.length >= 2;

  const transferMap = useMemo(
    () => Object.fromEntries(recentTransfers.map((transfer) => [transfer.id, transfer])),
    [recentTransfers],
  );

  const filteredTransfers = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();

    return recentTransfers.filter((transfer) => {
      if (
        walletFilter !== "all" &&
        transfer.fromWalletId !== walletFilter &&
        transfer.toWalletId !== walletFilter
      ) {
        return false;
      }

      if (!matchesDateFilter(transfer.date, dateFilter)) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const fromName = (walletNameById[transfer.fromWalletId] ?? transfer.fromWalletId)
        .toLowerCase();
      const toName = (walletNameById[transfer.toWalletId] ?? transfer.toWalletId).toLowerCase();
      const noteText = (transfer.note ?? "").toLowerCase();

      return (
        fromName.includes(keyword) ||
        toName.includes(keyword) ||
        noteText.includes(keyword) ||
        transfer.date.includes(keyword) ||
        String(transfer.amount).includes(keyword)
      );
    });
  }, [recentTransfers, searchQuery, walletFilter, dateFilter, walletNameById]);

  const hasActiveFilter =
    searchQuery.trim().length > 0 || walletFilter !== "all" || dateFilter !== "all";

  const preferredTargetWalletName =
    preferredToWalletId && walletNameById[preferredToWalletId]
      ? walletNameById[preferredToWalletId]
      : null;

  useEffect(() => {
    if (dataset.wallets.length < 2) {
      setFromWalletId("");
      setToWalletId("");
      lastAppliedPreferredTargetRef.current = null;
      return;
    }

    const firstWalletId = dataset.wallets[0].id;
    const secondWalletId = dataset.wallets[1]?.id ?? firstWalletId;
    const preferredTargetExists = Boolean(
      preferredToWalletId && dataset.wallets.some((wallet) => wallet.id === preferredToWalletId),
    );
    const preferredTargetId = preferredTargetExists ? (preferredToWalletId as string) : null;
    const shouldApplyPreferred =
      preferredTargetId !== null && lastAppliedPreferredTargetRef.current !== preferredTargetId;

    setFromWalletId((current) => {
      if (shouldApplyPreferred) {
        return preferredTargetId === firstWalletId ? secondWalletId : firstWalletId;
      }

      const currentExists = dataset.wallets.some((wallet) => wallet.id === current);
      return currentExists ? current : firstWalletId;
    });

    setToWalletId((current) => {
      if (shouldApplyPreferred) {
        return preferredTargetId as string;
      }

      const currentExists = dataset.wallets.some((wallet) => wallet.id === current);
      return currentExists ? current : secondWalletId;
    });

    lastAppliedPreferredTargetRef.current = preferredTargetId;
  }, [dataset.wallets, preferredToWalletId]);

  async function handleCreateTransfer(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!hasEnoughWallets) {
      setStatusMessage("Minimal dua wallet dibutuhkan untuk transfer.");
      return;
    }

    if (fromWalletId === toWalletId) {
      setStatusMessage("Wallet asal dan tujuan harus berbeda.");
      return;
    }

    try {
      const parsedAmount = parseTransferAmount(amount);
      setIsSubmitting(true);
      setStatusMessage(null);

      await createTransfer({
        fromWalletId,
        toWalletId,
        amount: parsedAmount,
        date,
        note: note.trim() || undefined,
      });

      setAmount("");
      setNote("");
      setDate(todayIsoDate());
      setStatusMessage("Transfer berhasil ditambahkan.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Gagal menambah transfer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function beginEdit(transfer: Transfer): void {
    setEditingTransferId(transfer.id);
    setEditFromWalletId(transfer.fromWalletId);
    setEditToWalletId(transfer.toWalletId);
    setEditAmount(String(transfer.amount));
    setEditDate(transfer.date);
    setEditNote(transfer.note ?? "");
    setStatusMessage(null);
  }

  function cancelEdit(): void {
    setEditingTransferId(null);
    setEditFromWalletId("");
    setEditToWalletId("");
    setEditAmount("");
    setEditDate(todayIsoDate());
    setEditNote("");
    setStatusMessage(null);
  }

  async function handleUpdateTransfer(
    event: React.FormEvent<HTMLFormElement>,
    transferId: string,
  ): Promise<void> {
    event.preventDefault();

    if (editFromWalletId === editToWalletId) {
      setStatusMessage("Wallet asal dan tujuan harus berbeda.");
      return;
    }

    try {
      const parsedAmount = parseTransferAmount(editAmount);
      setIsSubmitting(true);
      setStatusMessage(null);

      await updateTransfer(transferId, {
        fromWalletId: editFromWalletId,
        toWalletId: editToWalletId,
        amount: parsedAmount,
        date: editDate,
        note: editNote.trim() || undefined,
      });

      setEditingTransferId(null);
      setStatusMessage("Transfer berhasil diperbarui.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Gagal memperbarui transfer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetFilters(): void {
    setSearchQuery("");
    setWalletFilter("all");
    setDateFilter("all");
  }

  async function handleDeleteTransfer(transferId: string): Promise<void> {
    const target = transferMap[transferId];
    const confirmation = window.confirm(
      `Hapus transfer ${target ? formatCurrency(target.amount) : "ini"}?`,
    );

    if (!confirmation) {
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMessage(null);
      await deleteTransfer(transferId);
      setEditingTransferId((current) => (current === transferId ? null : current));
      setStatusMessage("Transfer berhasil dihapus.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Gagal menghapus transfer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="glass-panel p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Transfer Antar Wallet</h2>
      <p className="mt-1 text-sm text-(--ink-muted)">
        Buat, ubah, dan hapus transfer. Transfer tidak dihitung sebagai income atau expense.
      </p>
      {preferredTargetWalletName ? (
        <p className="mt-1 text-xs text-(--accent-deep)">
          Target wallet goal dipilih otomatis: {preferredTargetWalletName}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[340px_1fr]">
        <form onSubmit={handleCreateTransfer} className="metric-card space-y-3">
          <p className="text-sm font-semibold">Tambah Transfer</p>

          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={fromWalletId}
              onChange={(event) => setFromWalletId(event.target.value)}
              className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
              disabled={formDisabled || !hasEnoughWallets}
            >
              {dataset.wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  From: {wallet.name}
                </option>
              ))}
            </select>

            <select
              value={toWalletId}
              onChange={(event) => setToWalletId(event.target.value)}
              className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
              disabled={formDisabled || !hasEnoughWallets}
            >
              {dataset.wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  To: {wallet.name}
                </option>
              ))}
            </select>
          </div>

          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Nominal transfer"
            inputMode="numeric"
            className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
            disabled={formDisabled || !hasEnoughWallets}
          />

          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
            disabled={formDisabled || !hasEnoughWallets}
          />

          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Catatan (opsional)"
            className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
            disabled={formDisabled || !hasEnoughWallets}
          />

          <button
            type="submit"
            disabled={formDisabled || !hasEnoughWallets}
            className="w-full rounded-xl bg-(--accent) px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Simpan Transfer
          </button>

          {!hasEnoughWallets ? (
            <p className="text-xs text-(--warning)">
              Tambahkan minimal 2 wallet sebelum membuat transfer.
            </p>
          ) : null}
        </form>

        <div className="flex h-[24rem] min-h-0 flex-col gap-3 sm:h-[30rem]">
          <div className="metric-card space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cari note, wallet, nominal, atau tanggal"
                className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                disabled={formDisabled}
              />
              <select
                value={walletFilter}
                onChange={(event) => setWalletFilter(event.target.value)}
                className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                disabled={formDisabled}
              >
                <option value="all">Semua Wallet</option>
                {dataset.wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name}
                  </option>
                ))}
              </select>
              <select
                value={dateFilter}
                onChange={(event) =>
                  setDateFilter(event.target.value as "all" | "7d" | "30d" | "this-month")
                }
                className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                disabled={formDisabled}
              >
                <option value="all">Semua Periode</option>
                <option value="7d">7 Hari Terakhir</option>
                <option value="30d">30 Hari Terakhir</option>
                <option value="this-month">Bulan Ini</option>
              </select>
              <button
                type="button"
                onClick={resetFilters}
                disabled={formDisabled || !hasActiveFilter}
                className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--ink-muted) disabled:cursor-not-allowed disabled:opacity-60"
              >
                Reset
              </button>
            </div>
            <p className="text-xs text-(--ink-soft)">
              Menampilkan {filteredTransfers.length} dari {recentTransfers.length} transfer.
            </p>
          </div>

          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            {recentTransfers.length === 0 ? (
              <p className="text-sm text-(--ink-muted)">Belum ada transfer.</p>
            ) : filteredTransfers.length === 0 ? (
              <p className="text-sm text-(--ink-muted)">
                Tidak ada transfer yang cocok dengan filter atau kata pencarian.
              </p>
            ) : (
              filteredTransfers.map((transfer) => (
                <article
                  key={transfer.id}
                  className="rounded-2xl border border-(--line) bg-(--surface-solid) p-4"
                >
                  {editingTransferId === transfer.id ? (
                    <form
                      onSubmit={(event) => handleUpdateTransfer(event, transfer.id)}
                      className="space-y-3"
                    >
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select
                          value={editFromWalletId}
                          onChange={(event) => setEditFromWalletId(event.target.value)}
                          className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                          disabled={formDisabled}
                        >
                          {dataset.wallets.map((wallet) => (
                            <option key={wallet.id} value={wallet.id}>
                              From: {wallet.name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={editToWalletId}
                          onChange={(event) => setEditToWalletId(event.target.value)}
                          className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                          disabled={formDisabled}
                        >
                          {dataset.wallets.map((wallet) => (
                            <option key={wallet.id} value={wallet.id}>
                              To: {wallet.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <input
                          value={editAmount}
                          onChange={(event) => setEditAmount(event.target.value)}
                          inputMode="numeric"
                          className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                          disabled={formDisabled}
                        />
                        <input
                          type="date"
                          value={editDate}
                          onChange={(event) => setEditDate(event.target.value)}
                          className="rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                          disabled={formDisabled}
                        />
                      </div>

                      <input
                        value={editNote}
                        onChange={(event) => setEditNote(event.target.value)}
                        placeholder="Catatan"
                        className="w-full rounded-xl border border-(--line) bg-white px-3 py-2 text-sm"
                        disabled={formDisabled}
                      />

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          disabled={formDisabled}
                          className="rounded-xl bg-(--accent) px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Simpan Perubahan
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={isSubmitting}
                          className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--ink-muted) disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Batal
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold">{formatCurrency(transfer.amount)}</p>
                        <p className="text-xs text-(--ink-soft)">{formatDate(transfer.date)}</p>
                      </div>
                      <p className="mt-1 text-sm text-(--ink-muted)">
                        {walletNameById[transfer.fromWalletId] ?? transfer.fromWalletId} to{" "}
                        {walletNameById[transfer.toWalletId] ?? transfer.toWalletId}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-(--over-soft) px-2.5 py-1 text-xs font-semibold text-(--over)">
                          -{formatCurrency(transfer.amount)} dari{" "}
                          {walletNameById[transfer.fromWalletId] ?? transfer.fromWalletId}
                        </span>
                        <span className="rounded-full bg-(--safe-soft) px-2.5 py-1 text-xs font-semibold text-(--safe)">
                          +{formatCurrency(transfer.amount)} ke{" "}
                          {walletNameById[transfer.toWalletId] ?? transfer.toWalletId}
                        </span>
                      </div>
                      {transfer.note ? (
                        <p className="mt-1 text-xs text-(--ink-soft)">{transfer.note}</p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => beginEdit(transfer)}
                          disabled={formDisabled}
                          className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--ink-muted) disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteTransfer(transfer.id)}
                          disabled={formDisabled}
                          className="rounded-xl border border-(--line) bg-white px-3 py-2 text-xs font-semibold text-(--over) disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Hapus
                        </button>
                      </div>
                    </>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      </div>

      {statusMessage ? <p className="mt-4 text-sm text-(--ink-muted)">{statusMessage}</p> : null}
      {!uid ? (
        <p className="mt-2 text-sm text-(--over)">Login dulu untuk mengelola transfer.</p>
      ) : null}
      {syncStatus === "loading" ? (
        <p className="mt-2 text-xs text-(--ink-soft)">Sedang sinkronisasi data transfer...</p>
      ) : null}
    </section>
  );
}
