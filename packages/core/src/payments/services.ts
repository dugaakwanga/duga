import { 
  Payment, PaymentFormData, PaymentSummary, PaymentReason, createPayment,
  updatePaymentStatus, getPaymentSummary
} from "./models";
import { user_is_verified } from "../accounts/mixins";

export class PaymentsService {
  private payments: Payment[] = [];

  getPayments(): Payment[] { return this.payments; }

  getPaymentByTransactionId(transactionId: string): Payment | undefined {
    return this.payments.find((p) => p.transaction_id === transactionId);
  }

  addPayment(data: PaymentFormData, transactionId: string): Payment {
    const payment = createPayment(data, transactionId);
    this.payments.push(payment);
    return payment;
  }

  verifyPayment(transactionId: string): boolean {
    const payment = this.getPaymentByTransactionId(transactionId);
    if (!payment) return false;
    return updatePaymentStatus(transactionId, "VERIFIED");
  }

  rejectPayment(transactionId: string): boolean {
    return updatePaymentStatus(transactionId, "REJECTED");
  }

  getSummary(): PaymentSummary {
    return getPaymentSummary(this.payments);
  }

  canManagePayments(userRole: string): boolean {
    return user_is_verified({ approval_status: 'approved' });
  }
}

export const paymentsService = new PaymentsService();