export type InvoiceStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'OVERDUE'
  | 'CANCELLED';

export const INVOICE_STATUSES: InvoiceStatus[] = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
];

// Statuses the backend fully locks: no content or metadata edits.
export const INVOICE_LOCKED_STATUSES: InvoiceStatus[] = ['PAID', 'CANCELLED'];

// Statuses where only metadata (notes, payment terms, due date) may change.
export const INVOICE_METADATA_ONLY_STATUSES: InvoiceStatus[] = ['ISSUED', 'PARTIALLY_PAID'];

// Statuses a user may move an invoice to, per current status. PARTIALLY_PAID /
// PAID are driven by the future Payments module and are never offered here.
export const INVOICE_TRANSITIONS: Record<string, InvoiceStatus[]> = {
  DRAFT: ['DRAFT', 'ISSUED', 'CANCELLED'],
  ISSUED: ['ISSUED', 'CANCELLED'],
  PARTIALLY_PAID: ['PARTIALLY_PAID'],
  PAID: ['PAID'],
  CANCELLED: ['CANCELLED'],
  OVERDUE: ['OVERDUE'],
};

export type InvoiceCreateMode = 'DIRECT' | 'FROM_QUOTATION';

export interface InvoiceClientRef {
  id: string;
  name: string;
  phoneNumber: string;
  email: string;
  address?: string;
  gstNo?: string | null;
}

export interface InvoiceCompanyRef {
  id: string;
  name: string;
  email: string;
  phone: string;
  gstNumber: string;
  address: string;
}

export interface InvoiceQuotationRef {
  id: string;
  quotationNumber: string;
}

export interface InvoiceProductRef {
  id: string;
  name: string;
  sku: string;
}

export interface InvoiceUserRef {
  id: string;
  name: string;
  email: string;
}

export interface InvoiceItem {
  id: string;
  productId: string | null;
  product: InvoiceProductRef | null;
  description: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  amount: number;
}

export interface Invoice {
  id: string;
  companyId: string;
  company: InvoiceCompanyRef | null;
  invoiceNumber: string;
  quotationId: string | null;
  quotation: InvoiceQuotationRef | null;
  clientId: string;
  client: InvoiceClientRef | null;
  createdBy: InvoiceUserRef | null;
  items: InvoiceItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  issueDate: string | null;
  dueDate: string | null;
  status: InvoiceStatus;
  isOverdue: boolean;
  effectiveStatus: InvoiceStatus;
  notes: string;
  paymentTerms: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface InvoiceItemInput {
  productId?: string | null;
  description?: string;
  quantity: number;
  unitPrice?: number;
  gstRate?: number;
}

export interface InvoiceFormData {
  quotationId?: string | null;
  clientId?: string | null;
  items?: InvoiceItemInput[];
  discountAmount?: number;
  issueDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  paymentTerms?: string | null;
  status?: InvoiceStatus;
}

export interface InvoiceListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  clientId?: string;
  from?: string;
  to?: string;
}

export interface InvoicesListResponse {
  success: boolean;
  data: Invoice[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface InvoiceResponse {
  success: boolean;
  data: { invoice: Invoice };
  message?: string;
}
