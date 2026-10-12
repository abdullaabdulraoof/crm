export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export const QUOTATION_STATUSES: QuotationStatus[] = [
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
];

// Statuses a quotation may be created with; the rest are reached by editing.
export const QUOTATION_CREATE_STATUSES: QuotationStatus[] = ['DRAFT', 'SENT'];

// Statuses that are locked by the backend: no further content edits.
export const QUOTATION_TERMINAL_STATUSES: QuotationStatus[] = ['ACCEPTED', 'REJECTED', 'EXPIRED'];

export interface QuotationRef {
  id: string;
  name: string;
  phoneNumber: string;
}

export interface QuotationProductRef {
  id: string;
  name: string;
  sku: string;
}

export interface QuotationUserRef {
  id: string;
  name: string;
  email: string;
}

export interface QuotationItem {
  id: string;
  productId: string | null;
  product: QuotationProductRef | null;
  description: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  amount: number;
}

export interface Quotation {
  id: string;
  companyId: string;
  quotationNumber: string;
  leadId: string | null;
  lead: QuotationRef | null;
  clientId: string | null;
  client: QuotationRef | null;
  createdBy: QuotationUserRef | null;
  items: QuotationItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  validUntil: string | null;
  status: QuotationStatus;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface QuotationItemInput {
  productId?: string | null;
  description?: string;
  quantity: number;
  unitPrice?: number;
  gstRate?: number;
}

export interface QuotationFormData {
  leadId?: string | null;
  clientId?: string | null;
  items: QuotationItemInput[];
  discountAmount?: number;
  validUntil?: string | null;
  notes?: string | null;
  status?: QuotationStatus;
}

export interface QuotationListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  leadId?: string;
  clientId?: string;
  from?: string;
  to?: string;
}

export interface QuotationsListResponse {
  success: boolean;
  data: Quotation[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface QuotationResponse {
  success: boolean;
  data: { quotation: Quotation };
  message?: string;
}
