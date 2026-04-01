"use client";

import { useMemo, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/finance/format";
import { useFinanceData } from "@/lib/finance/use-finance-data";

type LedgerFilter = "all" | "income" | "expense" | "transfer";

type LedgerEntry = {
  id: string;
  date: string;
  kind: LedgerFilter;
  amount: number;
  title: string;
  detail: string;
};

const filterMeta: Record<LedgerFilter, { label: string }> = {
  all: { label: "All" },
  income: { label: "Income" },
  expense: { label: "Expense" },
  transfer: { label: "Transfer" },
};

export default function AllTransactionsPage() {
  const { dataset, walletNameById } = useFinanceData();
  const [filter, setFilter] = useState<LedgerFilter>("all");

  const ledgerEntries = useMemo<LedgerEntry[]>(() => {
    const transactionEntries: LedgerEntry[] = dataset.transactions.map((transaction) => ({
      id: `tx-${transaction.id}`,
      date: transaction.date,
      kind: transaction.type,
      amount: transaction.amount,
      title: transaction.category,
      detail: `${walletNameById[transaction.walletId] ?? transaction.walletId} • ${
        transaction.isPersonalSpending ? "Personal" : "Non-personal"
      }`,
    }));

    const transferEntries: LedgerEntry[] = dataset.transfers.map((transfer) => {
      const fromName = walletNameById[transfer.fromWalletId] ?? transfer.fromWalletId;
      const toName = walletNameById[transfer.toWalletId] ?? transfer.toWalletId;

      return {
        id: `tr-${transfer.id}`,
        date: transfer.date,
        kind: "transfer",
        amount: transfer.amount,
        title: "Wallet Transfer",
        detail: `${fromName} -> ${toName}`,
      };
    });

    return [...transactionEntries, ...transferEntries].sort((left, right) => {
      const byDate = right.date.localeCompare(left.date);
      if (byDate !== 0) {
        return byDate;
      }

      return right.id.localeCompare(left.id);
    });
  }, [dataset.transactions, dataset.transfers, walletNameById]);

  const filteredEntries = useMemo(() => {
    if (filter === "all") {
      return ledgerEntries;
    }

    return ledgerEntries.filter((entry) => entry.kind === filter);
  }, [ledgerEntries, filter]);

  const incomeTotal = useMemo(
    () =>
      ledgerEntries
        .filter((entry) => entry.kind === "income")
        .reduce((sum, entry) => sum + entry.amount, 0),
    [ledgerEntries],
  );

  const expenseTotal = useMemo(
    () =>
      ledgerEntries
        .filter((entry) => entry.kind === "expense")
        .reduce((sum, entry) => sum + entry.amount, 0),
    [ledgerEntries],
  );

  const transferTotal = useMemo(
    () =>
      ledgerEntries
        .filter((entry) => entry.kind === "transfer")
        .reduce((sum, entry) => sum + entry.amount, 0),
    [ledgerEntries],
  );

  return (
    <section className="glass-panel p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">All Transactions</h2>
          <p className="text-sm text-(--ink-muted)">
            Complete history of income, expenses, and wallet transfers.
          </p>
        </div>
        <span className="chip">{filteredEntries.length} records</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <article className="metric-card">
          <p className="stat-label">Total Income</p>
          <p className="mt-1 text-lg font-semibold text-(--safe)">{formatCurrency(incomeTotal)}</p>
        </article>
        <article className="metric-card">
          <p className="stat-label">Total Expense</p>
          <p className="mt-1 text-lg font-semibold text-(--over)">{formatCurrency(expenseTotal)}</p>
        </article>
        <article className="metric-card">
          <p className="stat-label">Volume Transfer</p>
          <p className="mt-1 text-lg font-semibold text-(--ink)">{formatCurrency(transferTotal)}</p>
        </article>
        <article className="metric-card">
          <p className="stat-label">Net Flow</p>
          <p
            className={`mt-1 text-lg font-semibold ${
              incomeTotal - expenseTotal >= 0 ? "text-(--safe)" : "text-(--over)"
            }`}
          >
            {incomeTotal - expenseTotal >= 0 ? "+" : ""}
            {formatCurrency(incomeTotal - expenseTotal)}
          </p>
        </article>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(filterMeta) as LedgerFilter[]).map((filterKey) => (
          <button
            key={filterKey}
            type="button"
            onClick={() => setFilter(filterKey)}
            className={`rounded-xl border px-3 py-1.5 text-xs font-semibold ${
              filter === filterKey
                ? "border-(--accent) bg-(--accent) text-white"
                : "border-(--line) bg-white text-(--ink-muted)"
            }`}
          >
            {filterMeta[filterKey].label}
          </button>
        ))}
      </div>

      <div className="mt-4 h-[28rem] space-y-3 overflow-y-auto pr-1 sm:h-[34rem]">
        {filteredEntries.length === 0 ? (
          <p className="text-sm text-(--ink-muted)">No transactions yet.</p>
        ) : (
          filteredEntries.map((entry) => {
            const toneClass =
              entry.kind === "income"
                ? "text-(--safe)"
                : entry.kind === "expense"
                  ? "text-(--over)"
                  : "text-(--ink)";

            const amountPrefix =
              entry.kind === "income" ? "+" : entry.kind === "expense" ? "-" : "";

            return (
              <article
                key={entry.id}
                className="rounded-2xl border border-(--line) bg-(--surface-solid) p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{entry.title}</p>
                    <p className="mt-1 text-xs text-(--ink-muted)">{entry.detail}</p>
                    <p className="mt-1 text-xs text-(--ink-soft)">{formatDate(entry.date)}</p>
                  </div>

                  <div className="text-right">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                        entry.kind === "income"
                          ? "bg-(--safe-soft) text-(--safe)"
                          : entry.kind === "expense"
                            ? "bg-(--over-soft) text-(--over)"
                            : "bg-(--line) text-(--ink-muted)"
                      }`}
                    >
                      {entry.kind}
                    </span>
                    <p className={`mt-2 text-sm font-semibold ${toneClass}`}>
                      {amountPrefix}
                      {formatCurrency(entry.amount)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
