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
    label: "Safe",
    chipClass: "bg-(--safe-soft) text-(--safe)",
    barClass: "bg-(--safe)",
  },
  warning: {
    label: "Caution",
    chipClass: "bg-(--warning-soft) text-(--warning)",
    barClass: "bg-(--warning)",
  },
  over: {
    label: "Over Limit",
    chipClass: "bg-(--over-soft) text-(--over)",
    barClass: "bg-(--over)",
  },
};
