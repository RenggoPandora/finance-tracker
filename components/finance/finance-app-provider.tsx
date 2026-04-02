"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { type User } from "firebase/auth";
import {
  ensureAuthPersistence,
  resolveRedirectSignInResult,
  signInWithGoogle,
  signOutCurrentUser,
  subscribeToAuthState,
} from "@/lib/firebase/auth";
import {
  addTransfer,
  addWallet,
  addGoal,
  addRoutineExpense,
  addTransaction,
  completeGoal as completeGoalInFirestore,
  deleteGoal,
  deleteTransfer,
  deleteWallet,
  subscribeToFinanceCollections,
  updateGoal,
  updateRoutineExpense,
  updateTransfer,
  updateWallet,
  upsertUserProfile,
} from "@/lib/firebase/finance-firestore";
import { isFirebaseConfigured } from "@/lib/firebase/client";
import { createMockFinanceDataset } from "@/lib/finance/mock-data";
import { LOCAL_DEMO_UID, useFinanceStore } from "@/lib/finance/store";
import {
  type NewGoalInput,
  type NewRoutineExpenseInput,
  type NewTransferInput,
  type NewTransactionInput,
  type NewWalletInput,
  type RoutineExpense,
  type FinanceDataset,
  type Wallet,
} from "@/lib/finance/types";

const AUTH_BOOTSTRAP_TIMEOUT_MS = 8000;
const SIGN_IN_REDIRECT_TIMEOUT_MS = 7000;

function createEmptyFinanceDataset(): FinanceDataset {
  return {
    wallets: [],
    transactions: [],
    routineExpenses: [],
    goals: [],
    transfers: [],
  };
}

function createLocalId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function addWalletDelta(deltaMap: Map<string, number>, walletId: string, delta: number): void {
  deltaMap.set(walletId, (deltaMap.get(walletId) ?? 0) + delta);
}

function applyWalletDeltas(wallets: Wallet[], deltas: Map<string, number>): Wallet[] {
  const availableWalletIds = new Set(wallets.map((wallet) => wallet.id));

  for (const walletId of deltas.keys()) {
    if (!availableWalletIds.has(walletId)) {
      throw new Error("Transfer wallet was not found.");
    }
  }

  return wallets.map((wallet) => {
    const delta = deltas.get(wallet.id) ?? 0;
    if (delta === 0) {
      return wallet;
    }

    const nextBalance = wallet.balance + delta;
    if (nextBalance < 0) {
      throw new Error("Insufficient source wallet balance for transfer.");
    }

    return {
      ...wallet,
      balance: nextBalance,
    };
  });
}

type SyncStatus = "idle" | "loading" | "ready" | "error";

interface FinanceAppContextValue {
  uid: string | null;
  authUser: User | null;
  authReady: boolean;
  authBusy: boolean;
  authError: string | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  mode: "strict" | "flexible";
  isFirebaseConfigured: boolean;
  isDemoMode: boolean;
  showAuthGate: boolean;
  setMode: (mode: "strict" | "flexible") => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  createWallet: (payload: NewWalletInput) => Promise<void>;
  updateWallet: (walletId: string, updates: Partial<NewWalletInput>) => Promise<void>;
  deleteWallet: (walletId: string) => Promise<void>;
  createTransfer: (payload: NewTransferInput) => Promise<void>;
  updateTransfer: (transferId: string, updates: Partial<NewTransferInput>) => Promise<void>;
  deleteTransfer: (transferId: string) => Promise<void>;
  createTransaction: (payload: NewTransactionInput) => Promise<void>;
  createRoutineExpense: (payload: NewRoutineExpenseInput) => Promise<void>;
  updateRoutineExpense: (
    routineExpenseId: string,
    updates: Partial<Pick<RoutineExpense, "plannedAmount" | "isDone" | "actualAmount" | "actualDate">>,
  ) => Promise<void>;
  createGoal: (payload: NewGoalInput) => Promise<void>;
  updateGoal: (
    goalId: string,
    updates: Partial<Pick<NewGoalInput, "name" | "targetAmount" | "deadline" | "linkedWalletId">>,
  ) => Promise<void>;
  completeGoal: (goalId: string) => Promise<void>;
  deleteGoal: (goalId: string) => Promise<void>;
}

