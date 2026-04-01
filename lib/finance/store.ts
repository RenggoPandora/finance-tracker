import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import {
  type BudgetMode,
  type FinanceDataset,
  type Goal,
  type RoutineExpense,
  type Transaction,
  type Transfer,
  type Wallet,
} from "@/lib/finance/types";

export const LOCAL_DEMO_UID = "local-demo";

type SyncStatus = "idle" | "loading" | "ready" | "error";

function createSafeLocalStorage(): StateStorage {
  return {
    getItem: (name) => {
      try {
        return window.localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      try {
        window.localStorage.setItem(name, value);
      } catch {
        // Ignore write failures (Safari private mode, quota issues, etc.).
      }
    },
    removeItem: (name) => {
      try {
        window.localStorage.removeItem(name);
      } catch {
        // Ignore removal failures for restricted storage environments.
      }
    },
  };
}

interface CachedUserFinance extends FinanceDataset {
  mode: BudgetMode;
  updatedAt: string;
}

function normalizeWallet(wallet: Wallet): Wallet {
  return {
    ...wallet,
    isSpendingLimitSource: Boolean(wallet.isSpendingLimitSource),
  };
}

interface FinanceStoreState extends FinanceDataset {
  uid: string | null;
  mode: BudgetMode;
  syncStatus: SyncStatus;
  syncError: string | null;
  userCache: Record<string, CachedUserFinance>;
  activateUser: (uid: string, fallbackData: FinanceDataset) => void;
  clearUser: () => void;
  setSyncStatus: (status: SyncStatus, error?: string | null) => void;
  setMode: (mode: BudgetMode) => void;
  setWallets: (wallets: Wallet[]) => void;
  setTransactions: (transactions: Transaction[]) => void;
  setRoutineExpenses: (routineExpenses: RoutineExpense[]) => void;
  setGoals: (goals: Goal[]) => void;
  setTransfers: (transfers: Transfer[]) => void;
  appendWallet: (wallet: Wallet) => void;
  updateWallet: (
    walletId: string,
    updates: Partial<Pick<Wallet, "name" | "type" | "balance" | "isSpendingLimitSource">>,
  ) => void;
  removeWallet: (walletId: string) => void;
  prependTransaction: (transaction: Transaction) => void;
  prependRoutineExpense: (routineExpense: RoutineExpense) => void;
  updateRoutineExpense: (
    routineExpenseId: string,
    updates: Partial<Omit<RoutineExpense, "id">>,
  ) => void;
  prependGoal: (goal: Goal) => void;
  updateGoal: (
    goalId: string,
    updates: Partial<Pick<Goal, "name" | "targetAmount" | "deadline" | "linkedWalletId">>,
  ) => void;
  removeGoal: (goalId: string) => void;
  prependTransfer: (transfer: Transfer) => void;
  updateTransfer: (
    transferId: string,
    updates: Partial<Omit<Transfer, "id">>,
  ) => void;
  removeTransfer: (transferId: string) => void;
}

const EMPTY_DATASET: FinanceDataset = {
  wallets: [],
  transactions: [],
  routineExpenses: [],
  goals: [],
  transfers: [],
};

function copyDataset(dataset: FinanceDataset): FinanceDataset {
  return {
    wallets: dataset.wallets.map(normalizeWallet),
    transactions: [...dataset.transactions],
    routineExpenses: [...dataset.routineExpenses],
    goals: [...dataset.goals],
    transfers: [...dataset.transfers],
  };
}

function toDataset(state: FinanceStoreState): FinanceDataset {
  return {
    wallets: state.wallets,
    transactions: state.transactions,
    routineExpenses: state.routineExpenses,
    goals: state.goals,
    transfers: state.transfers,
  };
}

function writeCurrentUserCache(
  state: FinanceStoreState,
  nextDataset: FinanceDataset,
  nextMode = state.mode,
): Record<string, CachedUserFinance> {
  if (!state.uid) {
    return state.userCache;
  }

  return {
    ...state.userCache,
    [state.uid]: {
      ...copyDataset(nextDataset),
      mode: nextMode,
      updatedAt: new Date().toISOString(),
    },
  };
}

function withCollectionUpdate(
  state: FinanceStoreState,
  patch: Partial<FinanceDataset>,
): Partial<FinanceStoreState> {
  const nextDataset: FinanceDataset = {
    ...toDataset(state),
    ...patch,
  };

  return {
    ...patch,
    userCache: writeCurrentUserCache(state, nextDataset),
  };
}

export const useFinanceStore = create<FinanceStoreState>()(
  persist(
    (set) => ({
      ...EMPTY_DATASET,
      uid: null,
      mode: "flexible",
      syncStatus: "idle",
      syncError: null,
      userCache: {},

      activateUser: (uid, fallbackData) => {
        set((state) => {
          const cached = state.userCache[uid];

          if (cached) {
            const nextDataset = copyDataset(cached);
            return {
              ...nextDataset,
              uid,
              mode: cached.mode,
              syncStatus: "loading",
              syncError: null,
            };
          }

          const nextDataset = copyDataset(fallbackData);
          return {
            ...nextDataset,
            uid,
            syncStatus: "loading",
            syncError: null,
            userCache: writeCurrentUserCache(state, nextDataset, state.mode),
          };
        });
      },

      clearUser: () => {
        set({
          ...EMPTY_DATASET,
          uid: null,
          syncStatus: "idle",
          syncError: null,
        });
      },

      setSyncStatus: (status, error = null) => {
        set({
          syncStatus: status,
          syncError: error,
        });
      },

      setMode: (mode) => {
        set((state) => {
          const nextDataset = toDataset(state);
          return {
            mode,
            userCache: writeCurrentUserCache(state, nextDataset, mode),
          };
        });
      },

      setWallets: (wallets) => {
        set((state) =>
          withCollectionUpdate(state, {
            wallets: wallets.map(normalizeWallet),
          }),
        );
      },

      setTransactions: (transactions) => {
        set((state) => withCollectionUpdate(state, { transactions }));
      },

      setRoutineExpenses: (routineExpenses) => {
        set((state) => withCollectionUpdate(state, { routineExpenses }));
      },

      setGoals: (goals) => {
        set((state) => withCollectionUpdate(state, { goals }));
      },

      setTransfers: (transfers) => {
        set((state) => withCollectionUpdate(state, { transfers }));
      },

      appendWallet: (wallet) => {
        set((state) => {
          const wallets = [...state.wallets, normalizeWallet(wallet)]
            .map(normalizeWallet)
            .sort((left, right) => left.name.localeCompare(right.name));

          return withCollectionUpdate(state, { wallets });
        });
      },

      updateWallet: (walletId, updates) => {
        set((state) => {
          const wallets = state.wallets
            .map((wallet) =>
              wallet.id === walletId
                ? normalizeWallet({ ...wallet, ...updates })
                : normalizeWallet(wallet),
            )
            .sort((left, right) => left.name.localeCompare(right.name));

          return withCollectionUpdate(state, { wallets });
        });
      },

      removeWallet: (walletId) => {
        set((state) => {
          const wallets = state.wallets.filter((wallet) => wallet.id !== walletId);
          return withCollectionUpdate(state, { wallets });
        });
      },

      prependTransaction: (transaction) => {
        set((state) => {
          const transactions = [transaction, ...state.transactions];
          return withCollectionUpdate(state, { transactions });
        });
      },

      prependRoutineExpense: (routineExpense) => {
        set((state) => {
          const routineExpenses = [...state.routineExpenses, routineExpense].sort((left, right) =>
            (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31"),
          );

          return withCollectionUpdate(state, { routineExpenses });
        });
      },

      updateRoutineExpense: (routineExpenseId, updates) => {
        set((state) => {
          const routineExpenses = state.routineExpenses
            .map((routineExpense) =>
              routineExpense.id === routineExpenseId
                ? { ...routineExpense, ...updates }
                : routineExpense,
            )
            .sort((left, right) =>
              (left.dueDate ?? "9999-12-31").localeCompare(right.dueDate ?? "9999-12-31"),
            );

          return withCollectionUpdate(state, { routineExpenses });
        });
      },

      prependGoal: (goal) => {
        set((state) => {
          const goals = [...state.goals, goal].sort((left, right) =>
            left.deadline.localeCompare(right.deadline),
          );

          return withCollectionUpdate(state, { goals });
        });
      },

      updateGoal: (goalId, updates) => {
        set((state) => {
          const goals = state.goals
            .map((goal) => (goal.id === goalId ? { ...goal, ...updates } : goal))
            .sort((left, right) => left.deadline.localeCompare(right.deadline));

          return withCollectionUpdate(state, { goals });
        });
      },

      removeGoal: (goalId) => {
        set((state) => {
          const goals = state.goals.filter((goal) => goal.id !== goalId);
          return withCollectionUpdate(state, { goals });
        });
      },

      prependTransfer: (transfer) => {
        set((state) => {
          const transfers = [transfer, ...state.transfers].sort((left, right) =>
            right.date.localeCompare(left.date),
          );

          return withCollectionUpdate(state, { transfers });
        });
      },

      updateTransfer: (transferId, updates) => {
        set((state) => {
          const transfers = state.transfers
            .map((transfer) =>
              transfer.id === transferId ? { ...transfer, ...updates } : transfer,
            )
            .sort((left, right) => right.date.localeCompare(left.date));

          return withCollectionUpdate(state, { transfers });
        });
      },

      removeTransfer: (transferId) => {
        set((state) => {
          const transfers = state.transfers.filter((transfer) => transfer.id !== transferId);
          return withCollectionUpdate(state, { transfers });
        });
      },
    }),
    {
      name: "finance-tracker-user-cache-v1",
      storage: createJSONStorage(createSafeLocalStorage),
      partialize: (state) => ({
        userCache: state.userCache,
      }),
    },
  ),
);
