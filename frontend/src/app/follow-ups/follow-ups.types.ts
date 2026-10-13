export type FollowUpType = 'CALL' | 'MEETING' | 'EMAIL' | 'WHATSAPP' | 'OTHER';

export type FollowUpStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export interface FollowUpRef {
  id: string;
  name: string;
}

export interface FollowUpUserRef {
  id: string;
  name: string;
  email?: string | null;
}

export interface FollowUp {
  id: string;
  companyId: string;
  leadId: string | null;
  lead: (FollowUpRef & { phoneNumber?: string | null }) | string | null;
  clientId: string | null;
  client: (FollowUpRef & { phoneNumber?: string | null }) | string | null;
  assignedTo: FollowUpUserRef | string | null;
  type: FollowUpType;
  subject: string;
  description: string;
  dueAt: string;
  status: FollowUpStatus;
  completedAt: string | null;
  createdBy: FollowUpUserRef | string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FollowUpsListResponse {
  success: boolean;
  data: FollowUp[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface FollowUpResponse {
  success: boolean;
  data: { followup: FollowUp };
  message?: string;
}

export interface FollowUpListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
  assignedTo?: string;
  leadId?: string;
  clientId?: string;
  from?: string;
  to?: string;
}

export interface FollowUpSummary {
  total: number;
  pending: number;
  completed: number;
  cancelled: number;
  overdue: number;
}

export interface FollowUpSummaryResponse {
  success: boolean;
  data: FollowUpSummary;
}

export interface FollowUpFormData {
  leadId?: string | null;
  clientId?: string | null;
  assignedTo: string;
  type: FollowUpType;
  subject: string;
  description?: string | null;
  dueAt: string;
  status?: FollowUpStatus;
}
