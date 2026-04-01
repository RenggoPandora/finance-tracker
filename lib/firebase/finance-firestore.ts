import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type QueryDocumentSnapshot,
  type Transaction as FirestoreTransaction,
  type Unsubscribe,
} from "firebase/firestore";
import { requireFirestore } from "@/lib/firebase/client";
import { DATASET_TO_COLLECTION, FIRESTORE_COLLECTIONS } from "@/lib/firebase/schema";
import {
  type FinanceCollectionKey,
} from "@/lib/firebase/schema";
import {
  type FinanceDataset,
  type Goal,
  type NewGoalInput,
  type NewRoutineExpenseInput,
  type NewTransactionInput,
  type NewTransferInput,
  type NewWalletInput,
  type RoutineExpense,
  type Transaction,
  type Transfer,
  type UserProfile,
  type Wallet,
} from "@/lib/finance/types";

interface FinanceRealtimeCallbacks {
  onWallets: (wallets: Wallet[]) => void;
  onTransactions: (transactions: Transaction[]) => void;
  onRoutineExpenses: (routineExpenses: RoutineExpense[]) => void;
  onGoals: (goals: Goal[]) => void;
  onTransfers: (transfers: Transfer[]) => void;
  onError?: (error: Error) => void;
}

function compactObject<T extends object>(value: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined),
  );
}

function mapSnapshotRows<T extends { id: string }>(
  snapshot: { docs: QueryDocumentSnapshot[] },
): T[] {
  return snapshot.docs.map((row) => {
    return {
      id: row.id,
      ...(row.data() as Omit<T, "id">),
    } as T;
  });
}

function normalizeWallet(wallet: Wallet): Wallet {
  return {
    ...wallet,
    isSpendingLimitSource: Boolean(wallet.isSpendingLimitSource),
  };
}

function userDocument(uid: string) {
  return doc(requireFirestore(), FIRESTORE_COLLECTIONS.users, uid);
}

function userCollection(uid: string, collectionName: string) {
  return collection(requireFirestore(), FIRESTORE_COLLECTIONS.users, uid, collectionName);
}

function walletDocument(uid: string, walletId: string) {
  return doc(
    requireFirestore(),
    FIRESTORE_COLLECTIONS.users,
    uid,
    FIRESTORE_COLLECTIONS.wallets,
    walletId,
  );
}

function transferDocument(uid: string, transferId: string) {
  return doc(
    requireFirestore(),
    FIRESTORE_COLLECTIONS.users,
    uid,
    FIRESTORE_COLLECTIONS.transfers,
    transferId,
  );
}

function addBalanceDelta(
  deltaMap: Map<string, number>,
  walletId: string,
  delta: number,
): void {
  deltaMap.set(walletId, (deltaMap.get(walletId) ?? 0) + delta);
}

function parsePositiveAmount(value: unknown): number {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Nominal transfer tidak valid.");
  }

  return amount;
}

function extractTransferCore(value: Partial<Transfer>): {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
} {
  const fromWalletId = typeof value.fromWalletId === "string" ? value.fromWalletId : "";
  const toWalletId = typeof value.toWalletId === "string" ? value.toWalletId : "";
  const amount = parsePositiveAmount(value.amount);

  if (!fromWalletId || !toWalletId) {
    throw new Error("Data transfer tidak valid.");
  }

  if (fromWalletId === toWalletId) {
    throw new Error("Wallet asal dan tujuan harus berbeda.");
  }

  return {
    fromWalletId,
    toWalletId,
    amount,
  };
}

