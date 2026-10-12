import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  InvoiceFormData,
  InvoiceListParams,
  InvoiceResponse,
  InvoicesListResponse,
} from '../invoices.types';

@Injectable({ providedIn: 'root' })
export class InvoicesService {
  private readonly http = inject(HttpClient);

  getInvoices(params: InvoiceListParams = {}): Observable<InvoicesListResponse> {
    let httpParams = new HttpParams()
      .set('page', String(params.page ?? 1))
      .set('limit', String(params.limit ?? 10));
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.status) httpParams = httpParams.set('status', params.status);
    if (params.clientId) httpParams = httpParams.set('clientId', params.clientId);
    if (params.from) httpParams = httpParams.set('from', params.from);
    if (params.to) httpParams = httpParams.set('to', params.to);
    return this.http.get<InvoicesListResponse>('/api/invoices', { params: httpParams });
  }

  getInvoice(id: string): Observable<InvoiceResponse> {
    return this.http.get<InvoiceResponse>('/api/invoices/' + id);
  }

  createInvoice(data: InvoiceFormData): Observable<InvoiceResponse> {
    return this.http.post<InvoiceResponse>('/api/invoices', data);
  }

  updateInvoice(id: string, data: Partial<InvoiceFormData>): Observable<InvoiceResponse> {
    return this.http.put<InvoiceResponse>('/api/invoices/' + id, data);
  }

  deleteInvoice(id: string): Observable<{ success: boolean; message?: string }> {
    return this.http.delete<{ success: boolean; message?: string }>('/api/invoices/' + id);
  }
}
