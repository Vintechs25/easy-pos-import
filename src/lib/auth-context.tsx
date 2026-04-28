import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "system_owner" | "business_admin" | "supervisor" | "cashier" | "staff";

export interface UserRole {
  role: AppRole;
  business_id: string | null;
  branch_id: string | null;
}

export interface BusinessSummary {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "revoked";
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  roles: UserRole[];
  businesses: BusinessSummary[];
  activeBusinessId: string | null;
  setActiveBusinessId: (id: string | null) => void;
  loading: boolean;
  authError: string | null;
  isSystemOwner: boolean;
  isBusinessAdmin: boolean;
  isSupervisor: boolean;
  isCashier: boolean;
  isStaff: boolean;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ACTIVE_BIZ_KEY = "ty_active_business";

function getErrorMessage(error: unknown, fallback = "Something went wrong while checking your access.") {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

function isRetryableBackendError(error: unknown) {
  const message = getErrorMessage(error, "");
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status ?? 0)
      : 0;

  return (
    code === "PGRST002" ||
    status === 503 ||
    message.includes("schema cache") ||
    message.includes("Could not query the database")
  );
}

async function retryCloudQuery<T>(queryFactory: () => PromiseLike<{ data: T | null; error: unknown }>) {
  let lastResult: { data: T | null; error: unknown } = { data: null, error: null };
  const retryDelays = [350, 900, 1800, 3000];

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    lastResult = await queryFactory();
    if (!lastResult.error) return lastResult;

    if (attempt === retryDelays.length || !isRetryableBackendError(lastResult.error)) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
  }

  return lastResult;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [businesses, setBusinesses] = useState<BusinessSummary[]>([]);
  const [activeBusinessId, setActiveBusinessIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const bootstrappedRef = useRef(false);

  const setActiveBusinessId = (id: string | null) => {
    setActiveBusinessIdState(id);
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(ACTIVE_BIZ_KEY, id);
      else localStorage.removeItem(ACTIVE_BIZ_KEY);
    }
  };

  const loadUserData = async (uid: string) => {
    setAuthError(null);
    const [{ data: rolesData, error: rolesError }, { data: bizData, error: bizError }] = await Promise.all([
      retryCloudQuery(() =>
        supabase
          .from("user_roles")
          .select("role,business_id,branch_id")
          .eq("user_id", uid)
          .order("created_at", { ascending: true }),
      ),
      retryCloudQuery(() => supabase.from("businesses").select("id,name,slug,status").order("name")),
    ]);
    if (rolesError) {
      const message = isRetryableBackendError(rolesError)
        ? "Your account is signed in, but the backend is still finishing the access check. Please retry in a moment."
        : getErrorMessage(rolesError, "We couldn't load your access rights right now.");
      setAuthError(message);
      setRoles([]);
      setBusinesses((bizData as BusinessSummary[]) ?? []);
      return;
    }

    const loadedRoles = ((rolesData as UserRole[]) ?? []).sort((a, b) =>
      a.role === "system_owner" ? -1 : b.role === "system_owner" ? 1 : 0,
    );
    setRoles(loadedRoles);

    if (bizError) {
      setBusinesses([]);
      setActiveBusinessIdState(null);
      return;
    }

    setBusinesses((bizData as BusinessSummary[]) ?? []);

    const stored = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_BIZ_KEY) : null;
    const accessibleIds = new Set((bizData ?? []).map((b: any) => b.id));
    if (stored && accessibleIds.has(stored)) {
      setActiveBusinessIdState(stored);
    } else if (bizData && bizData.length > 0) {
      setActiveBusinessIdState(bizData[0].id);
      if (typeof window !== "undefined") localStorage.setItem(ACTIVE_BIZ_KEY, bizData[0].id);
    } else {
      setActiveBusinessIdState(null);
    }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      if (user) await loadUserData(user.id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const applySession = (newSession: Session | null) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setLoading(true);
        setTimeout(() => {
          loadUserData(newSession.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setAuthError(null);
        setRoles([]);
        setBusinesses([]);
        setActiveBusinessIdState(null);
        setLoading(false);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!bootstrappedRef.current && event === "INITIAL_SESSION") return;
      applySession(newSession);
    });

    supabase.auth.getSession().then(async ({ data: { session: s }, error }) => {
      if (
        error &&
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "refresh_token_not_found"
      ) {
        await supabase.auth.signOut({ scope: "local" });
        bootstrappedRef.current = true;
        applySession(null);
        return;
      }

      bootstrappedRef.current = true;
      applySession(s);
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isSystemOwner = roles.some((r) => r.role === "system_owner");
  const isBusinessAdmin = roles.some((r) => r.role === "business_admin");
  const isSupervisor = roles.some((r) => r.role === "supervisor");
  const isCashier = roles.some((r) => r.role === "cashier");
  const isStaff = roles.some((r) => r.role === "staff" || r.role === "cashier" || r.role === "supervisor");

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        roles,
        businesses,
        activeBusinessId,
        setActiveBusinessId,
        loading,
        authError,
        isSystemOwner,
        isBusinessAdmin,
        isSupervisor,
        isCashier,
        isStaff,
        signOut,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
