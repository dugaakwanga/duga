import { generateReference } from "../utils";

const PAYSTACK_BASE = "https://api.paystack.co";

function secret(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || key.startsWith("sk_test_xxx")) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
  return key;
}

async function paystack<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json()) as { status: boolean; message: string; data: T };
  if (!res.ok || json.status === false) {
    throw new Error(`Paystack error: ${json.message}`);
  }
  return json.data;
}

export interface PaystackInitializeInput {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export async function initializePayment(input: PaystackInitializeInput) {
  const data = await paystack<{ authorization_url: string; access_code: string; reference: string }>(
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    },
  );
  return data;
}

export async function verifyPayment(reference: string) {
  const data = await paystack<{
    status: string;
    reference: string;
    amount: number;
    paid_at: string | null;
    channel: string | null;
    customer: { email: string };
    metadata: Record<string, unknown> | null;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  return data;
}

export async function chargeAuthorization(authorizationCode: string, email: string, amountKobo: number, reference: string) {
  return paystack<{ status: string; reference: string }>("/transaction/charge_authorization", {
    method: "POST",
    body: JSON.stringify({
      authorization_code: authorizationCode,
      email,
      amount: amountKobo,
      reference,
    }),
  });
}

export function makePaymentReference(schoolTag: string): string {
  return generateReference(`PYM${schoolTag}`);
}
