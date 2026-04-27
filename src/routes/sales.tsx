import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { SalesHistoryPage } from "@/components/pages/SalesHistoryPage";

export const Route = createFileRoute("/sales")({
  head: () => ({
    meta: [
      { title: "Sales History — TimberYard POS" },
      { name: "description", content: "Browse, reprint, refund and void past sales." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell>
        <SalesHistoryPage />
      </AppShell>
    </RequireAuth>
  ),
});
