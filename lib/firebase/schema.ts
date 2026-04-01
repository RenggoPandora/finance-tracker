import { type FinanceDataset } from "@/lib/finance/types";

export const FIRESTORE_COLLECTIONS = {
  users: "users",
  wallets: "wallets",
  transactions: "transactions",
  routineExpenses: "routine_expenses",
  goals: "goals",
  transfers: "transfers",
} as const;

export type FinanceCollectionKey = keyof FinanceDataset;

export const DATASET_TO_COLLECTION: Record<FinanceCollectionKey, string> = {
  wallets: FIRESTORE_COLLECTIONS.wallets,
  transactions: FIRESTORE_COLLECTIONS.transactions,
  routineExpenses: FIRESTORE_COLLECTIONS.routineExpenses,
  goals: FIRESTORE_COLLECTIONS.goals,
  transfers: FIRESTORE_COLLECTIONS.transfers,
};
