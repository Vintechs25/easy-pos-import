import type { CloudSale, CloudSaleItem } from "@/lib/cloud-store";
import type { SaleRecord } from "@/lib/types";

export function cloudSaleToReceipt(sale: CloudSale, items: CloudSaleItem[] = []): SaleRecord {
  return {
    id: sale.id,
    receiptNo: sale.receipt_no,
    date: sale.created_at,
    customerId: sale.customer_id,
    customerName: sale.customer_name ?? "Walk-in",
    items: items.map((i) => ({
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
    })),
    subtotal: Number(sale.subtotal),
    discount: Number(sale.discount),
    total: Number(sale.total),
    payment: sale.payment_method as SaleRecord["payment"],
    paymentRef: sale.payment_ref,
    status: sale.status === "credit" ? "credit" : "paid",
  };
}
