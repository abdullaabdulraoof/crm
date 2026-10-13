export type ClientType = 'INDIVIDUAL' | 'BUSINESS';

export interface ClientOption {
  id: string;
  name: string;
  phoneNumber: string;
  email: string;
}

export interface Client {
  id: string;
  name: string;
  phoneNumber: string;
  email: string;
  address: string;
  gstNo: string | null;
  clientType: ClientType;
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ClientListParams {
  page?: number;
  limit?: number;
  search?: string;
  clientType?: ClientType;
}

export interface ClientsListResponse {
  success: boolean;
  data: Client[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ClientResponse {
  success: boolean;
  data: { client: Client };
  message?: string;
}

export interface ClientFormData {
  name: string;
  phoneNumber: string;
  email: string | null;
  address: string | null;
  gstNo: string | null;
  clientType: ClientType;
  notes: string | null;
}
