import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  PaymentFormData,
  PaymentListParams,
  PaymentResponse,
  PaymentsListResponse,
} from '../payments.types';

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private readonly http = inject(HttpClient);

  getPayments(params: PaymentListParams = {}): Observable<PaymentsListResponse> {
    let httpParams = new HttpParams()
      .set('page', String(params.page ?? 1))
      .set('limit', String(params.limit ?? 10));
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.invoiceId) httpParams = httpParams.set('invoiceId', params.invoiceId);
    if (params.clientId) httpParams = httpParams.set('clientId', params.clientId);
    if (params.method) httpParams = httpParams.set('method', params.method);
    if (params.status) httpParams = httpParams.set('status', params.status);
    if (params.from) httpParams = httpParams.set('from', params.from);
    if (params.to) httpParams = httpParams.set('to', params.to);
    return this.http.get<PaymentsListResponse>('/api/payments', { params: httpParams });
  }

  getPayment(id: string): Observable<PaymentResponse> {
    return this.http.get<PaymentResponse>('/api/payments/' + id);
  }

  recordPayment(data: PaymentFormData): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>('/api/payments', data);
  }

  voidPayment(id: string, reason: string): Observable<PaymentResponse> {
    return this.http.post<PaymentResponse>('/api/payments/' + id + '/void', { reason });
  }
}
