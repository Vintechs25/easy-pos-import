/**
 * Cloud-backed store for per-branch inventory, customers, sales, suppliers
 * and M-Pesa transactions. Supabase is the single source of truth.
 */
import { useEffect, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth-context";
import { create } from "zustand";

// Active branch selection (per user, per device)
const ACTIVE_BRANCH_KEY = "ty_active_branch";

interface BranchSelectionState {
  activeBranchId: string | null;
  setActiveBranchId: (id: string | null) => void;
}

export const useBranchSelection = create<BranchSelectionState>((set) => ({
  activeBranchId: typeof window !== "undefined" ? localStorage.getItem(ACTIVE_BRANCH_KEY) : null,
  setActiveBranchId: (id) => {
    if (typeof window !== "undefined") {
      if (id) localStorage.setItem(ACTIVE_BRANCH_KEY, id);
      else localStorage.removeItem(ACTIVE_BRANCH_KEY);
    }
    set({ activeBranchId: id });
  },
}));

export interface Branch {
  id: string;
  name: string;
  code: string;
  business_id: string;
}

export interface CloudHardware {
  id: string;
  business_id: string;
  branch_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  price: number;
  cost: number;
  stock: number;
  low_stock_threshold: number;
  supplier: string | null;
  supplier_id: string | null;
  is_active: boolean;
}

export interface CloudTimber {
  id: string;
  business_id: string;
  branch_id: string;
  species: string;
  grade: string | null;
  thickness: number;
  width: number;
  length: number;
  dim_unit: string;
  length_unit: string;
  price_per_unit: number;
  price_unit: string;
  pieces: number;
  low_stock_threshold: number;
  is_active: boolean;
}

export interface CloudCustomer {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  type: string;
  credit_limit: number;
  balance: number;
  loyalty_discount_pct: number;
}

export interface CloudSupplier {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  contact_person: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface CloudSale {
  id: string;
  business_id: string;
  branch_id: string;
  customer_id: string | null;
  customer_name: string | null;
  receipt_no: string | null;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  payment_ref: string | null;
  mpesa_transaction_id: string | null;
  status: string;
  created_at: string;
  sale_items?: CloudSaleItem[];
  refunded_at?: string | null;
  refund_amount?: number;
  refund_reason?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;
}

export interface CloudSaleItem {
  id?: string;
  sale_id?: string;
  product_id: string | null;
  kind: "hardware" | "timber";
  name: string;
  description: string | null;
  quantity: number;
  unit_price: number;
  unit_label: string | null;
  total: number;
  meta?: Record<string, unknown> | null;
}

// =========================================================================
// Branches
// =========================================================================
export function useBranches() {
  const { activeBusinessId } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeBusinessId) {
      setBranches([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("branches")
      .select("id,name,code,business_id")
      .eq("business_id", activeBusinessId)
      .order("name");
    setBranches((data as Branch[]) ?? []);
    setLoading(false);
  }, [activeBusinessId]);

  useEffect(() => {
    load();
  }, [load]);

  return { branches, loading, reload: load };
}

// =========================================================================
// Hardware
// =========================================================================
export function useHardware(branchId: string | null) {
  const [items, setItems] = useState<CloudHardware[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!branchId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("hardware_products")
      .select("*")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .order("name");
    setItems((data as CloudHardware[]) ?? []);
    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, reload: load };
}

export async function upsertHardware(
  values: Partial<CloudHardware> & {
    business_id: string;
    branch_id: string;
    name: string;
  },
) {
  if (values.id) {
    const { id, ...rest } = values;
    const { error } = await supabase.from("hardware_products").update(rest).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("hardware_products").insert(values);
    if (error) throw error;
  }
}

export async function deleteHardware(id: string) {
  // Soft delete to keep historical sale_items consistent
  const { error } = await supabase
    .from("hardware_products")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

// =========================================================================
// Timber
// =========================================================================
export function useTimber(branchId: string | null) {
  const [items, setItems] = useState<CloudTimber[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!branchId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("timber_products")
      .select("*")
      .eq("branch_id", branchId)
      .eq("is_active", true)
      .order("species");
    setItems((data as CloudTimber[]) ?? []);
    setLoading(false);
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, reload: load };
}

export async function upsertTimber(
  values: Partial<CloudTimber> & {
    business_id: string;
    branch_id: string;
    species: string;
  },
) {
  if (values.id) {
    const { id, ...rest } = values;
    const { error } = await supabase.from("timber_products").update(rest).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("timber_products").insert(values);
    if (error) throw error;
  }
}

export async function deleteTimber(id: string) {
  const { error } = await supabase
    .from("timber_products")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

// =========================================================================
// Customers
// =========================================================================
export function useCustomers() {
  const { activeBusinessId } = useAuth();
  const [items, setItems] = useState<CloudCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeBusinessId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("customers")
      .select("*")
      .eq("business_id", activeBusinessId)
      .order("name");
    setItems((data as CloudCustomer[]) ?? []);
    setLoading(false);
  }, [activeBusinessId]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, reload: load };
}

export async function upsertCustomer(
  values: Partial<CloudCustomer> & { business_id: string; name: string },
) {
  if (values.id) {
    const { id, ...rest } = values;
    const { error } = await supabase.from("customers").update(rest).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("customers").insert(values);
    if (error) throw error;
  }
}

export async function deleteCustomer(id: string) {
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) throw error;
}

// =========================================================================
// Suppliers
// =========================================================================
export function useSuppliers() {
  const { activeBusinessId } = useAuth();
  const [items, setItems] = useState<CloudSupplier[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeBusinessId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("suppliers")
      .select("*")
      .eq("business_id", activeBusinessId)
      .eq("is_active", true)
      .order("name");
    setItems((data as CloudSupplier[]) ?? []);
    setLoading(false);
  }, [activeBusinessId]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, reload: load };
}

