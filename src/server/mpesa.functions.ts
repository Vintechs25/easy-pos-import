/**
 * M-Pesa Daraja STK Push integration.
 *
 * Flow:
 * 1. Cashier clicks "M-Pesa" on POS checkout.
 * 2. Frontend calls `initiateMpesaStk` server function with phone + amount + sale draft.
 * 3. Server uses business `mpesa_config` (or sandbox env defaults) to obtain an
 *    OAuth token, generate a password and call STK Push.
 * 4. Server inserts an `mpesa_transactions` row with status `pending` and returns
 *    the CheckoutRequestID.
 * 5. Safaricom hits `/api/public/mpesa-callback` with the result.
 * 6. Frontend polls `mpesa_transactions` (RLS-protected) until status flips to
 *    `success` or `failed`, then completes the sale.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const AuthPayloadSchema = z.object({ __authToken: z.string().min(1) });

async function getAuthContext(payload: { __authToken: string }) {
  const { __authToken } = AuthPayloadSchema.parse(payload);
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error("Missing backend configuration.");

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${__authToken}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getClaims(__authToken);
  if (error || !data?.claims?.sub) throw new Error("Unauthorized: Invalid session.");
  return { supabase, userId: data.claims.sub };
}

// Normalise a Kenyan phone to 2547XXXXXXXX format
function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1);
  if (digits.startsWith("7") && digits.length === 9) return "254" + digits;
  return digits;
}

const SANDBOX_BASE = "https://sandbox.safaricom.co.ke";
const PRODUCTION_BASE = "https://api.safaricom.co.ke";

interface MpesaCreds {
  environment: "sandbox" | "production";
  shortcode: string;
  passkey: string;
  consumer_key: string;
  consumer_secret: string;
  callback_url: string | null;
  base_url: string;
}

async function resolveCreds(
  businessId: string,
): Promise<MpesaCreds> {
  const { data: cfg } = await supabaseAdmin
    .from("mpesa_config")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  // Sandbox fall-backs (Safaricom's public Daraza sandbox sample credentials).
  // Anyone can complete an STK push to a test phone with these values.
  const sandboxShortcode = process.env.MPESA_SANDBOX_SHORTCODE ?? "174379";
  const sandboxPasskey =
    process.env.MPESA_SANDBOX_PASSKEY ??
    "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919";
  const sandboxConsumerKey = process.env.MPESA_SANDBOX_CONSUMER_KEY ?? "";
  const sandboxConsumerSecret = process.env.MPESA_SANDBOX_CONSUMER_SECRET ?? "";

  const env = (cfg?.environment as "sandbox" | "production") ?? "sandbox";
  const base = env === "production" ? PRODUCTION_BASE : SANDBOX_BASE;

  if (env === "production") {
    if (!cfg?.shortcode || !cfg?.passkey || !cfg?.consumer_key || !cfg?.consumer_secret) {
      throw new Error(
        "M-Pesa production credentials are missing. Configure them in Business → M-Pesa.",
      );
    }
    return {
      environment: "production",
      shortcode: cfg.shortcode,
      passkey: cfg.passkey,
      consumer_key: cfg.consumer_key,
      consumer_secret: cfg.consumer_secret,
      callback_url: cfg.callback_url ?? null,
      base_url: base,
    };
  }

  if (cfg?.enabled === false) {
    throw new Error("M-Pesa checkout is disabled for this business.");
  }

  return {
    environment: "sandbox",
    shortcode: cfg?.shortcode ?? sandboxShortcode,
    passkey: cfg?.passkey ?? sandboxPasskey,
    consumer_key: cfg?.consumer_key ?? sandboxConsumerKey,
    consumer_secret: cfg?.consumer_secret ?? sandboxConsumerSecret,
    callback_url: cfg?.callback_url ?? null,
    base_url: base,
  };
}

async function getAccessToken(creds: MpesaCreds): Promise<string> {
  if (!creds.consumer_key || !creds.consumer_secret) {
    throw new Error(
      "M-Pesa Consumer Key/Secret missing. Add them in Business → M-Pesa or as MPESA_SANDBOX_CONSUMER_KEY/SECRET.",
    );
  }
  const auth = Buffer.from(`${creds.consumer_key}:${creds.consumer_secret}`).toString("base64");
  const res = await fetch(
    `${creds.base_url}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`M-Pesa OAuth failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("M-Pesa OAuth: no access_token returned");
  return json.access_token;
}

function formatTimestamp(d = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}` +
    `${pad(d.getMonth() + 1)}` +
    `${pad(d.getDate())}` +
    `${pad(d.getHours())}` +
    `${pad(d.getMinutes())}` +
    `${pad(d.getSeconds())}`
  );
}

const StkPushSchema = z.object({
  __authToken: z.string().min(1),
  businessId: z.string().uuid(),
  branchId: z.string().uuid(),
  phone: z.string().min(7).max(20),
  amount: z.number().positive().max(150000),
  accountReference: z.string().min(1).max(40).default("POS"),
  transactionDesc: z.string().min(1).max(100).default("POS Sale"),
});

export const initiateMpesaStk = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => StkPushSchema.parse(input))
  .handler(async ({ data }) => {
    const ctx = await getAuthContext(data);

    // Verify caller belongs to the business
    const { data: roles } = await ctx.supabase
      .from("user_roles")
      .select("role,business_id")
      .eq("user_id", ctx.userId);
    const isMember =
      (roles ?? []).some((r) => r.role === "system_owner") ||
      (roles ?? []).some((r) => r.business_id === data.businessId);
    if (!isMember) throw new Error("You are not a member of this business.");

    const creds = await resolveCreds(data.businessId);
    const token = await getAccessToken(creds);
    const timestamp = formatTimestamp();
    const password = Buffer.from(
      `${creds.shortcode}${creds.passkey}${timestamp}`,
    ).toString("base64");

    const phone = normalisePhone(data.phone);
    if (!/^2547\d{8}$/.test(phone) && !/^2541\d{8}$/.test(phone)) {
      throw new Error("Phone must be a Kenyan mobile number (e.g. 0712345678).");
    }

    // Where Safaricom should POST results.
    const callbackBase =
      process.env.MPESA_CALLBACK_BASE_URL ?? process.env.PUBLIC_SITE_URL ?? process.env.VITE_PUBLIC_SITE_URL ?? "";
    let callbackUrl = creds.callback_url || `${callbackBase.replace(/\/$/, "")}/api/public/mpesa-callback`;
    if (!callbackBase) {
      throw new Error("M-Pesa callback URL is missing. Set it in Admin → Daraja Checkout.");
    }
    if (!/^https:\/\//i.test(callbackUrl)) throw new Error("M-Pesa callback URL must be a public HTTPS URL.");

    const stkBody = {
      BusinessShortCode: creds.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(data.amount),
      PartyA: phone,
      PartyB: creds.shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: data.accountReference.slice(0, 12),
      TransactionDesc: data.transactionDesc.slice(0, 13),
    };

    const stkRes = await fetch(`${creds.base_url}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(stkBody),
    });
    const stkJson = (await stkRes.json()) as {
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      ResponseCode?: string;
      ResponseDescription?: string;
      errorMessage?: string;
    };

    if (!stkRes.ok || stkJson.ResponseCode !== "0") {
      throw new Error(
        stkJson.errorMessage ||
          stkJson.ResponseDescription ||
          `STK push failed (${stkRes.status})`,
      );
    }

    // Insert pending transaction (service role bypasses RLS)
    const { data: tx, error: txErr } = await supabaseAdmin
      .from("mpesa_transactions")
      .insert({
        business_id: data.businessId,
        branch_id: data.branchId,
        amount: data.amount,
        phone,
        account_reference: data.accountReference,
        transaction_desc: data.transactionDesc,
        merchant_request_id: stkJson.MerchantRequestID ?? null,
        checkout_request_id: stkJson.CheckoutRequestID ?? null,
        status: "pending",
        initiated_by: ctx.userId,
      })
      .select()
      .single();
    if (txErr) throw new Error(txErr.message);

    return {
      transactionId: tx.id,
      checkoutRequestId: stkJson.CheckoutRequestID,
      merchantRequestId: stkJson.MerchantRequestID,
      message: stkJson.ResponseDescription ?? "STK push sent.",
    };
  });

const LinkSaleSchema = z.object({
  __authToken: z.string().min(1),
  transactionId: z.string().uuid(),
  saleId: z.string().uuid(),
});

/**
 * After the sale row is created, link it to the M-Pesa transaction.
 */
export const linkMpesaToSale = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => LinkSaleSchema.parse(input))
  .handler(async ({ data }) => {
    await getAuthContext(data);
    const { error } = await supabaseAdmin
      .from("mpesa_transactions")
      .update({ sale_id: data.saleId })
      .eq("id", data.transactionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
