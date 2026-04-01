import { type BudgetStatus } from "@/lib/finance/types";

export const walletTypeLabel = {
  cash: "Cash",
  savings: "Savings",
  investment: "Investment",
} as const;

export const budgetStatusMeta: Record<
  BudgetStatus,
  {
    label: string;
    chipClass: string;
    barClass: string;
  }
> = {
  safe: {
    label: "Aman",
    chipClass: "bg-(--safe-soft) text-(--safe)",
    barClass: "bg-(--safe)",
  },
  warning: {
    label: "Warning",
    chipClass: "bg-(--warning-soft) text-(--warning)",
    barClass: "bg-(--warning)",
  },
  over: {
    label: "Over",
    chipClass: "bg-(--over-soft) text-(--over)",
    barClass: "bg-(--over)",
  },
};