async function applyWalletBalanceDeltas(
  uid: string,
  transaction: FirestoreTransaction,
  deltas: Map<string, number>,
): Promise<void> {
  const walletsToUpdate = Array.from(deltas.entries())
    .filter(([, delta]) => delta !== 0)
    .map(([walletId]) => ({ walletId, walletRef: walletDocument(uid, walletId) }));

  if (walletsToUpdate.length === 0) {
    return;
  }

  // Firestore transactions require all reads to happen before writes.
  const snapshots = await Promise.all(
    walletsToUpdate.map(({ walletRef }) => transaction.get(walletRef)),
  );

  const nextBalances = walletsToUpdate.map(({ walletId, walletRef }, index) => {
    const walletSnapshot = snapshots[index];
    if (!walletSnapshot || !walletSnapshot.exists()) {
      throw new Error("Wallet transfer tidak ditemukan.");
    }

    const currentBalance = Number(walletSnapshot.data().balance);
    if (!Number.isFinite(currentBalance)) {
      throw new Error("Data saldo wallet tidak valid.");
    }

    const delta = deltas.get(walletId) ?? 0;
    const nextBalance = currentBalance + delta;
    if (nextBalance < 0) {
      throw new Error("Saldo wallet asal tidak cukup untuk transfer.");
    }

    return { walletRef, nextBalance };
  });

  for (const { walletRef, nextBalance } of nextBalances) {
    transaction.update(walletRef, {
      balance: nextBalance,
      updatedAt: serverTimestamp(),
    });
  }
}

