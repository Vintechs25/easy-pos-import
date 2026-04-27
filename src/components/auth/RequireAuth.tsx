import { type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

interface Props {
  children: ReactNode;
  roles?: AppRole[];
}

export function RequireAuth({ children, roles }: Props) {
  const { user, loading, roles: userRoles, authError, refresh } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" />;

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <div>
            <h1 className="text-2xl font-bold">We couldn&apos;t confirm your access</h1>
            <p className="mt-2 text-muted-foreground">{authError}</p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retry access check
          </button>
        </div>
      </div>
    );
  }

  if (roles && roles.length > 0) {
    const has = userRoles.some((r) => roles.includes(r.role));
    if (!has) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6 text-center">
          <div>
            <h1 className="text-2xl font-bold">Access denied</h1>
            <p className="mt-2 text-muted-foreground">
              You do not have permission to view this page.
            </p>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
