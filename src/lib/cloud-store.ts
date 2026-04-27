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
export interface SalesFilter {
  from?: string | null; // ISO
  to?: string | null;
  paymentMethod?: string | null;
  status?: string | null;
  customerId?: string | null;
  search?: string | null;
  limit?: number;
}

export function useSales(branchId: string | null, allBranches = false, filter?: SalesFilter) {
  const { activeBusinessId } = useAuth();
  const [items, setItems] = useState<CloudSale[]>([]);
  const [loading, setLoading] = useState(true);

  const filterKey = JSON.stringify(filter ?? {});
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
      .limit(filter?.limit ?? 500);
    if (!allBranches && branchId) q = q.eq("branch_id", branchId);
    if (filter?.from) q = q.gte("created_at", filter.from);
    if (filter?.to) q = q.lte("created_at", filter.to);
    if (filter?.paymentMethod) q = q.eq("payment_method", filter.paymentMethod);
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.customerId) q = q.eq("customer_id", filter.customerId);
    const { data } = await q;
    let list = (data as CloudSale[]) ?? [];
    if (filter?.search?.trim()) {
      const s = filter.search.toLowerCase();
      list = list.filter(
        (x) =>
          (x.receipt_no ?? "").toLowerCase().includes(s) ||
          (x.customer_name ?? "").toLowerCase().includes(s) ||
          (x.payment_ref ?? "").toLowerCase().includes(s),
      );
    }
    setItems(list);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusinessId, branchId, allBranches, filterKey]);

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

// =========================================================================
// Refunds, voids, stock adjustments
// =========================================================================
export interface RefundLine {
  sale_item_id?: string;
  product_id: string | null;
  kind: "hardware" | "timber";
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  meta?: Record<string, unknown> | null;
}

export async function refundSale(args: {
  sale: CloudSale;
  lines: RefundLine[];
  reason: string;
  restock: boolean;
  user_id: string | null;
}) {
  const amount = args.lines.reduce((s, l) => s + Number(l.total), 0);
  if (amount <= 0) throw new Error("Nothing to refund");
  const { error: refErr } = await supabase.from("sale_refunds").insert({
    sale_id: args.sale.id,
    business_id: args.sale.business_id,
    branch_id: args.sale.branch_id,
    amount,
    reason: args.reason || null,
    items: args.lines as never,
    restocked: args.restock,
    created_by: args.user_id,
  });
  if (refErr) throw refErr;

  const newRefund = Number(args.sale.refund_amount ?? 0) + amount;
  const fullyRefunded = newRefund >= Number(args.sale.total) - 0.001;
  const { error: upErr } = await supabase
    .from("sales")
    .update({
      refund_amount: newRefund,
      refunded_at: new Date().toISOString(),
      refunded_by: args.user_id,
      refund_reason: args.reason || null,
      status: fullyRefunded ? "refunded" : args.sale.status,
    })
    .eq("id", args.sale.id);
  if (upErr) throw upErr;

  if (args.restock) {
    for (const line of args.lines) {
      if (!line.product_id) continue;
      if (line.kind === "hardware") {
        const { data: prod } = await supabase
          .from("hardware_products")
          .select("stock")
          .eq("id", line.product_id)
          .maybeSingle();
        if (prod) {
          const newStock = Number(prod.stock) + Number(line.quantity);
          await supabase
            .from("hardware_products")
            .update({ stock: newStock })
            .eq("id", line.product_id);
          await supabase.from("stock_adjustments").insert({
            business_id: args.sale.business_id,
            branch_id: args.sale.branch_id,
            product_id: line.product_id,
            product_kind: "hardware",
            product_name: line.name,
            delta: Number(line.quantity),
            old_value: Number(prod.stock),
            new_value: newStock,
            reason: `Refund of sale ${args.sale.receipt_no ?? args.sale.id.slice(0, 8)}`,
            source: "refund",
            created_by: args.user_id,
          });
        }
      } else if (line.kind === "timber") {
        const pieces = Number((line.meta?.pieces as number) ?? line.quantity) || 0;
        const { data: prod } = await supabase
          .from("timber_products")
          .select("pieces")
          .eq("id", line.product_id)
          .maybeSingle();
        if (prod) {
          const newPieces = Number(prod.pieces) + pieces;
          await supabase
            .from("timber_products")
            .update({ pieces: newPieces })
            .eq("id", line.product_id);
          await supabase.from("stock_adjustments").insert({
            business_id: args.sale.business_id,
            branch_id: args.sale.branch_id,
            product_id: line.product_id,
            product_kind: "timber",
            product_name: line.name,
            delta: pieces,
            old_value: Number(prod.pieces),
            new_value: newPieces,
            reason: `Refund of sale ${args.sale.receipt_no ?? args.sale.id.slice(0, 8)}`,
            source: "refund",
            created_by: args.user_id,
          });
        }
      }
    }
  }

  // For credit sales, reduce customer balance
  if (args.sale.payment_method === "credit" && args.sale.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("balance")
      .eq("id", args.sale.customer_id)
      .maybeSingle();
    if (c) {
      await supabase
        .from("customers")
        .update({ balance: Math.max(0, Number(c.balance) - amount) })
        .eq("id", args.sale.customer_id);
    }
  }
}

