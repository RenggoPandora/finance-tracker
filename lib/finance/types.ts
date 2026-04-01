export type TransactionType = "income" | "expense";
export type WalletType = "cash" | "savings" | "investment";
export type BudgetMode = "strict" | "flexible";
export type BudgetStatus = "safe" | "warning" | "over";

export interface Wallet {
  id: string;
  name: string;
  type: WalletType;
  balance: number;
  isSpendingLimitSource: boolean;
}

export interface Transaction {
  id: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string;
  walletId: string;
  isPersonalSpending: boolean;
  note?: string;
}

export interface RoutineExpense {
  id: string;
  name: string;
  plannedAmount: number;
  isDone: boolean;
  dueDate?: string;
  actualAmount?: number;
  actualDate?: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  deadline: string;
  currentSaved: number;
  linkedWalletId: string;
}

export interface Transfer {
  id: string;
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  date: string;
  note?: string;
}

export type NewWalletInput = Omit<Wallet, "id">;
export type NewTransactionInput = Omit<Transaction, "id">;
export type NewRoutineExpenseInput = Omit<RoutineExpense, "id">;
export type NewGoalInput = Omit<Goal, "id">;
export type NewTransferInput = Omit<Transfer, "id">;

export interface UserProfile {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}

export interface FinanceDataset {
  wallets: Wallet[];
  transactions: Transaction[];
  routineExpenses: RoutineExpense[];
  goals: Goal[];
  transfers: Transfer[];
}

export interface BudgetHealth {
  status: BudgetStatus;
  pointsDelta: number;
  message: string;
}

export interface WalletDistribution extends Wallet {
  share: number;
}

export interface GoalProgress extends Goal {
  progressRatio: number;
  amountLeft: number;
}

export interface DailySpendingPoint {
  day: number;
  amount: number;
  overLimit: boolean;
}

export interface FinanceSnapshot {
  totalBalance: number;
  projectedBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  personalSpending: number;
  netCashflow: number;
  transferVolume: number;
  plannedRoutineTotal: number;
  actualRoutineTotal: number;
  remainingPlannedExpenses: number;
  lockedGoals: number;
  spendingLimitSourceBalance: number;
  spendingLimitExpenses: number;
  spendingLimitSourceWalletCount: number;
  isSpendingLimitWalletSelectionActive: boolean;
  availableMoney: number;
  strictSavingsRate: number;
  strictSavingsAmount: number;
  spendingBudgetPool: number;
  remainingDays: number;
  baseDailyBudget: number;
  carryForwardBudget: number;
  dailySafeBudget: number;
  todayPersonalSpending: number;
  streakDays: number;
  disciplineScore: number;
  budgetHealth: BudgetHealth;
  walletDistribution: WalletDistribution[];
  goalProgress: GoalProgress[];
  dailySpending: DailySpendingPoint[];
}

export interface FinanceSnapshotInput extends FinanceDataset {
  today?: Date | string;
  mode?: BudgetMode;
  softCapMultiplier?: number;
  strictSavingsRate?: number;
}
