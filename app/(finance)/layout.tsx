import { FinanceAppProvider } from "@/components/finance/finance-app-provider";
import FinanceShell from "@/components/finance/finance-shell";

export default function FinanceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <FinanceAppProvider>
      <FinanceShell>{children}</FinanceShell>
    </FinanceAppProvider>
  );
}