const FinanceAppContext = createContext<FinanceAppContextValue | null>(null);

export function FinanceAppProvider({ children }: { children: ReactNode }) {
  const [sessionDate] = useState(() => new Date());
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const uid = useFinanceStore((state) => state.uid);
  const mode = useFinanceStore((state) => state.mode);
  const wallets = useFinanceStore((state) => state.wallets);
  const transactions = useFinanceStore((state) => state.transactions);
  const routineExpenses = useFinanceStore((state) => state.routineExpenses);
  const goals = useFinanceStore((state) => state.goals);
  const transfers = useFinanceStore((state) => state.transfers);
  const syncStatus = useFinanceStore((state) => state.syncStatus);
  const syncError = useFinanceStore((state) => state.syncError);
  const activateUser = useFinanceStore((state) => state.activateUser);
  const clearUser = useFinanceStore((state) => state.clearUser);
  const setSyncStatus = useFinanceStore((state) => state.setSyncStatus);
  const setMode = useFinanceStore((state) => state.setMode);
  const setWallets = useFinanceStore((state) => state.setWallets);
  const setTransactions = useFinanceStore((state) => state.setTransactions);
  const setRoutineExpenses = useFinanceStore((state) => state.setRoutineExpenses);
  const setGoals = useFinanceStore((state) => state.setGoals);
  const setTransfers = useFinanceStore((state) => state.setTransfers);
  const appendWallet = useFinanceStore((state) => state.appendWallet);
  const updateWalletInStore = useFinanceStore((state) => state.updateWallet);
  const removeWalletFromStore = useFinanceStore((state) => state.removeWallet);
  const prependTransaction = useFinanceStore((state) => state.prependTransaction);
  const prependRoutineExpense = useFinanceStore((state) => state.prependRoutineExpense);
  const updateRoutineExpenseInStore = useFinanceStore((state) => state.updateRoutineExpense);
  const prependGoal = useFinanceStore((state) => state.prependGoal);
  const updateGoalInStore = useFinanceStore((state) => state.updateGoal);
  const removeGoalFromStore = useFinanceStore((state) => state.removeGoal);
  const prependTransfer = useFinanceStore((state) => state.prependTransfer);
  const updateTransferInStore = useFinanceStore((state) => state.updateTransfer);
  const removeTransferFromStore = useFinanceStore((state) => state.removeTransfer);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      activateUser(LOCAL_DEMO_UID, createMockFinanceDataset(sessionDate));
      setSyncStatus("ready");
      setAuthReady(true);
      return;
    }

    let isDisposed = false;
    let hasResolvedRedirect = false;
    let hasResolvedAuthState = false;

    const timeoutId = window.setTimeout(() => {
      if (isDisposed) {
        return;
      }

      setAuthReady(true);
      setAuthError((current) => {
        if (current) {
          return current;
        }

        return "Authentication is taking longer than expected. Please try sign-in again.";
      });
    }, AUTH_BOOTSTRAP_TIMEOUT_MS);

    const finishBootstrap = () => {
      if (isDisposed || !hasResolvedRedirect || !hasResolvedAuthState) {
        return;
      }

      window.clearTimeout(timeoutId);
      setAuthReady(true);
    };

    let unsubscribeAuth: () => void = () => undefined;

    try {
      void ensureAuthPersistence().catch((error) => {
        if (isDisposed) {
          return;
        }

        const message =
          error instanceof Error ? error.message : "Failed to prepare browser auth session.";
        setAuthError(message);
      });

      unsubscribeAuth = subscribeToAuthState((nextUser) => {
        if (isDisposed) {
          return;
        }

        setAuthUser(nextUser);

        if (nextUser) {
          setAuthError(null);
        }

        if (!nextUser) {
          clearUser();
        } else {
          activateUser(nextUser.uid, createEmptyFinanceDataset());

          void (async () => {
            try {
              await upsertUserProfile(nextUser.uid, {
                uid: nextUser.uid,
                email: nextUser.email,
                displayName: nextUser.displayName,
                photoURL: nextUser.photoURL,
              });
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Failed to initialize Firebase profile.";
              setAuthError(message);
              setSyncStatus("error", message);
            }
          })();
        }

        hasResolvedAuthState = true;
        finishBootstrap();
      });

      void resolveRedirectSignInResult()
        .catch((error) => {
          if (isDisposed) {
            return;
          }

          const message =
            error instanceof Error ? error.message : "Failed to complete Google sign-in redirect.";
          setAuthError(message);
        })
        .finally(() => {
          hasResolvedRedirect = true;
          finishBootstrap();
        });
    } catch (error) {
      window.clearTimeout(timeoutId);
      const message =
        error instanceof Error ? error.message : "Failed to initialize Firebase authentication.";
      setAuthError(message);
      setSyncStatus("error", message);
      setAuthReady(true);
      clearUser();
      return;
    }

    return () => {
      isDisposed = true;
      window.clearTimeout(timeoutId);
      unsubscribeAuth();
    };
  }, [activateUser, clearUser, sessionDate, setSyncStatus]);

  useEffect(() => {
    if (!uid) {
      return;
    }

    if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
      setSyncStatus("ready");
      return;
    }

    setSyncStatus("loading");

    const unsubscribeSync = subscribeToFinanceCollections(uid, {
      onWallets: (rows) => {
        setWallets(rows);
        setSyncStatus("ready");
      },
      onTransactions: (rows) => {
        setTransactions(rows);
        setSyncStatus("ready");
      },
      onRoutineExpenses: (rows) => {
        setRoutineExpenses(rows);
        setSyncStatus("ready");
      },
      onGoals: (rows) => {
        setGoals(rows);
        setSyncStatus("ready");
      },
      onTransfers: (rows) => {
        setTransfers(rows);
        setSyncStatus("ready");
      },
      onError: (error) => {
        setSyncStatus("error", error.message);
      },
    });

    return unsubscribeSync;
  }, [
    uid,
    setGoals,
    setRoutineExpenses,
    setSyncStatus,
    setTransactions,
    setTransfers,
    setWallets,
  ]);

  const signIn = useCallback(async (): Promise<void> => {
    setAuthBusy(true);
    setAuthError(null);

    const fallbackId = window.setTimeout(() => {
      setAuthBusy(false);
      setAuthError(
        "Google sign-in redirect was blocked. Try again or open this page in Safari/Chrome.",
      );
    }, SIGN_IN_REDIRECT_TIMEOUT_MS);

    try {
      await signInWithGoogle();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Google sign-in failed.");
    } finally {
      window.clearTimeout(fallbackId);
      setAuthBusy(false);
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    setAuthBusy(true);
    setAuthError(null);

    try {
      await signOutCurrentUser();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign-out failed.");
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const createWallet = useCallback(
    async (payload: NewWalletInput): Promise<void> => {
      if (!uid) {
        throw new Error("Sign in before adding a wallet.");
      }

      const name = payload.name.trim();
      const balance = Number(payload.balance);

      if (!name) {
        throw new Error("Wallet name is required.");
      }

      if (!Number.isFinite(balance)) {
        throw new Error("Wallet balance must be a valid number.");
      }

      const nextPayload: NewWalletInput = {
        name,
        type: payload.type,
        balance,
        isSpendingLimitSource: Boolean(payload.isSpendingLimitSource),
      };

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        appendWallet({ id: createLocalId("wallet"), ...nextPayload });
        return;
      }

      await addWallet(uid, nextPayload);
    },
    [uid, appendWallet],
  );

  const updateWalletEntry = useCallback(
    async (walletId: string, updates: Partial<NewWalletInput>): Promise<void> => {
      if (!uid) {
        throw new Error("Sign in before updating a wallet.");
      }

      const nextUpdates: Partial<NewWalletInput> = {};

      if (updates.name !== undefined) {
        const nextName = updates.name.trim();
        if (!nextName) {
          throw new Error("Wallet name is required.");
        }
        nextUpdates.name = nextName;
      }

      if (updates.type !== undefined) {
        nextUpdates.type = updates.type;
      }

      if (updates.balance !== undefined) {
        const nextBalance = Number(updates.balance);
        if (!Number.isFinite(nextBalance)) {
          throw new Error("Wallet balance must be a valid number.");
        }
        nextUpdates.balance = nextBalance;
      }

      if (updates.isSpendingLimitSource !== undefined) {
        nextUpdates.isSpendingLimitSource = Boolean(updates.isSpendingLimitSource);
      }

      if (Object.keys(nextUpdates).length === 0) {
        return;
      }

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        updateWalletInStore(walletId, nextUpdates);
        return;
      }

      await updateWallet(uid, walletId, nextUpdates);
    },
    [uid, updateWalletInStore],
  );

  const deleteWalletEntry = useCallback(
    async (walletId: string): Promise<void> => {
      if (!uid) {
        throw new Error("Sign in before deleting a wallet.");
      }

      if (wallets.length <= 1) {
        throw new Error("At least one wallet must remain.");
      }

      const usedByTransaction = transactions.some((transaction) => transaction.walletId === walletId);
      const usedByGoal = goals.some((goal) => goal.linkedWalletId === walletId);
      const usedByTransfer = transfers.some(
        (transfer) => transfer.fromWalletId === walletId || transfer.toWalletId === walletId,
      );

      if (usedByTransaction || usedByGoal || usedByTransfer) {
        throw new Error(
          "This wallet is still used by transactions, goals, or transfers. Reassign related data first.",
        );
      }

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        removeWalletFromStore(walletId);
        return;
      }

      await deleteWallet(uid, walletId);
    },
    [uid, wallets, transactions, goals, transfers, removeWalletFromStore],
  );

  const createTransfer = useCallback(
    async (payload: NewTransferInput): Promise<void> => {
      if (!uid) {
        throw new Error("Sign in before creating a transfer.");
      }

      const amount = Number(payload.amount);

      if (!payload.fromWalletId || !payload.toWalletId) {
        throw new Error("Source and destination wallets are required.");
      }

      if (payload.fromWalletId === payload.toWalletId) {
        throw new Error("Source and destination wallets must be different.");
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Transfer amount must be greater than 0.");
      }

      const nextPayload: NewTransferInput = {
        ...payload,
        amount,
        note: payload.note?.trim() || undefined,
      };

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        const deltas = new Map<string, number>();
        addWalletDelta(deltas, nextPayload.fromWalletId, -nextPayload.amount);
        addWalletDelta(deltas, nextPayload.toWalletId, nextPayload.amount);
        setWallets(applyWalletDeltas(wallets, deltas));
        prependTransfer({ id: createLocalId("transfer"), ...nextPayload });
        return;
      }

      await addTransfer(uid, nextPayload);
    },
    [uid, prependTransfer, setWallets, wallets],
  );

  const updateTransferEntry = useCallback(
    async (transferId: string, updates: Partial<NewTransferInput>): Promise<void> => {
      if (!uid) {
        throw new Error("Sign in before updating a transfer.");
      }

      const currentTransfer = transfers.find((transfer) => transfer.id === transferId);
      if (!currentTransfer) {
        throw new Error("Transfer was not found.");
      }

      const nextFrom = updates.fromWalletId ?? currentTransfer.fromWalletId;
      const nextTo = updates.toWalletId ?? currentTransfer.toWalletId;

      if (nextFrom && nextTo && nextFrom === nextTo) {
        throw new Error("Source and destination wallets must be different.");
      }

      const nextAmount =
        updates.amount !== undefined ? Number(updates.amount) : currentTransfer.amount;

      if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
        throw new Error("Transfer amount must be greater than 0.");
      }

      const nextUpdates: Partial<NewTransferInput> = {};

      if (updates.fromWalletId !== undefined) {
        nextUpdates.fromWalletId = updates.fromWalletId;
      }

      if (updates.toWalletId !== undefined) {
        nextUpdates.toWalletId = updates.toWalletId;
      }

      if (updates.amount !== undefined) {
        nextUpdates.amount = nextAmount;
      }

      if (updates.date !== undefined) {
        nextUpdates.date = updates.date;
      }

      if (updates.note !== undefined) {
        nextUpdates.note = updates.note.trim();
      }

      if (Object.keys(nextUpdates).length === 0) {
        return;
      }

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        const deltas = new Map<string, number>();
        addWalletDelta(deltas, currentTransfer.fromWalletId, currentTransfer.amount);
        addWalletDelta(deltas, currentTransfer.toWalletId, -currentTransfer.amount);
        addWalletDelta(deltas, nextFrom, -nextAmount);
        addWalletDelta(deltas, nextTo, nextAmount);

        setWallets(applyWalletDeltas(wallets, deltas));
        updateTransferInStore(transferId, nextUpdates);
        return;
      }

      await updateTransfer(uid, transferId, nextUpdates);
    },
    [uid, transfers, setWallets, updateTransferInStore, wallets],
  );

  const deleteTransferEntry = useCallback(
    async (transferId: string): Promise<void> => {
      if (!uid) {
        throw new Error("Sign in before deleting a transfer.");
      }

      const currentTransfer = transfers.find((transfer) => transfer.id === transferId);
      if (!currentTransfer) {
        throw new Error("Transfer was not found.");
      }

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        const deltas = new Map<string, number>();
        addWalletDelta(deltas, currentTransfer.fromWalletId, currentTransfer.amount);
        addWalletDelta(deltas, currentTransfer.toWalletId, -currentTransfer.amount);

        setWallets(applyWalletDeltas(wallets, deltas));
        removeTransferFromStore(transferId);
        return;
      }

      await deleteTransfer(uid, transferId);
    },
    [uid, transfers, setWallets, wallets, removeTransferFromStore],
  );

  const createTransaction = useCallback(
    async (payload: NewTransactionInput): Promise<void> => {
      if (!uid) {
        throw new Error("Sign in before creating a transaction.");
      }

      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Transaction amount must be greater than 0.");
      }

      if (!payload.walletId) {
        throw new Error("A transaction wallet is required.");
      }

      const targetWallet = wallets.find((wallet) => wallet.id === payload.walletId);
      if (!targetWallet) {
        throw new Error("Transaction wallet was not found.");
      }

      const nextPayload: NewTransactionInput = {
        ...payload,
        amount,
        note: payload.note?.trim() || undefined,
      };

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        const walletDelta = nextPayload.type === "income" ? nextPayload.amount : -nextPayload.amount;
        const nextBalance = targetWallet.balance + walletDelta;

        if (nextBalance < 0) {
          throw new Error("Insufficient wallet balance for this expense.");
        }

        setWallets(
          wallets.map((wallet) =>
            wallet.id === targetWallet.id ? { ...wallet, balance: nextBalance } : wallet,
          ),
        );

        prependTransaction({ id: createLocalId("tx"), ...nextPayload });
        return;
      }

      await addTransaction(uid, nextPayload);
    },
    [uid, wallets, setWallets, prependTransaction],
  );

  const createRoutineExpense = useCallback(
    async (payload: NewRoutineExpenseInput): Promise<void> => {
      if (!uid) {
        throw new Error("Sign in before creating a routine.");
      }

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        prependRoutineExpense({ id: createLocalId("routine"), ...payload });
        return;
      }

      await addRoutineExpense(uid, payload);
    },
    [uid, prependRoutineExpense],
  );

  const updateRoutineExpenseEntry = useCallback(
    async (
      routineExpenseId: string,
      updates: Partial<
        Pick<RoutineExpense, "plannedAmount" | "isDone" | "actualAmount" | "actualDate">
      >,
    ): Promise<void> => {
      if (!uid) {
        throw new Error("Sign in before updating a routine.");
      }

      const currentRoutine = routineExpenses.find((routineExpense) => routineExpense.id === routineExpenseId);
      if (!currentRoutine) {
        throw new Error("Routine item was not found.");
      }

      const nextUpdates: Partial<
        Pick<RoutineExpense, "plannedAmount" | "isDone" | "actualAmount" | "actualDate">
      > = {};

      if (updates.plannedAmount !== undefined) {
        const plannedAmount = Number(updates.plannedAmount);
        if (!Number.isFinite(plannedAmount) || plannedAmount <= 0) {
          throw new Error("Routine estimate must be greater than 0.");
        }
        nextUpdates.plannedAmount = plannedAmount;
      }

      if (updates.isDone !== undefined) {
        nextUpdates.isDone = updates.isDone;
      }

      if (updates.actualAmount !== undefined) {
        const actualAmount = Number(updates.actualAmount);
        if (!Number.isFinite(actualAmount) || actualAmount < 0) {
          throw new Error("Routine actual amount is invalid.");
        }
        nextUpdates.actualAmount = actualAmount;
      }

      if (updates.actualDate !== undefined) {
        nextUpdates.actualDate = updates.actualDate;
      }

      if (Object.keys(nextUpdates).length === 0) {
        return;
      }

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        updateRoutineExpenseInStore(routineExpenseId, nextUpdates);
        return;
      }

      await updateRoutineExpense(uid, routineExpenseId, nextUpdates);
    },
    [uid, routineExpenses, updateRoutineExpenseInStore],
  );

  const createGoal = useCallback(
    async (payload: NewGoalInput): Promise<void> => {
      if (!uid) {
        throw new Error("Sign in before creating a goal.");
      }

      const linkedWalletExists = wallets.some((wallet) => wallet.id === payload.linkedWalletId);
      if (!linkedWalletExists) {
        throw new Error("Goal wallet was not found.");
      }

      const linkedWalletAlreadyUsed = goals.some(
        (goal) => goal.linkedWalletId === payload.linkedWalletId,
      );
      if (linkedWalletAlreadyUsed) {
        throw new Error(
          "This wallet is already linked to another goal. Use a different wallet.",
        );
      }

      const nextGoal = {
        ...payload,
        currentSaved: 0,
        isCompleted: false,
        completedAt: undefined,
      };

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        prependGoal({ id: createLocalId("goal"), ...nextGoal });
        return;
      }

      await addGoal(uid, nextGoal);
    },
    [uid, wallets, goals, prependGoal],
  );

  const updateGoalEntry = useCallback(
    async (
      goalId: string,
      updates: Partial<
        Pick<NewGoalInput, "name" | "targetAmount" | "deadline" | "linkedWalletId">
      >,
    ): Promise<void> => {
      if (!uid) {
        throw new Error("Sign in before updating a goal.");
      }

      const currentGoal = goals.find((goal) => goal.id === goalId);
      if (!currentGoal) {
        throw new Error("Goal was not found.");
      }

      if (currentGoal.isCompleted) {
        throw new Error("Completed goals cannot be edited.");
      }

      const nextUpdates: Partial<
        Pick<NewGoalInput, "name" | "targetAmount" | "deadline" | "linkedWalletId">
      > = {};

      if (updates.name !== undefined) {
        const nextName = updates.name.trim();
        if (!nextName) {
          throw new Error("Goal name is required.");
        }
        nextUpdates.name = nextName;
      }

      if (updates.targetAmount !== undefined) {
        const nextTargetAmount = Number(updates.targetAmount);
        if (!Number.isFinite(nextTargetAmount) || nextTargetAmount <= 0) {
          throw new Error("Goal target must be greater than 0.");
        }
        nextUpdates.targetAmount = nextTargetAmount;
      }

      if (updates.deadline !== undefined) {
        const nextDeadline = updates.deadline.trim();
        if (!nextDeadline) {
          throw new Error("Goal deadline is required.");
        }
        nextUpdates.deadline = nextDeadline;
      }

      if (updates.linkedWalletId !== undefined) {
        const linkedWalletExists = wallets.some((wallet) => wallet.id === updates.linkedWalletId);
        if (!linkedWalletExists) {
          throw new Error("Goal wallet was not found.");
        }

        const linkedWalletAlreadyUsed = goals.some(
          (goal) => goal.id !== goalId && goal.linkedWalletId === updates.linkedWalletId,
        );
        if (linkedWalletAlreadyUsed) {
          throw new Error(
            "This wallet is already linked to another goal. Use a different wallet.",
          );
        }

        nextUpdates.linkedWalletId = updates.linkedWalletId;
      }

      if (Object.keys(nextUpdates).length === 0) {
        return;
      }

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        updateGoalInStore(goalId, nextUpdates);
        return;
      }

      await updateGoal(uid, goalId, nextUpdates);
    },
    [uid, goals, wallets, updateGoalInStore],
  );

  const completeGoalEntry = useCallback(
    async (goalId: string): Promise<void> => {
      if (!uid) {
        throw new Error("Sign in before completing a goal.");
      }

      const currentGoal = goals.find((goal) => goal.id === goalId);
      if (!currentGoal) {
        throw new Error("Goal was not found.");
      }

      if (currentGoal.isCompleted) {
        return;
      }

      const deductionAmount = Number(currentGoal.targetAmount);
      if (!Number.isFinite(deductionAmount) || deductionAmount <= 0) {
        throw new Error("Goal target amount is invalid.");
      }

      const linkedWallet = wallets.find((wallet) => wallet.id === currentGoal.linkedWalletId);
      if (!linkedWallet) {
        throw new Error("Goal wallet was not found.");
      }

      const nextWalletBalance = linkedWallet.balance - deductionAmount;
      if (nextWalletBalance < 0) {
        throw new Error("Insufficient linked wallet balance to complete this goal.");
      }

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        setWallets(
          wallets.map((wallet) =>
            wallet.id === linkedWallet.id ? { ...wallet, balance: nextWalletBalance } : wallet,
          ),
        );

        updateGoalInStore(goalId, {
          isCompleted: true,
          completedAt: new Date().toISOString().slice(0, 10),
        });
        return;
      }

      await completeGoalInFirestore(uid, goalId);
    },
    [uid, goals, wallets, setWallets, updateGoalInStore],
  );

  const deleteGoalEntry = useCallback(
    async (goalId: string): Promise<void> => {
      if (!uid) {
        throw new Error("Sign in before deleting a goal.");
      }

      const currentGoal = goals.find((goal) => goal.id === goalId);
      if (!currentGoal) {
        throw new Error("Goal was not found.");
      }

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        removeGoalFromStore(goalId);
        return;
      }

      await deleteGoal(uid, goalId);
    },
    [uid, goals, removeGoalFromStore],
  );

  const isDemoMode = !isFirebaseConfigured || uid === LOCAL_DEMO_UID;
  const showAuthGate = isFirebaseConfigured && authReady && !authUser;

  const contextValue = useMemo<FinanceAppContextValue>(
    () => ({
      uid,
      authUser,
      authReady,
      authBusy,
      authError,
      syncStatus,
      syncError,
      mode,
      isFirebaseConfigured,
      isDemoMode,
      showAuthGate,
      setMode,
      signIn,
      signOut,
      createWallet,
      updateWallet: updateWalletEntry,
      deleteWallet: deleteWalletEntry,
      createTransfer,
      updateTransfer: updateTransferEntry,
      deleteTransfer: deleteTransferEntry,
      createTransaction,
      createRoutineExpense,
      updateRoutineExpense: updateRoutineExpenseEntry,
      createGoal,
      updateGoal: updateGoalEntry,
      completeGoal: completeGoalEntry,
      deleteGoal: deleteGoalEntry,
    }),
    [
      uid,
      authUser,
      authReady,
      authBusy,
      authError,
      syncStatus,
      syncError,
      mode,
      isDemoMode,
      showAuthGate,
      setMode,
      signIn,
      signOut,
      createWallet,
      updateWalletEntry,
      deleteWalletEntry,
      createTransfer,
      updateTransferEntry,
      deleteTransferEntry,
      createTransaction,
      createRoutineExpense,
      updateRoutineExpenseEntry,
      createGoal,
      updateGoalEntry,
      completeGoalEntry,
      deleteGoalEntry,
    ],
  );

  return <FinanceAppContext.Provider value={contextValue}>{children}</FinanceAppContext.Provider>;
}

export function useFinanceAppContext(): FinanceAppContextValue {
  const context = useContext(FinanceAppContext);

  if (!context) {
    throw new Error("useFinanceAppContext must be used within FinanceAppProvider.");
  }

  return context;
}
