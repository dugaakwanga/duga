export type PaymentReason = "ADMISSION" | "MIDTERM" | "FINAL" | "TRANSPORT" | "HOSTEL" | "OTHER";

export interface Payment {
  id: string;
  transaction_id: string;
  student_id: string;
  student_name: string;
  amount: number;
  payment_reason: PaymentReason;
  status: "PENDING" | "VERIFIED" | "REJECTED" | "COMPLETED";
  payment_date: string;
  payer_mobile: string;
  payer_email: string;
  payer_city: string;
  payer_country: string;
  created_at: string;
}

export interface PaymentFormData {
  student_id: string;
  amount: number;
  payment_reason: PaymentReason;
  payer_mobile: string;
  payer_email: string;
  payer_city: string;
  payer_country: string;
}

export interface PaymentSummary {
  total_paid: number;
  total_pending: number;
  total_rejected: number;
  by_reason: Record<PaymentReason, number>;
}

export function createPayment(data: PaymentFormData, transactionId: string): Payment {
  const now = new Date().toISOString();
  return {
    id: Date.now().toString(),
    transaction_id: transactionId,
    student_id: data.student_id,
    student_name: `Student ${data.student_id}`,
    amount: data.amount,
    payment_reason: data.payment_reason,
    status: "PENDING",
    payment_date: now,
    payer_mobile: data.payer_mobile,
    payer_email: data.payer_email,
    payer_city: data.payer_city,
    payer_country: data.payer_country,
    created_at: now,
  };
}

export function updatePaymentStatus(
  paymentId: string, 
  status: "PENDING" | "VERIFIED" | "REJECTED" | "COMPLETED"
): boolean {
  // In production, would update the payment status
  return true;
}

export function getPaymentSummary(payments: Payment[]): PaymentSummary {
  let totalPaid = 0;
  let totalPending = 0;
  let totalRejected = 0;
  const byReason: Record<PaymentReason, number> = {
    ADMISSION: 0,
    MIDTERM: 0,
    FINAL: 0,
    TRANSPORT: 0,
    HOSTEL: 0,
    OTHER: 0,
  };

  payments.forEach((payment) => {
    byReason[payment.payment_reason] = (byReason[payment.payment_reason] || 0) + 1;
    
    if (payment.status === "COMPLETED" || payment.status === "VERIFIED") {
      totalPaid += payment.amount;
    } else if (payment.status === "PENDING") {
      totalPending += payment.amount;
    } else if (payment.status === "REJECTED") {
      totalRejected += payment.amount;
    }
  });

  return { total_paid: totalPaid, total_pending: totalPending, total_rejected: totalRejected, by_reason: byReason };
}