export async function upsertUserProfile(uid: string, profile: UserProfile): Promise<void> {
  const userRef = userDocument(uid);
  const userSnapshot = await getDoc(userRef);

  if (!userSnapshot.exists()) {
    await setDoc(userRef, {
      email: profile.email ?? null,
      displayName: profile.displayName ?? null,
      photoURL: profile.photoURL ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await setDoc(
    userRef,
    {
      email: profile.email ?? null,
      displayName: profile.displayName ?? null,
      photoURL: profile.photoURL ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

async function seedCollectionIfEmpty<T extends { id: string }>(
  uid: string,
  collectionName: string,
  rows: T[],
): Promise<boolean> {
  const collectionRef = userCollection(uid, collectionName);
  const existingRows = await getDocs(query(collectionRef, limit(1)));

  if (!existingRows.empty) {
    return false;
  }

  const batch = writeBatch(requireFirestore());

  for (const row of rows) {
    const { id, ...payload } = row;
    batch.set(doc(collectionRef, id), compactObject(payload));
  }

  await batch.commit();
  return true;
}

export async function seedFinanceCollectionsIfEmpty(
  uid: string,
  dataset: FinanceDataset,
): Promise<void> {
  const queue: Array<[FinanceCollectionKey, Array<{ id: string }>]> = [
    ["wallets", dataset.wallets],
    ["transactions", dataset.transactions],
    ["routineExpenses", dataset.routineExpenses],
    ["goals", dataset.goals],
    ["transfers", dataset.transfers],
  ];

  for (const [key, rows] of queue) {
    await seedCollectionIfEmpty(uid, DATASET_TO_COLLECTION[key], rows);
  }
}

export function subscribeToFinanceCollections(
  uid: string,
  callbacks: FinanceRealtimeCallbacks,
): Unsubscribe {
  const onError = (error: Error): void => {
    callbacks.onError?.(error);
  };

  const unsubscribeList: Unsubscribe[] = [];

  unsubscribeList.push(
    onSnapshot(
      query(userCollection(uid, FIRESTORE_COLLECTIONS.wallets), orderBy("name", "asc")),
      (snapshot) =>
        callbacks.onWallets(mapSnapshotRows<Wallet>(snapshot).map(normalizeWallet)),
      onError,
    ),
  );

  unsubscribeList.push(
    onSnapshot(
      query(
        userCollection(uid, FIRESTORE_COLLECTIONS.transactions),
        orderBy("date", "desc"),
      ),
      (snapshot) => callbacks.onTransactions(mapSnapshotRows<Transaction>(snapshot)),
      onError,
    ),
  );

  unsubscribeList.push(
    onSnapshot(
      query(
        userCollection(uid, FIRESTORE_COLLECTIONS.routineExpenses),
        orderBy("dueDate", "asc"),
      ),
      (snapshot) => callbacks.onRoutineExpenses(mapSnapshotRows<RoutineExpense>(snapshot)),
      onError,
    ),
  );

  unsubscribeList.push(
    onSnapshot(
      query(userCollection(uid, FIRESTORE_COLLECTIONS.goals), orderBy("deadline", "asc")),
      (snapshot) => callbacks.onGoals(mapSnapshotRows<Goal>(snapshot)),
      onError,
    ),
  );

  unsubscribeList.push(
    onSnapshot(
      query(userCollection(uid, FIRESTORE_COLLECTIONS.transfers), orderBy("date", "desc")),
      (snapshot) => callbacks.onTransfers(mapSnapshotRows<Transfer>(snapshot)),
      onError,
    ),
  );

  return () => {
    for (const unsubscribe of unsubscribeList) {
      unsubscribe();
    }
  };
}

export async function addWallet(uid: string, input: NewWalletInput): Promise<string> {
  const nextWallet: NewWalletInput = {
    ...input,
    isSpendingLimitSource: Boolean(input.isSpendingLimitSource),
  };

  const result = await addDoc(
    userCollection(uid, FIRESTORE_COLLECTIONS.wallets),
    compactObject({
      ...nextWallet,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return result.id;
}

export async function addTransaction(
  uid: string,
  input: NewTransactionInput,
): Promise<string> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Nominal transaksi tidak valid.");
  }

  if (!input.walletId) {
    throw new Error("Wallet transaksi wajib dipilih.");
  }

  const walletRef = walletDocument(uid, input.walletId);
  const transactionRef = doc(userCollection(uid, FIRESTORE_COLLECTIONS.transactions));
  const walletDelta = input.type === "income" ? amount : -amount;

  await runTransaction(requireFirestore(), async (transaction) => {
    const walletSnapshot = await transaction.get(walletRef);
    if (!walletSnapshot.exists()) {
      throw new Error("Wallet transaksi tidak ditemukan.");
    }

    const currentBalance = Number(walletSnapshot.data().balance);
    if (!Number.isFinite(currentBalance)) {
      throw new Error("Data saldo wallet tidak valid.");
    }

    const nextBalance = currentBalance + walletDelta;
    if (nextBalance < 0) {
      throw new Error("Saldo wallet tidak cukup untuk transaksi expense.");
    }

    transaction.update(walletRef, {
      balance: nextBalance,
      updatedAt: serverTimestamp(),
    });

    transaction.set(
      transactionRef,
      compactObject({
        ...input,
        amount,
        note: input.note?.trim() || undefined,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  return transactionRef.id;
}

export async function addRoutineExpense(
  uid: string,
  input: NewRoutineExpenseInput,
): Promise<string> {
  const result = await addDoc(
    userCollection(uid, FIRESTORE_COLLECTIONS.routineExpenses),
    compactObject({
      ...input,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return result.id;
}

export async function addGoal(uid: string, input: NewGoalInput): Promise<string> {
  const result = await addDoc(
    userCollection(uid, FIRESTORE_COLLECTIONS.goals),
    compactObject({
      ...input,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );

  return result.id;
}

export async function addTransfer(uid: string, input: NewTransferInput): Promise<string> {
  const nextTransfer = extractTransferCore(input);
  const transferRef = doc(userCollection(uid, FIRESTORE_COLLECTIONS.transfers));

  await runTransaction(requireFirestore(), async (transaction) => {
    const deltas = new Map<string, number>();
    addBalanceDelta(deltas, nextTransfer.fromWalletId, -nextTransfer.amount);
    addBalanceDelta(deltas, nextTransfer.toWalletId, nextTransfer.amount);

    await applyWalletBalanceDeltas(uid, transaction, deltas);

    transaction.set(
      transferRef,
      compactObject({
        ...input,
        amount: nextTransfer.amount,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  return transferRef.id;
}

export async function updateWallet(
  uid: string,
  walletId: string,
  updates: Partial<Pick<Wallet, "name" | "type" | "balance" | "isSpendingLimitSource">>,
): Promise<void> {
  const walletRef = doc(
    requireFirestore(),
    FIRESTORE_COLLECTIONS.users,
    uid,
    FIRESTORE_COLLECTIONS.wallets,
    walletId,
  );

  await updateDoc(
    walletRef,
    compactObject({
      ...updates,
      updatedAt: serverTimestamp(),
    }),
  );
}

export async function deleteWallet(uid: string, walletId: string): Promise<void> {
  const walletRef = doc(
    requireFirestore(),
    FIRESTORE_COLLECTIONS.users,
    uid,
    FIRESTORE_COLLECTIONS.wallets,
    walletId,
  );

  await deleteDoc(walletRef);
}

export async function updateTransfer(
  uid: string,
  transferId: string,
  updates: Partial<Pick<Transfer, "fromWalletId" | "toWalletId" | "amount" | "date" | "note">>,
): Promise<void> {
  const transferRef = transferDocument(uid, transferId);

  await runTransaction(requireFirestore(), async (transaction) => {
    const transferSnapshot = await transaction.get(transferRef);
    if (!transferSnapshot.exists()) {
      throw new Error("Transfer tidak ditemukan.");
    }

    const currentTransfer = extractTransferCore(transferSnapshot.data() as Partial<Transfer>);

    const nextTransfer = extractTransferCore({
      fromWalletId: updates.fromWalletId ?? currentTransfer.fromWalletId,
      toWalletId: updates.toWalletId ?? currentTransfer.toWalletId,
      amount: updates.amount ?? currentTransfer.amount,
    });

    const deltas = new Map<string, number>();
    addBalanceDelta(deltas, currentTransfer.fromWalletId, currentTransfer.amount);
    addBalanceDelta(deltas, currentTransfer.toWalletId, -currentTransfer.amount);
    addBalanceDelta(deltas, nextTransfer.fromWalletId, -nextTransfer.amount);
    addBalanceDelta(deltas, nextTransfer.toWalletId, nextTransfer.amount);

    await applyWalletBalanceDeltas(uid, transaction, deltas);

    const nextUpdates = compactObject({
      ...updates,
      amount: updates.amount !== undefined ? nextTransfer.amount : undefined,
      updatedAt: serverTimestamp(),
    });

    transaction.update(transferRef, nextUpdates);
  });
}

export async function deleteTransfer(uid: string, transferId: string): Promise<void> {
  const transferRef = transferDocument(uid, transferId);

  await runTransaction(requireFirestore(), async (transaction) => {
    const transferSnapshot = await transaction.get(transferRef);
    if (!transferSnapshot.exists()) {
      throw new Error("Transfer tidak ditemukan.");
    }

    const currentTransfer = extractTransferCore(transferSnapshot.data() as Partial<Transfer>);

    const deltas = new Map<string, number>();
    addBalanceDelta(deltas, currentTransfer.fromWalletId, currentTransfer.amount);
    addBalanceDelta(deltas, currentTransfer.toWalletId, -currentTransfer.amount);

    await applyWalletBalanceDeltas(uid, transaction, deltas);
    transaction.delete(transferRef);
  });
}

export async function updateRoutineExpense(
  uid: string,
  routineExpenseId: string,
  updates: Partial<Pick<RoutineExpense, "plannedAmount" | "isDone" | "actualAmount" | "actualDate">>,
): Promise<void> {
  const routineRef = doc(
    requireFirestore(),
    FIRESTORE_COLLECTIONS.users,
    uid,
    FIRESTORE_COLLECTIONS.routineExpenses,
    routineExpenseId,
  );

  await updateDoc(
    routineRef,
    compactObject({
      ...updates,
      updatedAt: serverTimestamp(),
    }),
  );
}