export async function upsertSupplier(
  values: Partial<CloudSupplier> & { business_id: string; name: string },
) {
  if (values.id) {
    const { id, ...rest } = values;
    const { error } = await supabase.from("suppliers").update(rest).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("suppliers").insert(values);
    if (error) throw error;
  }
}

export async function deleteSupplier(id: string) {
  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

// =========================================================================
// Sales
// =========================================================================
export function useSales(branchId: string | null, allBranches = false) {
  const { activeBusinessId } = useAuth();
  const [items, setItems] = useState<CloudSale[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeBusinessId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from("sales")
      .select("*")
      .eq("business_id", activeBusinessId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!allBranches && branchId) q = q.eq("branch_id", branchId);
    const { data } = await q;
    setItems((data as CloudSale[]) ?? []);
    setLoading(false);
  }, [activeBusinessId, branchId, allBranches]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, reload: load };
}

export async function getSaleWithItems(saleId: string) {
  const { data: sale, error } = await supabase
    .from("sales")
    .select("*, sale_items(*)")
    .eq("id", saleId)
    .single();
  if (error || !sale) throw error ?? new Error("Sale not found");
  return sale as CloudSale;
}

/**
 * Persist a completed sale + its line items + decrement stock.
 * Returns the saved sale (with id and receipt_no).
 */
