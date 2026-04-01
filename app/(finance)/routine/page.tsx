"use client";

import { formatCurrency, formatDate, formatPercent } from "@/lib/finance/format";
import { useFinanceData } from "@/lib/finance/use-finance-data";

export default function RoutinePage() {
  const { dataset, routineCompletion, snapshot } = useFinanceData();

  return (
    <section className="glass-panel p-5 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Routine Expenses</h2>
          <p className="text-sm text-(--ink-muted)">Planned vs actual bulanan.</p>
        </div>
        <span className="chip">{formatPercent(routineCompletion)} selesai</span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <article className="metric-card">
          <p className="stat-label">Real Balance</p>
          <p className="mt-1 text-lg font-semibold">{formatCurrency(snapshot.totalBalance)}</p>
          <p className="mt-1 text-xs text-(--ink-muted)">Saldo aktual dari seluruh wallet.</p>
        </article>
        <article className="metric-card">
          <p className="stat-label">Projected Balance</p>
          <p className="mt-1 text-lg font-semibold text-(--warning)">
            {formatCurrency(snapshot.projectedBalance)}
          </p>
          <p className="mt-1 text-xs text-(--ink-muted)">Estimasi saldo setelah planned routine.</p>
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
            <div className="flex items-center justify-between">
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
          </article>
        ))}
      </div>
    </section>
  );
}
