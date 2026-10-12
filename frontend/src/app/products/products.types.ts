export type ProductType = 'PRODUCT' | 'SERVICE';

export interface Product {
  id: string;
  companyId: string;
  name: string;
  description: string;
  sku: string;
  unitPrice: number;
  gstRate: number;
  type: ProductType;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ProductFormData {
  name: string;
  description?: string | null;
  sku?: string | null;
  unitPrice: number;
  gstRate?: number;
  type: ProductType;
}

export interface ProductListParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
  isActive?: string;
}

export interface ProductsListResponse {
  success: boolean;
  data: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProductResponse {
  success: boolean;
  data: { product: Product };
  message?: string;
}
