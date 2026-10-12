export type ReportKey = 'leads' | 'quotations' | 'invoices' | 'payments' | 'follow-ups';

export interface ReportTab {
  key: ReportKey;
  label: string;
}

export const REPORT_TABS: ReportTab[] = [
  { key: 'leads', label: 'Leads' },
  { key: 'quotations', label: 'Quotations' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'payments', label: 'Payments' },
  { key: 'follow-ups', label: 'Follow-ups' },
];

export interface ReportRange {
  from: string | null;
  to: string | null;
}

export interface MethodTotal {
  count: number;
  total: number;
}

// A single permissive shape covering every report. Which fields are populated
// depends on the active tab; the template only reads the fields that belong to
// the selected report.
export interface ReportData {
  range: ReportRange;
  total: number;
  byStatus?: Record<string, number>;
  bySource?: Record<string, number>;
  totalValue?: number;
  acceptedValue?: number;
  totalInvoiced?: number;
  amountCollected?: number;
  outstandingBalance?: number;
  overdueCount?: number;
  overdueBalance?: number;
  totalRecorded?: number;
  totalAmount?: number;
  byMethod?: Record<string, MethodTotal>;
  pending?: number;
  completed?: number;
  cancelled?: number;
  overduePending?: number;
}

export interface ReportResponse {
  success: boolean;
  data: ReportData;
}

export interface ReportParams {
  from?: string;
  to?: string;
}

export interface ReportBar {
  key: string;
  label: string;
  value: number;
  width: string;
}
