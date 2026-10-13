export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL_SENT' | 'WON' | 'LOST';

export type LeadSource = 'WEBSITE' | 'PHONE' | 'WHATSAPP' | 'REFERRAL' | 'SOCIAL_MEDIA' | 'OTHER';

export interface LeadAssignedTo {
  id: string;
  name: string;
  email: string;
}

export interface Lead {
  id: string;
  companyId: string;
  createdBy: string;
  name: string;
  phoneNumber: string;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  assignedTo: LeadAssignedTo | null;
  nextFollowUpAt: string | null;
  notes: string | null;
  clientId: string | null;
  convertedClientId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadsListResponse {
  success: boolean;
  data: Lead[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type LeadSortField = 'createdAt' | 'name' | 'status' | 'source' | 'nextFollowUpAt';

export interface LeadListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatus;
  source?: LeadSource;
  assignedTo?: string;
  from?: string;
  to?: string;
  sortBy?: LeadSortField;
  sortOrder?: 'asc' | 'desc';
}

export interface LeadResponse {
  success: boolean;
  data: { lead: Lead };
  message?: string;
}

export interface LeadSummary {
  total: number;
  new: number;
  qualified: number;
  won: number;
  byStatus: Record<string, number>;
}

export interface LeadSummaryResponse {
  success: boolean;
  data: LeadSummary;
}

export interface LeadFormData {
  name: string;
  phoneNumber: string;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  assignedTo: string | null;
  nextFollowUpAt: string | null;
  notes: string | null;
  clientId: string | null;
}