export async function recordSale(args: {
  business_id: string;
  branch_id: string;
  customer_id: string | null;
  customer_name: string | null;
  payment_method: "cash" | "card" | "mpesa" | "credit";
  status: "paid" | "credit" | "pending";
  subtotal: number;
  discount: number;
  total: number;
  payment_ref?: string | null;
  mpesa_transaction_id?: string | null;
  items: CloudSaleItem[];
  created_by?: string | null;
}): Promise<CloudSale> {
  const receiptNo = `R-${Date.now().toString(36).toUpperCase()}`;
  const { data: sale, error } = await supabase
    .from("sales")
    .insert({
      business_id: args.business_id,
      branch_id: args.branch_id,
      customer_id: args.customer_id,
      customer_name: args.customer_name,
      payment_method: args.payment_method,
      status: args.status,
      subtotal: args.subtotal,
      discount: args.discount,
      total: args.total,
      payment_ref: args.payment_ref ?? null,
      mpesa_transaction_id: args.mpesa_transaction_id ?? null,
      receipt_no: receiptNo,
      created_by: args.created_by ?? null,
    })
    .select()
    .single();
  if (error || !sale) throw error ?? new Error("Failed to save sale");

  const itemsPayload = args.items.map((i) => ({
    sale_id: sale.id,
    product_id: i.product_id,
    kind: i.kind,
    name: i.name,
    description: i.description,
    quantity: i.quantity,
    unit_price: i.unit_price,
    unit_label: i.unit_label,
    total: i.total,
    meta: (i.meta ?? null) as never,
  }));
  if (itemsPayload.length) {
    const { error: itemErr } = await supabase.from("sale_items").insert(itemsPayload);
    if (itemErr) throw itemErr;
  }

  // Decrement stock client-side (RLS allows members to update their inventory).
  for (const item of args.items) {
    if (!item.product_id) continue;
    if (item.kind === "hardware") {
      const { data: prod } = await supabase
        .from("hardware_products")
        .select("stock")
        .eq("id", item.product_id)
        .single();
      if (prod) {
        await supabase
          .from("hardware_products")
          .update({ stock: Math.max(0, Number(prod.stock) - item.quantity) })
          .eq("id", item.product_id);
      }
    } else if (item.kind === "timber") {
      const piecesUsed = Number(item.meta?.pieces ?? item.quantity) || 0;
      const { data: prod } = await supabase
        .from("timber_products")
        .select("pieces")
        .eq("id", item.product_id)
        .single();
      if (prod) {
        await supabase
          .from("timber_products")
          .update({ pieces: Math.max(0, Number(prod.pieces) - piecesUsed) })
          .eq("id", item.product_id);
      }
    }
  }

  // Update customer balance for credit sales
  if (args.payment_method === "credit" && args.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("balance")
      .eq("id", args.customer_id)
      .single();
    if (c) {
      await supabase
        .from("customers")
        .update({ balance: Number(c.balance) + args.total })
        .eq("id", args.customer_id);
    }
  }

  return sale as CloudSale;
}

// =========================================================================
// M-Pesa config + transactions (read helpers)
// =========================================================================
export interface MpesaConfig {
  business_id: string;
  environment: "sandbox" | "production";
  shortcode: string | null;
  passkey: string | null;
  consumer_key: string | null;
  consumer_secret: string | null;
  callback_url: string | null;
  enabled: boolean;
}

export function useMpesaConfig() {
  const { activeBusinessId } = useAuth();
  const [config, setConfig] = useState<MpesaConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeBusinessId) {
      setConfig(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("mpesa_config")
      .select("*")
      .eq("business_id", activeBusinessId)
      .maybeSingle();
    setConfig(data as MpesaConfig | null);
    setLoading(false);
  }, [activeBusinessId]);

  useEffect(() => {
    load();
  }, [load]);

  return { config, loading, reload: load };
}

export async function saveMpesaConfig(values: MpesaConfig) {
  const { error } = await supabase.from("mpesa_config").upsert(values, {
    onConflict: "business_id",
  });
  if (error) throw error;
}

export async function pollMpesaStatus(checkoutRequestId: string) {
  const { data } = await supabase
    .from("mpesa_transactions")
    .select("status,result_desc,mpesa_receipt_number,sale_id")
    .eq("checkout_request_id", checkoutRequestId)
    .maybeSingle();
  return data;
}

export const formatKsh = (n: number) =>
  `KSh ${n.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
