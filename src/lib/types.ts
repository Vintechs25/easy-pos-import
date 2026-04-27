export type ProductCategory = "timber" | "hardware";
export type UnitType = "piece" | "kg" | "meter" | "box" | "ft" | "bag";

export interface HardwareProduct {
  id: string;
  kind: "hardware";
  name: string;
  sku: string;
  category: string; // Tools, Fasteners, Cement, Pipes, etc.
  unit: UnitType;
  price: number;
  stock: number;
  reorderLevel: number;
  supplier?: string;
}

export interface TimberSize {
  id: string;
  label: string; // "2x4", "4x4"
  ratePerFt: number; // base rate per foot for this dimension
}

export interface TimberWoodType {
  id: string;
  kind: "timber";
  name: string; // Cypress, Pine, Mahogany
  description?: string;
  sizes: TimberSize[];
  pieces: number; // stock count
  multiplier: number; // wood-type price multiplier (e.g., Mahogany 1.6x)
  quickLengths: number[]; // e.g. [10, 12, 14] in feet
}

export type Product = HardwareProduct | TimberWoodType;

export interface CartItem {
  lineId: string;
  kind: "hardware" | "timber";
  productId: string;
  name: string;
  description: string; // e.g. "Cypress 2x4 · 12ft × 5 pcs"
  quantity: number;
  unitPrice: number; // per-line effective unit price
  unitLabel: string;
  total: number;
  meta?: {
    woodType?: string;
    size?: string;
    lengthFt?: number;
    pieces?: number;
  };
}

export interface Customer {
  id: string;
  name: string;
  type: "walk-in" | "contractor";
  phone?: string;
  company?: string;
  creditLimit: number;
  balance: number; // outstanding
  discountPct: number; // custom pricing discount
  createdAt: string;
}

export interface SaleRecord {
  id: string;
  receiptNo?: string | null;
  date: string;
  customerId: string | null;
  customerName: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment: "cash" | "card" | "mpesa" | "credit";
  paymentRef?: string | null;
  status: "paid" | "credit";
}
