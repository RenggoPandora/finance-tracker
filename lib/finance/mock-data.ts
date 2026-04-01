import { type FinanceDataset } from "@/lib/finance/types";

function toIsoDate(year: number, month: number, day: number): string {
  const safeDay = String(day).padStart(2, "0");
  const safeMonth = String(month).padStart(2, "0");
  return `${year}-${safeMonth}-${safeDay}`;
}

function shiftMonthIso(referenceDate: Date, monthOffset: number, day: number): string {
  const shiftedDate = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + monthOffset,
    1,
  );
  const maxDay = new Date(
    shiftedDate.getFullYear(),
    shiftedDate.getMonth() + 1,
    0,
  ).getDate();

  return toIsoDate(
    shiftedDate.getFullYear(),
    shiftedDate.getMonth() + 1,
    Math.min(day, maxDay),
  );
}

export function createMockFinanceDataset(referenceDate = new Date()): FinanceDataset {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const date = (day: number): string => toIsoDate(year, month, Math.min(day, daysInMonth));

  const wallets = [
    { id: "w-cash", name: "Cash", type: "cash", balance: 1_750_000 },
    { id: "w-save-a", name: "Tabungan Utama", type: "savings", balance: 5_250_000 },
    { id: "w-save-b", name: "Tabungan Liburan", type: "savings", balance: 2_400_000 },
    { id: "w-invest", name: "Investasi", type: "investment", balance: 3_800_000 },
  ] as const;

  const transactions = [
    {
      id: "tx-1",
      amount: 9_000_000,
      type: "income",
      category: "Salary",
      date: date(1),
      walletId: "w-save-a",
      isPersonalSpending: false,
      note: "Gaji bulanan",
    },
    {
      id: "tx-2",
      amount: 1_800_000,
      type: "income",
      category: "Freelance",
      date: date(11),
      walletId: "w-cash",
      isPersonalSpending: false,
      note: "Project design",
    },
    {
      id: "tx-3",
      amount: 420_000,
      type: "expense",
      category: "Makanan",
      date: date(2),
      walletId: "w-cash",
      isPersonalSpending: true,
      note: "Belanja mingguan",
    },
    {
      id: "tx-4",
      amount: 180_000,
      type: "expense",
      category: "Transport",
      date: date(4),
      walletId: "w-cash",
      isPersonalSpending: true,
      note: "Bensin",
    },
    {
      id: "tx-5",
      amount: 95_000,
      type: "expense",
      category: "Kopi",
      date: date(5),
      walletId: "w-cash",
      isPersonalSpending: true,
      note: "Meeting cafe",
    },
    {
      id: "tx-6",
      amount: 600_000,
      type: "expense",
      category: "Asuransi",
      date: date(6),
      walletId: "w-save-a",
      isPersonalSpending: false,
      note: "Pembayaran premi",
    },
    {
      id: "tx-7",
      amount: 260_000,
      type: "expense",
      category: "Hiburan",
      date: date(9),
      walletId: "w-cash",
      isPersonalSpending: true,
      note: "Nonton konser",
    },
    {
      id: "tx-8",
      amount: 310_000,
      type: "expense",
      category: "Makanan",
      date: date(14),
      walletId: "w-cash",
      isPersonalSpending: true,
      note: "Makan bareng",
    },
    {
      id: "tx-9",
      amount: 480_000,
      type: "expense",
      category: "Shopping",
      date: date(17),
      walletId: "w-save-a",
      isPersonalSpending: true,
      note: "Kebutuhan rumah",
    },
  ] as const;

  const routineExpenses = [
    {
      id: "r-1",
      name: "Kos",
      plannedAmount: 1_800_000,
      isDone: true,
      actualAmount: 1_800_000,
      actualDate: date(3),
      dueDate: date(3),
    },
    {
      id: "r-2",
      name: "Internet",
      plannedAmount: 375_000,
      isDone: false,
      dueDate: date(19),
    },
    {
      id: "r-3",
      name: "Listrik",
      plannedAmount: 420_000,
      isDone: false,
      dueDate: date(22),
    },
    {
      id: "r-4",
      name: "BPJS",
      plannedAmount: 160_000,
      isDone: true,
      actualAmount: 160_000,
      actualDate: date(7),
      dueDate: date(7),
    },
    {
      id: "r-5",
      name: "Langganan App",
      plannedAmount: 120_000,
      isDone: false,
      dueDate: date(24),
    },
    {
      id: "r-6",
      name: "Gym",
      plannedAmount: 300_000,
      isDone: false,
      dueDate: date(26),
    },
  ] as const;

  const goals = [
    {
      id: "g-1",
      name: "Emergency Fund",
      targetAmount: 15_000_000,
      deadline: shiftMonthIso(referenceDate, 5, 28),
      currentSaved: 0,
      linkedWalletId: "w-save-a",
    },
    {
      id: "g-2",
      name: "Hadiah Orang Tua",
      targetAmount: 2_000_000,
      deadline: shiftMonthIso(referenceDate, 2, 20),
      currentSaved: 0,
      linkedWalletId: "w-save-b",
    },
    {
      id: "g-3",
      name: "Travel Akhir Tahun",
      targetAmount: 8_500_000,
      deadline: shiftMonthIso(referenceDate, 8, 15),
      currentSaved: 0,
      linkedWalletId: "w-invest",
    },
  ] as const;

  const transfers = [
    {
      id: "tr-1",
      fromWalletId: "w-cash",
      toWalletId: "w-save-a",
      amount: 500_000,
      date: date(10),
      note: "Top up tabungan",
    },
    {
      id: "tr-2",
      fromWalletId: "w-save-a",
      toWalletId: "w-invest",
      amount: 750_000,
      date: date(13),
      note: "DCA reksa dana",
    },
  ] as const;

  return {
    wallets: [...wallets],
    transactions: [...transactions],
    routineExpenses: [...routineExpenses],
    goals: [...goals],
    transfers: [...transfers],
  };
}
