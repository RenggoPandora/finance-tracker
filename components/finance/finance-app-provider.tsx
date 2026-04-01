"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type User } from "firebase/auth";
import { signInWithGoogle, signOutCurrentUser, subscribeToAuthState } from "@/lib/firebase/auth";
import {
  addTransfer,
  addWallet,
  addGoal,
  addRoutineExpense,
  addTransaction,
  deleteTransfer,
  deleteWallet,
  seedFinanceCollectionsIfEmpty,
  subscribeToFinanceCollections,
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
  type Wallet,
} from "@/lib/finance/types";

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
      throw new Error("Wallet transfer tidak ditemukan.");
    }
  }

  return wallets.map((wallet) => {
    const delta = deltas.get(wallet.id) ?? 0;
    if (delta === 0) {
      return wallet;
    }

    const nextBalance = wallet.balance + delta;
    if (nextBalance < 0) {
      throw new Error("Saldo wallet asal tidak cukup untuk transfer.");
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
  createGoal: (payload: NewGoalInput) => Promise<void>;
}

const FinanceAppContext = createContext<FinanceAppContextValue | null>(null);

export function FinanceAppProvider({ children }: { children: ReactNode }) {
  const [sessionDate] = useState(() => new Date());
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const seededUsersRef = useRef<Set<string>>(new Set());

  const uid = useFinanceStore((state) => state.uid);
  const mode = useFinanceStore((state) => state.mode);
  const wallets = useFinanceStore((state) => state.wallets);
  const transactions = useFinanceStore((state) => state.transactions);
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
  const prependGoal = useFinanceStore((state) => state.prependGoal);
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

    const unsubscribeAuth = subscribeToAuthState((nextUser) => {
      setAuthUser(nextUser);
      setAuthReady(true);
      setAuthError(null);

      if (!nextUser) {
        clearUser();
        return;
      }

      activateUser(nextUser.uid, createMockFinanceDataset(sessionDate));

      void (async () => {
        try {
          await upsertUserProfile(nextUser.uid, {
            uid: nextUser.uid,
            email: nextUser.email,
            displayName: nextUser.displayName,
            photoURL: nextUser.photoURL,
          });

          if (!seededUsersRef.current.has(nextUser.uid)) {
            await seedFinanceCollectionsIfEmpty(
              nextUser.uid,
              createMockFinanceDataset(sessionDate),
            );
            seededUsersRef.current.add(nextUser.uid);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Gagal menyiapkan profile Firebase.";
          setAuthError(message);
          setSyncStatus("error", message);
        }
      })();
    });

    return unsubscribeAuth;
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

    try {
      await signInWithGoogle();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Gagal login dengan Google.");
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    setAuthBusy(true);
    setAuthError(null);

    try {
      await signOutCurrentUser();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Gagal logout.");
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const createWallet = useCallback(
    async (payload: NewWalletInput): Promise<void> => {
      if (!uid) {
        throw new Error("Login dulu sebelum menambah wallet.");
      }

      const name = payload.name.trim();
      const balance = Number(payload.balance);

      if (!name) {
        throw new Error("Nama wallet wajib diisi.");
      }

      if (!Number.isFinite(balance)) {
        throw new Error("Saldo wallet harus berupa angka valid.");
      }

      const nextPayload: NewWalletInput = {
        name,
        type: payload.type,
        balance,
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
        throw new Error("Login dulu sebelum mengubah wallet.");
      }

      const nextUpdates: Partial<NewWalletInput> = {};

      if (updates.name !== undefined) {
        const nextName = updates.name.trim();
        if (!nextName) {
          throw new Error("Nama wallet wajib diisi.");
        }
        nextUpdates.name = nextName;
      }

      if (updates.type !== undefined) {
        nextUpdates.type = updates.type;
      }

      if (updates.balance !== undefined) {
        const nextBalance = Number(updates.balance);
        if (!Number.isFinite(nextBalance)) {
          throw new Error("Saldo wallet harus berupa angka valid.");
        }
        nextUpdates.balance = nextBalance;
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
        throw new Error("Login dulu sebelum menghapus wallet.");
      }

      if (wallets.length <= 1) {
        throw new Error("Minimal satu wallet harus tersedia.");
      }

      const usedByTransaction = transactions.some((transaction) => transaction.walletId === walletId);
      const usedByGoal = goals.some((goal) => goal.linkedWalletId === walletId);
      const usedByTransfer = transfers.some(
        (transfer) => transfer.fromWalletId === walletId || transfer.toWalletId === walletId,
      );

      if (usedByTransaction || usedByGoal || usedByTransfer) {
        throw new Error(
          "Wallet masih dipakai oleh transaksi, goals, atau transfers. Pindahkan datanya dulu.",
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
        throw new Error("Login dulu sebelum menambah transfer.");
      }

      const amount = Number(payload.amount);

      if (!payload.fromWalletId || !payload.toWalletId) {
        throw new Error("Wallet asal dan tujuan wajib dipilih.");
      }

      if (payload.fromWalletId === payload.toWalletId) {
        throw new Error("Wallet asal dan tujuan harus berbeda.");
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Nominal transfer harus lebih dari 0.");
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
        throw new Error("Login dulu sebelum mengubah transfer.");
      }

      const currentTransfer = transfers.find((transfer) => transfer.id === transferId);
      if (!currentTransfer) {
        throw new Error("Transfer tidak ditemukan.");
      }

      const nextFrom = updates.fromWalletId ?? currentTransfer.fromWalletId;
      const nextTo = updates.toWalletId ?? currentTransfer.toWalletId;

      if (nextFrom && nextTo && nextFrom === nextTo) {
        throw new Error("Wallet asal dan tujuan harus berbeda.");
      }

      const nextAmount =
        updates.amount !== undefined ? Number(updates.amount) : currentTransfer.amount;

      if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
        throw new Error("Nominal transfer harus lebih dari 0.");
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
        throw new Error("Login dulu sebelum menghapus transfer.");
      }

      const currentTransfer = transfers.find((transfer) => transfer.id === transferId);
      if (!currentTransfer) {
        throw new Error("Transfer tidak ditemukan.");
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
        throw new Error("Login dulu sebelum menambah transaksi.");
      }

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        prependTransaction({ id: createLocalId("tx"), ...payload });
        return;
      }

      await addTransaction(uid, payload);
    },
    [uid, prependTransaction],
  );

  const createRoutineExpense = useCallback(
    async (payload: NewRoutineExpenseInput): Promise<void> => {
      if (!uid) {
        throw new Error("Login dulu sebelum menambah routine.");
      }

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        prependRoutineExpense({ id: createLocalId("routine"), ...payload });
        return;
      }

      await addRoutineExpense(uid, payload);
    },
    [uid, prependRoutineExpense],
  );

  const createGoal = useCallback(
    async (payload: NewGoalInput): Promise<void> => {
      if (!uid) {
        throw new Error("Login dulu sebelum menambah goal.");
      }

      const linkedWalletExists = wallets.some((wallet) => wallet.id === payload.linkedWalletId);
      if (!linkedWalletExists) {
        throw new Error("Wallet untuk goal tidak ditemukan.");
      }

      const linkedWalletAlreadyUsed = goals.some(
        (goal) => goal.linkedWalletId === payload.linkedWalletId,
      );
      if (linkedWalletAlreadyUsed) {
        throw new Error(
          "Wallet ini sudah dipakai goal lain. Gunakan wallet berbeda agar alokasi goal jelas.",
        );
      }

      const nextGoal = {
        ...payload,
        currentSaved: 0,
      };

      if (!isFirebaseConfigured || uid === LOCAL_DEMO_UID) {
        prependGoal({ id: createLocalId("goal"), ...nextGoal });
        return;
      }

      await addGoal(uid, nextGoal);
    },
    [uid, wallets, goals, prependGoal],
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
      createGoal,
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
      createGoal,
    ],
  );

  return <FinanceAppContext.Provider value={contextValue}>{children}</FinanceAppContext.Provider>;
}

export function useFinanceAppContext(): FinanceAppContextValue {
  const context = useContext(FinanceAppContext);

  if (!context) {
    throw new Error("useFinanceAppContext harus dipakai di dalam FinanceAppProvider.");
  }

  return context;
}
