"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFinanceAppContext } from "@/components/finance/finance-app-provider";

const menuItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    activePrefixes: ["/dashboard"],
  },
  {
    href: "/all-transactions",
    label: "All Transactions",
    activePrefixes: ["/all-transactions", "/transactions"],
  },
  { href: "/input", label: "Quick Entry", activePrefixes: ["/input"] },
  { href: "/routine", label: "Routine", activePrefixes: ["/routine"] },
  { href: "/goals", label: "Goals", activePrefixes: ["/goals"] },
  {
    href: "/wallets",
    label: "Wallet & Transfer",
    activePrefixes: ["/wallets", "/transfers"],
  },
] as const;

export default function FinanceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const {
    authUser,
    authReady,
    authBusy,
    authError,
    syncStatus,
    syncError,
    isDemoMode,
    showAuthGate,
    signIn,
    signOut,
  } = useFinanceAppContext();

  const syncToneClass =
    syncStatus === "loading"
      ? "bg-(--warning-soft) text-(--warning)"
      : syncStatus === "error"
        ? "bg-(--over-soft) text-(--over)"
        : "bg-(--safe-soft) text-(--safe)";

  const syncLabel =
    syncStatus === "loading"
      ? "Syncing"
      : syncStatus === "error"
        ? "Sync Error"
        : "Synced";

  const activeMenu = menuItems.find((item) =>
    item.activePrefixes.some((prefix) => pathname.startsWith(prefix)),
  );

  const currentLabel =
    activeMenu?.label ?? pathname.split("/").filter(Boolean).slice(-1)[0] ?? "Dashboard";

  if (!authReady) {
    return (
      <div className="relative min-h-screen overflow-x-clip">
        <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 sm:px-6 lg:px-8">
          <section className="glass-panel w-full p-8 text-center">
            <p className="chip mx-auto w-fit">Bootstrapping</p>
            <h1 className="mt-4 text-2xl font-semibold">Loading finance workspace...</h1>
          </section>
        </main>
      </div>
    );
  }

  if (showAuthGate) {
    return (
      <div className="relative min-h-screen overflow-x-clip">
        <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 sm:px-6 lg:px-8">
          <section className="glass-panel w-full space-y-4 p-8 text-center">
            <p className="chip mx-auto w-fit">Firebase Auth</p>
            <h1 className="text-2xl font-semibold">Sign in to access your workspace</h1>
            <p className="text-sm text-(--ink-muted)">
              Your data syncs securely to Firestore.
            </p>
            <button
              type="button"
              onClick={signIn}
              disabled={authBusy}
              className="mx-auto rounded-xl bg-(--accent) px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authBusy ? "Processing..." : "Sign in with Google"}
            </button>
            {authError ? <p className="text-sm text-(--over)">{authError}</p> : null}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-clip">
      {isMobileSidebarOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setIsMobileSidebarOpen(false)}
            className="absolute inset-0 bg-black/25"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r border-(--line) bg-white p-4 shadow-xl">
            <p className="chip w-fit">Personal Finance OS</p>
            <nav className="mt-4 flex flex-col gap-2 overflow-y-auto">
              {menuItems.map((item) => {
                const isActive = item.activePrefixes.some((prefix) => pathname.startsWith(prefix));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                      isActive
                        ? "bg-(--accent) text-white"
                        : "bg-white text-(--ink-muted) hover:bg-(--surface-solid)"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}

      <main className="mx-auto grid w-full max-w-[1500px] gap-3 px-3 pb-6 pt-4 sm:px-4 lg:grid-cols-[238px_minmax(0,1fr)] lg:gap-4 lg:px-5">
        <aside className="glass-panel hidden self-start p-3 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-auto">
          <div className="mb-3">
            <p className="chip w-fit">Personal Finance OS</p>
          </div>

          <nav className="flex flex-col gap-2">
            {menuItems.map((item) => {
              const isActive = item.activePrefixes.some((prefix) => pathname.startsWith(prefix));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-(--accent) text-white"
                      : "bg-white text-(--ink-muted) hover:bg-(--surface-solid)"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-col gap-3 lg:gap-4">
          <header className="glass-panel sticky top-3 z-20 flex flex-wrap items-center justify-between gap-3 p-3 sm:top-4 sm:px-4 sm:py-3">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMobileSidebarOpen(true)}
                className="rounded-xl border border-(--line) bg-white px-3 py-1.5 text-xs font-semibold text-(--ink-muted) lg:hidden"
                aria-label="Buka menu"
                aria-expanded={isMobileSidebarOpen}
              >
                Menu
              </button>
              <nav
                aria-label="Breadcrumb"
                className="flex min-w-0 items-center gap-2 text-sm font-semibold"
              >
                <Link
                  href="/dashboard"
                  className="truncate text-(--ink-muted) transition-colors hover:text-(--ink)"
                >
                  Personal Finance OS
                </Link>
                <span className="text-(--ink-soft)">/</span>
                <span className="truncate text-(--ink)">{currentLabel}</span>
              </nav>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-1 font-semibold ${syncToneClass}`}>
                {syncLabel}
              </span>
              <span className="max-w-[13rem] truncate text-(--ink-muted) sm:max-w-none">
                {isDemoMode
                  ? "Local demo mode"
                  : authUser?.displayName ?? authUser?.email ?? "Unknown user"}
              </span>
              {!isDemoMode ? (
                <button
                  type="button"
                  onClick={signOut}
                  disabled={authBusy}
                  className="rounded-xl border border-(--line) bg-white px-2.5 py-1 text-xs font-semibold text-(--ink) disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {authBusy ? "Processing" : "Sign Out"}
                </button>
              ) : null}
            </div>

            {syncError ? <p className="w-full text-xs text-(--over)">{syncError}</p> : null}
            {authError ? <p className="w-full text-xs text-(--over)">{authError}</p> : null}
          </header>

          <div className="flex min-w-0 flex-col gap-3 lg:gap-4">{children}</div>
        </section>
      </main>
    </div>
  );
}
