import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Receipt,
  Search,
  Printer,
  FileDown,
  Eye,
  Undo2,
  Ban,
  Loader2,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  useSales,
  useBranchSelection,
  getSaleWithItems,
  formatKsh,
  refundSale,
  voidSale,
  type CloudSale,
  type CloudSaleItem,
  type RefundLine,
} from "@/lib/cloud-store";
import { printReceipt, downloadReceiptPDF } from "@/lib/receipt";
import { cloudSaleToReceipt } from "@/lib/receipt-cloud";
import { downloadCsv, toCsv } from "@/lib/csv";
import { toast } from "sonner";

type RangePreset = "today" | "week" | "month" | "all" | "custom";

function presetRange(p: RangePreset): { from?: string; to?: string } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (p === "today") return { from: start.toISOString() };
  if (p === "week") {
    start.setDate(start.getDate() - 6);
    return { from: start.toISOString() };
  }
  if (p === "month") {
    start.setDate(1);
    return { from: start.toISOString() };
  }
  return {};
}

export function SalesHistoryPage() {
  const { user, activeBusinessId, isSystemOwner, isBusinessAdmin, isSupervisor } = useAuth();
  const { activeBranchId } = useBranchSelection();
  const canManage = isSystemOwner || isBusinessAdmin || isSupervisor;
  const [preset, setPreset] = useState<RangePreset>("week");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [allBranches, setAllBranches] = useState(false);

  const filter = useMemo(() => {
    const r = preset === "custom"
      ? {
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        }
      : presetRange(preset);
    return {
      ...r,
      paymentMethod: paymentMethod === "all" ? null : paymentMethod,
      status: status === "all" ? null : status,
      search,
      limit: 1000,
    };
  }, [preset, from, to, paymentMethod, status, search]);

  const { items, loading, reload } = useSales(activeBranchId, allBranches, filter);

  const totals = useMemo(() => {
    const live = items.filter((s) => s.status !== "voided");
    const sum = live.reduce((s, x) => s + Number(x.total), 0);
    const refunded = live.reduce((s, x) => s + Number(x.refund_amount ?? 0), 0);
    const net = sum - refunded;
    const byMethod: Record<string, number> = {};
    live.forEach((s) => {
      byMethod[s.payment_method] = (byMethod[s.payment_method] ?? 0) + Number(s.total);
    });
    return { count: live.length, sum, refunded, net, byMethod };
  }, [items]);

  // Detail / refund / void state
  const [detail, setDetail] = useState<{ sale: CloudSale; items: CloudSaleItem[] } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  async function openDetail(sale: CloudSale) {
    setBusyId(sale.id);
    try {
      const full = (await getSaleWithItems(sale.id)) as CloudSale;
      setDetail({ sale: full, items: full.sale_items ?? [] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function reprint(sale: CloudSale, items: CloudSaleItem[]) {
    printReceipt(cloudSaleToReceipt(sale, items));
  }
  async function downloadPdf(sale: CloudSale, items: CloudSaleItem[]) {
    await downloadReceiptPDF(cloudSaleToReceipt(sale, items));
  }

  function exportCsv() {
    const csv = toCsv(items, [
      { key: "created_at", header: "Date" },
      { key: "receipt_no", header: "Receipt" },
      { key: "customer_name", header: "Customer" },
      { key: "payment_method", header: "Payment" },
      { key: "status", header: "Status" },
      { key: "subtotal", header: "Subtotal" },
      { key: "discount", header: "Discount" },
      { key: "total", header: "Total" },
      { key: "refund_amount", header: "Refunded" },
      { key: "payment_ref", header: "Ref" },
    ]);
    downloadCsv(`sales-${Date.now()}.csv`, csv);
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6" /> Sales History
          </h1>
          <p className="text-sm text-muted-foreground">
            {totals.count} sales · Gross{" "}
            <span className="font-semibold text-foreground">{formatKsh(totals.sum)}</span> · Refunded{" "}
            <span className="font-semibold text-destructive">{formatKsh(totals.refunded)}</span> ·
            Net <span className="font-semibold text-foreground">{formatKsh(totals.net)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={!items.length}>
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </header>

      <Card className="p-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Range</Label>
          <Select value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="custom">Custom…</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {preset === "custom" && (
          <>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase">To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Payment</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="mpesa">M-Pesa</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="credit">Credit</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
              <SelectItem value="voided">Voided</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 flex-1 min-w-[180px]">
          <Label className="text-[10px] uppercase">Search</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Receipt #, customer, ref…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        {canManage && (
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={allBranches}
              onCheckedChange={(v) => setAllBranches(Boolean(v))}
            />
            All branches
          </label>
        )}
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Receipt</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Refunded</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && items.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No sales match.</TableCell></TableRow>
            )}
            {items.map((s) => {
              const refunded = Number(s.refund_amount ?? 0);
              const voided = s.status === "voided";
              return (
                <TableRow key={s.id} className={voided ? "opacity-60" : ""}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(s.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{s.receipt_no ?? s.id.slice(0, 8)}</TableCell>
                  <TableCell>{s.customer_name ?? "Walk-in"}</TableCell>
                  <TableCell className="capitalize">{s.payment_method}</TableCell>
                  <TableCell>
                    <Badge variant={voided ? "destructive" : s.status === "credit" ? "secondary" : "outline"}>
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{formatKsh(Number(s.total))}</TableCell>
                  <TableCell className="text-right text-destructive">
                    {refunded > 0 ? formatKsh(refunded) : "-"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => openDetail(s)} disabled={busyId === s.id}>
                      {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Receipt {detail.sale.receipt_no ?? detail.sale.id.slice(0, 8)}
                </DialogTitle>
                <DialogDescription>
                  {new Date(detail.sale.created_at).toLocaleString()} · {detail.sale.customer_name ?? "Walk-in"} ·{" "}
                  <span className="capitalize">{detail.sale.payment_method}</span>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="rounded-md border border-border max-h-[40vh] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.items.map((i) => (
                        <TableRow key={i.id ?? i.name}>
                          <TableCell>
                            <div className="font-medium text-sm">{i.name}</div>
                            {i.description && (
                              <div className="text-xs text-muted-foreground">{i.description}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{Number(i.quantity)} {i.unit_label ?? ""}</TableCell>
                          <TableCell className="text-right">{formatKsh(Number(i.unit_price))}</TableCell>
                          <TableCell className="text-right font-semibold">{formatKsh(Number(i.total))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Subtotal</div>
                  <div className="text-right">{formatKsh(Number(detail.sale.subtotal))}</div>
                  <div className="text-muted-foreground">Discount</div>
                  <div className="text-right">- {formatKsh(Number(detail.sale.discount))}</div>
                  <div className="font-bold">Total</div>
                  <div className="text-right font-bold">{formatKsh(Number(detail.sale.total))}</div>
                  {Number(detail.sale.refund_amount ?? 0) > 0 && (
                    <>
                      <div className="text-destructive">Refunded</div>
                      <div className="text-right text-destructive">- {formatKsh(Number(detail.sale.refund_amount))}</div>
                    </>
                  )}
                </div>
              </div>

              <DialogFooter className="flex-wrap gap-2">
                <Button variant="outline" onClick={() => reprint(detail.sale, detail.items)}>
                  <Printer className="h-4 w-4 mr-1" /> Print
                </Button>
                <Button variant="outline" onClick={() => downloadPdf(detail.sale, detail.items)}>
                  <FileDown className="h-4 w-4 mr-1" /> PDF
                </Button>
                {canManage && detail.sale.status !== "voided" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setRefundOpen(true)}
                      disabled={Number(detail.sale.refund_amount ?? 0) >= Number(detail.sale.total)}
                    >
                      <Undo2 className="h-4 w-4 mr-1" /> Refund
                    </Button>
                    <Button variant="destructive" onClick={() => setVoidOpen(true)}>
                      <Ban className="h-4 w-4 mr-1" /> Void
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {detail && (
        <RefundDialog
          open={refundOpen}
          onOpenChange={setRefundOpen}
          sale={detail.sale}
          items={detail.items}
          userId={user?.id ?? null}
          onDone={async () => {
            setRefundOpen(false);
            setDetail(null);
            await reload();
            toast.success("Refund recorded");
          }}
        />
      )}
      {detail && (
        <VoidDialog
          open={voidOpen}
          onOpenChange={setVoidOpen}
          sale={detail.sale}
          userId={user?.id ?? null}
          onDone={async () => {
            setVoidOpen(false);
            setDetail(null);
            await reload();
            toast.success("Sale voided");
          }}
        />
      )}
    </div>
  );
}

function RefundDialog({
  open,
  onOpenChange,
  sale,
  items,
  userId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sale: CloudSale;
  items: CloudSaleItem[];
  userId: string | null;
  onDone: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, number>>(() => {
    const o: Record<string, number> = {};
    items.forEach((i) => {
      o[i.id ?? i.name] = Number(i.quantity);
    });
    return o;
  });
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);

  const lines: RefundLine[] = items
    .map((i) => {
      const key = i.id ?? i.name;
      const qty = Number(selected[key] ?? 0);
      if (qty <= 0) return null;
      const unit = Number(i.unit_price);
      return {
        sale_item_id: i.id,
        product_id: i.product_id,
        kind: i.kind,
        name: i.name,
        quantity: qty,
        unit_price: unit,
        total: unit * qty,
        meta: i.meta ?? null,
      } as RefundLine;
    })
    .filter((l): l is RefundLine => l !== null);

  const refundTotal = lines.reduce((s, l) => s + l.total, 0);

  async function submit() {
    if (refundTotal <= 0) {
      toast.error("Select at least one item");
      return;
    }
    setBusy(true);
    try {
      await refundSale({ sale, lines, reason, restock, user_id: userId });
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Refund items</DialogTitle>
          <DialogDescription>
            Choose how many units to refund. Stock can be restored automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border max-h-[40vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Sold</TableHead>
                  <TableHead className="text-right">Refund qty</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => {
                  const key = i.id ?? i.name;
                  const max = Number(i.quantity);
                  const qty = selected[key] ?? 0;
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{i.name}</TableCell>
                      <TableCell className="text-right">{max}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          max={max}
                          step="any"
                          value={qty}
                          onChange={(e) => {
                            const v = Math.min(max, Math.max(0, Number(e.target.value)));
                            setSelected((s) => ({ ...s, [key]: v }));
                          }}
                          className="w-20 ml-auto"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {formatKsh(qty * Number(i.unit_price))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Customer return, damaged, wrong item…"
              rows={2}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={restock} onCheckedChange={(v) => setRestock(Boolean(v))} />
            Return refunded units to stock
          </label>
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm flex justify-between">
            <span className="text-muted-foreground">Refund total</span>
            <span className="font-bold">{formatKsh(refundTotal)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || refundTotal <= 0}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Undo2 className="h-4 w-4 mr-1" />}
            Refund {formatKsh(refundTotal)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog({
  open,
  onOpenChange,
  sale,
  userId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sale: CloudSale;
  userId: string | null;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(true);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await voidSale({ sale, reason, restock, user_id: userId });
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void sale</DialogTitle>
          <DialogDescription>
            Voiding marks this entire sale as cancelled. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={restock} onCheckedChange={(v) => setRestock(Boolean(v))} />
            Return all items to stock
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            <XCircle className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Ban className="h-4 w-4 mr-1" />}
            Void sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
