import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  QuotationFormData,
  QuotationListParams,
  QuotationResponse,
  QuotationsListResponse,
} from '../quotations.types';

@Injectable({ providedIn: 'root' })
export class QuotationsService {
  private readonly http = inject(HttpClient);

  getQuotations(params: QuotationListParams = {}): Observable<QuotationsListResponse> {
    let httpParams = new HttpParams()
      .set('page', String(params.page ?? 1))
      .set('limit', String(params.limit ?? 10));
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.status) httpParams = httpParams.set('status', params.status);
    if (params.leadId) httpParams = httpParams.set('leadId', params.leadId);
    if (params.clientId) httpParams = httpParams.set('clientId', params.clientId);
    if (params.from) httpParams = httpParams.set('from', params.from);
    if (params.to) httpParams = httpParams.set('to', params.to);
    return this.http.get<QuotationsListResponse>('/api/quotations', { params: httpParams });
  }

  getQuotation(id: string): Observable<QuotationResponse> {
    return this.http.get<QuotationResponse>('/api/quotations/' + id);
  }

  createQuotation(data: QuotationFormData): Observable<QuotationResponse> {
    return this.http.post<QuotationResponse>('/api/quotations', data);
  }

  updateQuotation(id: string, data: Partial<QuotationFormData>): Observable<QuotationResponse> {
    return this.http.put<QuotationResponse>('/api/quotations/' + id, data);
  }

  deleteQuotation(id: string): Observable<{ success: boolean; message?: string }> {
    return this.http.delete<{ success: boolean; message?: string }>('/api/quotations/' + id);
  }
}
