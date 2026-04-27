import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Trash2,
  Plus,
  Minus,
  TreePine,
  Package,
  X,
  Banknote,
  Smartphone,
  Receipt,
  CheckCircle2,
  CreditCard,
  HardHat,
  Loader2,
  Clock,
  Printer,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimberSaleDialog } from "@/components/pos/TimberSaleDialog";
import {
  useBranchSelection,
  useHardware,
  useTimber,
  useCustomers,
  recordSale,
  formatKsh,
  pollMpesaStatus,
  useSales,
  getSaleWithItems,
  type CloudHardware,
  type CloudTimber,
  type CloudSaleItem,
  type CloudSale,
} from "@/lib/cloud-store";
import { callWithAuth } from "@/lib/server-fn-auth";
import { initiateMpesaStk, linkMpesaToSale } from "@/server/mpesa.functions";
import { printReceipt } from "@/lib/receipt";
import type { SaleRecord } from "@/lib/types";
import { toast } from "sonner";

interface CartLine extends CloudSaleItem {
  lineId: string;
}

export function POSScreen() {
  const { activeBusinessId, user, businesses } = useAuth();
  const { activeBranchId } = useBranchSelection();
  const { items: hardware, reload: reloadHw } = useHardware(activeBranchId);
  const { items: timber, reload: reloadTm } = useTimber(activeBranchId);
  const { items: customers } = useCustomers();
  const { items: recentSales, reload: reloadSales } = useSales(activeBranchId);
  const activeBiz = businesses.find((b) => b.id === activeBusinessId);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "timber" | string>("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeCustomerId, setActiveCustomerId] = useState<string>("walk-in");
  const [discountPct, setDiscountPct] = useState(0);
  const [timberDialog, setTimberDialog] = useState<CloudTimber | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<string>("");
  const [lastSale, setLastSale] = useState<SaleRecord | null>(null);
  const [salesOpen, setSalesOpen] = useState(false);
  const [reprintBusyId, setReprintBusyId] = useState<string | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [mpesaOpen, setMpesaOpen] = useState(false);
  const [mpesaStatus, setMpesaStatus] = useState<string>("");
  const [mpesaBusy, setMpesaBusy] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    hardware.forEach((h) => h.category && set.add(h.category));
    return Array.from(set).sort();
  }, [hardware]);

  const filteredHardware = useMemo(() => {
    let list = hardware;
    if (tab !== "all" && tab !== "timber") list = list.filter((h) => h.category === tab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((h) => h.name.toLowerCase().includes(q) || (h.sku ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [hardware, tab, search]);

  const showTimber = tab === "all" || tab === "timber";
  const filteredTimber = useMemo(() => {
    if (!showTimber) return [];
    if (!search.trim()) return timber;
    const q = search.toLowerCase();
    return timber.filter((t) => t.species.toLowerCase().includes(q));
  }, [timber, showTimber, search]);

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const customer = customers.find((c) => c.id === activeCustomerId);
  const totalDiscPct = discountPct + (customer ? Number(customer.loyalty_discount_pct) : 0);
  const discount = (subtotal * totalDiscPct) / 100;
  const total = subtotal - discount;

  function toReceiptSale(sale: CloudSale, items: CloudSaleItem[] = []): SaleRecord {
    const receiptItems = items.map((i) => ({
      lineId: i.id ?? `${sale.id}-${i.product_id ?? i.name}`,
      kind: i.kind,
      productId: i.product_id ?? "",
      name: i.name,
      description: i.description ?? "",
      quantity: Number(i.quantity),
      unitPrice: Number(i.unit_price),
      unitLabel: i.unit_label ?? "",
      total: Number(i.total),
      meta: i.meta as SaleRecord["items"][number]["meta"],
    }));
    return {
      id: sale.id,
      receiptNo: sale.receipt_no,
      date: sale.created_at,
      customerId: sale.customer_id,
      customerName: sale.customer_name ?? "Walk-in",
      items: receiptItems,
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount),
      total: Number(sale.total),
      payment: sale.payment_method as SaleRecord["payment"],
      paymentRef: sale.payment_ref,
      status: sale.status === "credit" ? "credit" : "paid",
    };
  }

  async function reprintSale(saleId: string) {
    setReprintBusyId(saleId);
    try {
      const sale = await getSaleWithItems(saleId);
      printReceipt(toReceiptSale(sale, sale.sale_items ?? []), {
        businessName: activeBiz?.name ?? "TimberYard POS",
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReprintBusyId(null);
    }
  }

  function addHardwareItem(h: CloudHardware) {
    setCart((prev) => {
      const existing = prev.find((c) => c.kind === "hardware" && c.product_id === h.id);
      if (existing) {
        return prev.map((c) =>
          c.lineId === existing.lineId
            ? { ...c, quantity: c.quantity + 1, total: c.unit_price * (c.quantity + 1) }
            : c,
        );
      }
      return [
        ...prev,
        {
          lineId: `L-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          kind: "hardware",
          product_id: h.id,
          name: h.name,
          description: h.sku,
          quantity: 1,
          unit_price: Number(h.price),
          unit_label: h.unit,
          total: Number(h.price),
        },
      ];
    });
  }

  function addTimberLine(line: {
    productId: string;
    name: string;
    description: string;
    quantity: number;
    unitPrice: number;
    unitLabel: string;
    meta: { species: string; size: string; length: number; pieces: number };
  }) {
    setCart((prev) => [
      ...prev,
      {
        lineId: `L-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: "timber",
        product_id: line.productId,
        name: line.name,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        unit_label: line.unitLabel,
        total: line.unitPrice * line.quantity,
        meta: line.meta,
      },
    ]);
  }

  function updateQty(lineId: string, qty: number) {
    if (qty < 1) {
      setCart((prev) => prev.filter((c) => c.lineId !== lineId));
      return;
    }
    setCart((prev) =>
      prev.map((c) =>
        c.lineId === lineId ? { ...c, quantity: qty, total: c.unit_price * qty } : c,
      ),
    );
  }

  function clearCart() {
    setCart([]);
    setDiscountPct(0);
    setActiveCustomerId("walk-in");
  }

  async function finalizeSale(
    method: "cash" | "card" | "mpesa" | "credit",
    paymentRef?: string | null,
    mpesaTxId?: string | null,
  ) {
    if (!activeBusinessId || !activeBranchId) {
      toast.error("Select branch first");
      return null;
    }
    if (cart.length === 0) return null;
    if (method === "credit" && (!customer || customer.id === "walk-in")) {
      toast.error("Select a contractor for credit sales");
      return null;
    }

    try {
      const receiptItems = cart.map(({ lineId: _l, ...rest }) => rest);
      const sale = await recordSale({
        business_id: activeBusinessId,
        branch_id: activeBranchId,
        customer_id: customer ? customer.id : null,
        customer_name: customer ? customer.name : "Walk-in",
        payment_method: method,
        status: method === "credit" ? "credit" : "paid",
        subtotal,
        discount,
        total,
        payment_ref: paymentRef ?? null,
        mpesa_transaction_id: mpesaTxId ?? null,
        items: receiptItems,
        created_by: user?.id ?? null,
      });
      setLastReceipt(sale.receipt_no ?? sale.id);
      setLastSale(toReceiptSale(sale, receiptItems));
      setConfirmOpen(true);
      setPayOpen(false);
      clearCart();
      reloadHw();
      reloadTm();
      reloadSales();
      return sale;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  }

  async function payMpesa() {
    if (!activeBusinessId || !activeBranchId) {
      toast.error("Select branch first");
      return;
    }
    if (!mpesaPhone.trim()) {
      toast.error("Enter customer phone");
      return;
    }
    setMpesaBusy(true);
    setMpesaStatus("Sending STK push to phone...");
    try {
      const res = await callWithAuth(initiateMpesaStk as never, {
        businessId: activeBusinessId,
        branchId: activeBranchId,
        phone: mpesaPhone.trim(),
        amount: Math.round(total),
        accountReference: (activeBiz?.slug ?? "POS").slice(0, 12),
        transactionDesc: "POS Sale",
      } as never) as { transactionId: string; checkoutRequestId: string };

      setMpesaStatus("Waiting for customer to enter PIN...");
      // poll up to ~90s
      let attempts = 0;
      let receipt: string | null = null;
      while (attempts < 30) {
        await new Promise((r) => setTimeout(r, 3000));
        const status = await pollMpesaStatus(res.checkoutRequestId);
        if (status?.status === "success") {
          receipt = status.mpesa_receipt_number ?? null;
          break;
        }
        if (status?.status === "failed" || status?.status === "cancelled") {
          throw new Error(status.result_desc || "Payment cancelled");
        }
        attempts++;
      }
      if (!receipt && attempts >= 30) {
        throw new Error("Timed out waiting for M-Pesa confirmation");
      }
      setMpesaStatus("Payment received! Saving sale...");
      const sale = await finalizeSale("mpesa", receipt, res.transactionId);
      if (sale) {
        // link sale id back to mpesa_transactions
        try {
          await callWithAuth(linkMpesaToSale as never, {
            transactionId: res.transactionId,
            saleId: sale.id,
          } as never);
        } catch {
          /* non-blocking */
        }
      }
      setMpesaOpen(false);
      setMpesaPhone("");
      setMpesaStatus("");
    } catch (e) {
      toast.error((e as Error).message);
      setMpesaStatus("");
    } finally {
      setMpesaBusy(false);
    }
  }

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const cartPanel = (
    <div className="flex flex-col h-full">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Current sale</h2>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearCart}>
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          )}
        </div>
        <Select value={activeCustomerId} onValueChange={setActiveCustomerId}>
          <SelectTrigger className="h-11"><SelectValue placeholder="Walk-in" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="walk-in">Walk-in customer</SelectItem>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <div className="flex items-center gap-2">
                  {c.type === "contractor" && <HardHat className="h-3 w-3 text-accent" />}
                  <span className="font-medium">{c.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {customer && (
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Balance: {formatKsh(Number(customer.balance))}</span>
            <span>{Number(customer.loyalty_discount_pct)}% loyalty</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cart.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-16">
            <Receipt className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Cart is empty</p>
          </div>
        )}
        {cart.map((item) => (
          <div key={item.lineId} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex items-start gap-2 min-w-0">
                {item.kind === "timber" ? (
                  <TreePine className="h-4 w-4 text-timber flex-shrink-0 mt-0.5" />
                ) : (
                  <Package className="h-4 w-4 text-hardware flex-shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{item.name}</div>
                  <div className="text-[11px] text-muted-foreground">{item.description}</div>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQty(item.lineId, 0)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.lineId, item.quantity - 1)}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQty(item.lineId, item.quantity + 1)}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <div className="text-sm font-bold">{formatKsh(item.total)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">{formatKsh(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm items-center">
          <span className="text-muted-foreground">Discount %</span>
          <Input
            type="number"
            value={discountPct}
            onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className="h-7 w-20 text-right"
          />
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-sm text-success">
            <span>You save</span>
            <span>-{formatKsh(discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-lg font-bold pt-2 border-t border-border">
          <span>Total</span>
          <span>{formatKsh(total)}</span>
        </div>
        <Button className="w-full h-12 text-base font-bold" disabled={cart.length === 0} onClick={() => setPayOpen(true)}>
          Charge {formatKsh(total)}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen">
      {/* Catalog */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold tracking-tight">Checkout</h1>
              <p className="text-xs text-muted-foreground">Scan, sell, print receipts.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setSalesOpen(true)}>
              <Clock className="h-4 w-4 mr-1" /> Sales history
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setTab("all")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${tab === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
            >All</button>
            <button
              onClick={() => setTab("timber")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${tab === "timber" ? "bg-timber text-timber-foreground" : "bg-secondary text-muted-foreground"}`}
            >Timber</button>
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setTab(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${tab === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
              >{c}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!activeBranchId && (
            <div className="text-center text-muted-foreground py-12">
              Select a branch from the sidebar to start selling.
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {showTimber && filteredTimber.map((t) => (
              <button
                key={t.id}
                onClick={() => setTimberDialog(t)}
                className="rounded-xl border border-border bg-card p-3 text-left hover:border-timber hover:shadow-[var(--shadow-soft)] transition-all"
              >
                <TreePine className="h-5 w-5 text-timber mb-2" />
                <div className="font-semibold text-sm">{t.species}</div>
                <div className="text-xs text-muted-foreground">{Number(t.thickness)}×{Number(t.width)} {t.dim_unit}</div>
                <div className="text-sm font-bold mt-1">{formatKsh(Number(t.price_per_unit))}/{t.price_unit}</div>
              </button>
            ))}
            {filteredHardware.map((h) => (
              <button
                key={h.id}
                onClick={() => addHardwareItem(h)}
                disabled={Number(h.stock) <= 0}
                className="rounded-xl border border-border bg-card p-3 text-left hover:border-primary hover:shadow-[var(--shadow-soft)] transition-all disabled:opacity-40"
              >
                <Package className="h-5 w-5 text-hardware mb-2" />
                <div className="font-semibold text-sm truncate">{h.name}</div>
                <div className="text-xs text-muted-foreground">Stock: {Number(h.stock)}</div>
                <div className="text-sm font-bold mt-1">{formatKsh(Number(h.price))}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Cart desktop */}
      <aside className="hidden lg:flex w-[380px] border-l border-border bg-card">
        <div className="flex-1">{cartPanel}</div>
      </aside>

      {/* Mobile cart trigger */}
      <div className="lg:hidden fixed bottom-4 right-4 z-30">
        <Button size="lg" onClick={() => setMobileCartOpen(true)} className="rounded-full h-14 shadow-lg">
          <Receipt className="h-5 w-5 mr-2" /> Cart ({cartCount})
        </Button>
      </div>
      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0">
          <SheetTitle className="sr-only">Cart</SheetTitle>
          <div className="h-full">{cartPanel}</div>
        </SheetContent>
      </Sheet>

      {/* Timber dialog */}
      {timberDialog && (
        <TimberSaleDialog
          wood={timberDialog}
          open={!!timberDialog}
          onOpenChange={(o) => !o && setTimberDialog(null)}
          onAdd={addTimberLine}
        />
      )}

      {/* Pay dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose payment</DialogTitle>
          </DialogHeader>
          <div className="text-center py-3">
            <div className="text-4xl font-bold">{formatKsh(total)}</div>
            <div className="text-xs text-muted-foreground mt-1">Receipt will be generated</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button size="lg" variant="outline" className="h-20 flex-col" onClick={() => finalizeSale("cash")}>
              <Banknote className="h-6 w-6 mb-1" /> Cash
            </Button>
            <Button size="lg" variant="outline" className="h-20 flex-col" onClick={() => { setPayOpen(false); setMpesaOpen(true); }}>
              <Smartphone className="h-6 w-6 mb-1" /> M-Pesa
            </Button>
            <Button size="lg" variant="outline" className="h-20 flex-col" onClick={() => finalizeSale("card")}>
              <CreditCard className="h-6 w-6 mb-1" /> Card
            </Button>
            <Button size="lg" variant="outline" className="h-20 flex-col" onClick={() => finalizeSale("credit")} disabled={!customer || customer.type !== "contractor"}>
              <HardHat className="h-6 w-6 mb-1" /> Credit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* M-Pesa STK dialog */}
      <Dialog open={mpesaOpen} onOpenChange={(o) => !mpesaBusy && setMpesaOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" /> M-Pesa STK Push
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-center">
              <div className="text-3xl font-bold">{formatKsh(total)}</div>
            </div>
            <div>
              <label className="text-xs font-medium">Customer phone</label>
              <Input
                placeholder="07XXXXXXXX"
                value={mpesaPhone}
                onChange={(e) => setMpesaPhone(e.target.value)}
                disabled={mpesaBusy}
              />
            </div>
            {mpesaStatus && (
              <div className="rounded-md bg-muted p-3 text-sm flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {mpesaStatus}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMpesaOpen(false)} disabled={mpesaBusy}>Cancel</Button>
            <Button onClick={payMpesa} disabled={mpesaBusy}>
              {mpesaBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send STK push"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-6 w-6" /> Sale completed
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-4">
            <div className="text-sm text-muted-foreground">Receipt</div>
            <div className="text-xl font-bold tracking-wider">{lastReceipt}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => lastSale && printReceipt(lastSale, { businessName: activeBiz?.name ?? "TimberYard POS" })} disabled={!lastSale}>
              <Printer className="h-4 w-4 mr-1" /> Print receipt
            </Button>
            <Button onClick={() => setConfirmOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sales history / reprint */}
      <Dialog open={salesOpen} onOpenChange={setSalesOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" /> Sales history
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {recentSales.length === 0 && (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No sales yet for this branch.
              </div>
            )}
            {recentSales.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{sale.receipt_no ?? sale.id.slice(0, 8)}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-secondary-foreground">
                      {sale.payment_method}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {new Date(sale.created_at).toLocaleString()} · {sale.customer_name ?? "Walk-in"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right font-bold">{formatKsh(Number(sale.total))}</div>
                  <Button variant="outline" size="sm" onClick={() => reprintSale(sale.id)} disabled={reprintBusyId === sale.id}>
                    {reprintBusyId === sale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
