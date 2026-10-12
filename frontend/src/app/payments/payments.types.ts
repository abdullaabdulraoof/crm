export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'CHEQUE' | 'OTHER';

export const PAYMENT_METHODS: PaymentMethod[] = [
  'CASH',
  'BANK_TRANSFER',
  'UPI',
  'CARD',
  'CHEQUE',
  'OTHER',
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  UPI: 'UPI',
  CARD: 'Card',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};

export type PaymentStatus = 'RECORDED' | 'VOIDED' | 'REFUNDED';

export const PAYMENT_STATUSES: PaymentStatus[] = ['RECORDED', 'VOIDED', 'REFUNDED'];

// Only OWNER and ADMIN may void a payment (backend enforces this too).
export const PAYMENT_VOID_ROLES: string[] = ['OWNER', 'ADMIN'];

// Invoice statuses that can still receive a payment.
export const PAYABLE_INVOICE_STATUSES: string[] = ['ISSUED', 'PARTIALLY_PAID'];

export interface PaymentInvoiceRef {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
}

export interface PaymentClientRef {
  id: string;
  name: string;
  phoneNumber: string;
  email: string;
}

export interface PaymentUserRef {
  id: string;
  name: string;
  email: string;
}

export interface Payment {
  id: string;
  companyId: string;
  paymentNumber: string;
  invoiceId: string;
  invoice: PaymentInvoiceRef | null;
  clientId: string;
  client: PaymentClientRef | null;
  amount: number;
  paymentDate: string | null;
  method: PaymentMethod;
  transactionReference: string;
  status: PaymentStatus;
  notes: string;
  recordedBy: PaymentUserRef | null;
  voidReason: string;
  voidedBy: PaymentUserRef | null;
  voidedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PaymentFormData {
  invoiceId: string;
  amount: number;
  paymentDate?: string | null;
  method: PaymentMethod;
  transactionReference?: string | null;
  notes?: string | null;
}

export interface PaymentListParams {
  page?: number;
  limit?: number;
  search?: string;
  invoiceId?: string;
  clientId?: string;
  method?: string;
  status?: string;
  from?: string;
  to?: string;
}

export interface PaymentsListResponse {
  success: boolean;
  data: Payment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PaymentResponse {
  success: boolean;
  data: { payment: Payment };
  message?: string;
}
