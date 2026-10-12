import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  ProductFormData,
  ProductListParams,
  ProductResponse,
  ProductsListResponse,
} from '../products.types';

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly http = inject(HttpClient);

  getProducts(params: ProductListParams = {}): Observable<ProductsListResponse> {
    let httpParams = new HttpParams()
      .set('page', String(params.page ?? 1))
      .set('limit', String(params.limit ?? 10));
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.type) httpParams = httpParams.set('type', params.type);
    if (params.isActive) httpParams = httpParams.set('isActive', params.isActive);
    return this.http.get<ProductsListResponse>('/api/products', { params: httpParams });
  }

  getProduct(id: string): Observable<ProductResponse> {
    return this.http.get<ProductResponse>('/api/products/' + id);
  }

  createProduct(data: ProductFormData): Observable<ProductResponse> {
    return this.http.post<ProductResponse>('/api/products', data);
  }

  updateProduct(id: string, data: Partial<ProductFormData> & { isActive?: boolean }): Observable<ProductResponse> {
    return this.http.put<ProductResponse>('/api/products/' + id, data);
  }

  deactivateProduct(id: string): Observable<ProductResponse> {
    return this.updateProduct(id, { isActive: false });
  }

  activateProduct(id: string): Observable<ProductResponse> {
    return this.updateProduct(id, { isActive: true });
  }
}