export async function voidSale(args: {
  sale: CloudSale;
  reason: string;
  restock: boolean;
  user_id: string | null;
}) {
  const { data: full, error } = await supabase
    .from("sales")
    .select("*, sale_items(*)")
    .eq("id", args.sale.id)
    .single();
  if (error || !full) throw error ?? new Error("Sale not found");
  const sale = full as CloudSale;
  if (sale.status === "voided") throw new Error("Already voided");

  if (args.restock) {
    for (const item of sale.sale_items ?? []) {
      if (!item.product_id) continue;
      if (item.kind === "hardware") {
        const { data: prod } = await supabase
          .from("hardware_products")
          .select("stock")
          .eq("id", item.product_id)
          .maybeSingle();
        if (prod) {
          const newStock = Number(prod.stock) + Number(item.quantity);
          await supabase
            .from("hardware_products")
            .update({ stock: newStock })
            .eq("id", item.product_id);
          await supabase.from("stock_adjustments").insert({
            business_id: sale.business_id,
            branch_id: sale.branch_id,
            product_id: item.product_id,
            product_kind: "hardware",
            product_name: item.name,
            delta: Number(item.quantity),
            old_value: Number(prod.stock),
            new_value: newStock,
            reason: `Void sale ${sale.receipt_no ?? sale.id.slice(0, 8)}`,
            source: "void",
            created_by: args.user_id,
          });
        }
      } else if (item.kind === "timber") {
        const pieces =
          Number((item.meta as { pieces?: number } | null)?.pieces ?? item.quantity) || 0;
        const { data: prod } = await supabase
          .from("timber_products")
          .select("pieces")
          .eq("id", item.product_id)
          .maybeSingle();
        if (prod) {
          const newPieces = Number(prod.pieces) + pieces;
          await supabase
            .from("timber_products")
            .update({ pieces: newPieces })
            .eq("id", item.product_id);
          await supabase.from("stock_adjustments").insert({
            business_id: sale.business_id,
            branch_id: sale.branch_id,
            product_id: item.product_id,
            product_kind: "timber",
            product_name: item.name,
            delta: pieces,
            old_value: Number(prod.pieces),
            new_value: newPieces,
            reason: `Void sale ${sale.receipt_no ?? sale.id.slice(0, 8)}`,
            source: "void",
            created_by: args.user_id,
          });
        }
      }
    }
  }

  if (sale.payment_method === "credit" && sale.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("balance")
      .eq("id", sale.customer_id)
      .maybeSingle();
    if (c) {
      await supabase
        .from("customers")
        .update({ balance: Math.max(0, Number(c.balance) - Number(sale.total)) })
        .eq("id", sale.customer_id);
    }
  }

  const { error: upErr } = await supabase
    .from("sales")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_by: args.user_id,
      void_reason: args.reason || null,
    })
    .eq("id", sale.id);
  if (upErr) throw upErr;
}

export async function adjustStock(args: {
  business_id: string;
  branch_id: string;
  product_id: string;
  product_kind: "hardware" | "timber";
  product_name: string;
  new_value: number;
  reason: string;
  user_id: string | null;
}) {
  const table = args.product_kind === "hardware" ? "hardware_products" : "timber_products";
  const col = args.product_kind === "hardware" ? "stock" : "pieces";
  const { data: prod, error: rdErr } = await supabase
    .from(table)
    .select(col)
    .eq("id", args.product_id)
    .maybeSingle();
  if (rdErr) throw rdErr;
  if (!prod) throw new Error("Product not found");
  const old = Number((prod as Record<string, number>)[col]);
  const next = Math.max(0, Number(args.new_value));
  const delta = next - old;
  await supabase.from(table).update({ [col]: next }).eq("id", args.product_id);
  await supabase.from("stock_adjustments").insert({
    business_id: args.business_id,
    branch_id: args.branch_id,
    product_id: args.product_id,
    product_kind: args.product_kind,
    product_name: args.product_name,
    delta,
    old_value: old,
    new_value: next,
    reason: args.reason || null,
    source: "manual",
    created_by: args.user_id,
  });
}

export async function bulkInsertHardware(rows: Array<Partial<CloudHardware> & { business_id: string; branch_id: string; name: string }>) {
  if (!rows.length) return;
  const { error } = await supabase.from("hardware_products").insert(rows);
  if (error) throw error;
}
export async function bulkInsertTimber(rows: Array<Partial<CloudTimber> & { business_id: string; branch_id: string; species: string }>) {
  if (!rows.length) return;
  const { error } = await supabase.from("timber_products").insert(rows);
  if (error) throw error;
}
export async function bulkInsertCustomers(rows: Array<Partial<CloudCustomer> & { business_id: string; name: string }>) {
  if (!rows.length) return;
  const { error } = await supabase.from("customers").insert(rows);
  if (error) throw error;
}
export async function bulkInsertSuppliers(rows: Array<Partial<CloudSupplier> & { business_id: string; name: string }>) {
  if (!rows.length) return;
  const { error } = await supabase.from("suppliers").insert(rows);
  if (error) throw error;
}

export interface StockAdjustment {
  id: string;
  business_id: string;
  branch_id: string;
  product_id: string;
  product_kind: "hardware" | "timber";
  product_name: string;
  delta: number;
  old_value: number;
  new_value: number;
  reason: string | null;
  source: string;
  created_by: string | null;
  created_at: string;
}
export function useStockAdjustments(branchId: string | null) {
  const [items, setItems] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!branchId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("stock_adjustments")
      .select("*")
      .eq("branch_id", branchId)
      .order("created_at", { ascending: false })
      .limit(200);
    setItems((data as StockAdjustment[]) ?? []);
    setLoading(false);
  }, [branchId]);
  useEffect(() => {
    load();
  }, [load]);
  return { items, loading, reload: load };
}
