export interface DashboardCards {
  totalLeads: number;
  newLeads: number;
  totalClients: number;
  activeProducts: number;
  quotationsSent: number;
  outstandingBalance: number;
  paymentsThisMonth: number;
  overdueInvoices: number;
}

export interface MonthlyPayment {
  month: string;
  total: number;
}

export interface DashboardTotals {
  invoicedThisMonth: number;
  outstandingBalance: number;
  overdueBalance: number;
}

export interface NamedRef {
  id: string;
  name: string | null;
}

export interface UserRef {
  id: string;
  name: string | null;
  email: string | null;
}

export interface RecentLead {
  id: string;
  name: string;
  status: string;
  source: string;
  createdAt: string | null;
}

export interface RecentQuotation {
  id: string;
  quotationNumber: string;
  client: NamedRef | null;
  lead: NamedRef | null;
  targetName: string | null;
  totalAmount: number;
  status: string;
  createdAt: string | null;
}

export interface RecentInvoice {
  id: string;
  invoiceNumber: string;
  client: NamedRef | null;
  totalAmount: number;
  balanceDue: number;
  status: string;
  effectiveStatus: string;
  issueDate: string | null;
  dueDate: string | null;
  createdAt: string | null;
}

export interface RecentFollowUp {
  id: string;
  subject: string;
  type: string;
  status: string;
  dueAt: string | null;
  lead: NamedRef | null;
  client: NamedRef | null;
  assignedTo: UserRef | null;
}

export interface DashboardSummary {
  generatedAt: string;
  month: { key: string };
  cards: DashboardCards;
  leadsByStatus: Record<string, number>;
  quotationsByStatus: Record<string, number>;
  invoiceStatus: Record<string, number>;
  monthlyPayments: MonthlyPayment[];
  totals: DashboardTotals;
  recent: {
    leads: RecentLead[];
    quotations: RecentQuotation[];
    invoices: RecentInvoice[];
    followUps: RecentFollowUp[];
  };
}

export interface DashboardResponse {
  success: boolean;
  data: DashboardSummary;
}

export interface ChartBar {
  key: string;
  label: string;
  value: number;
  width: string;
}
