"use client";

import QuickEntryPanel from "@/components/finance/quick-entry-panel";
import { useFinanceAppContext } from "@/components/finance/finance-app-provider";
import { useFinanceData } from "@/lib/finance/use-finance-data";

export default function InputPage() {
  const {
    uid,
    syncStatus,
    syncError,
    authError,
    createTransaction,
    createRoutineExpense,
    createGoal,
  } = useFinanceAppContext();
  const { dataset } = useFinanceData();

  return (
    <section className="glass-panel p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-xl font-semibold">Quick Input</h2>
        <p className="text-sm text-(--ink-muted)">
          Form dipisah khusus untuk input transaksi, routine expense, dan goal dengan cepat.
        </p>
      </div>

      <QuickEntryPanel
        wallets={dataset.wallets}
        goalWalletIdsInUse={dataset.goals.map((goal) => goal.linkedWalletId)}
        disabled={!uid || syncStatus === "loading"}
        onCreateTransaction={createTransaction}
        onCreateRoutineExpense={createRoutineExpense}
        onCreateGoal={createGoal}
      />

      {syncError ? <p className="mt-3 text-sm text-(--over)">{syncError}</p> : null}
      {authError ? <p className="mt-2 text-sm text-(--over)">{authError}</p> : null}
    </section>
  );
}
