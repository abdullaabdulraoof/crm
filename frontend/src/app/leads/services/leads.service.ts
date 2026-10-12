import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Lead, LeadFormData, LeadListParams, LeadResponse, LeadsListResponse } from '../leads.types';

@Injectable({ providedIn: 'root' })
export class LeadsService {
  private readonly http = inject(HttpClient);

  getLeads(params: LeadListParams = {}): Observable<LeadsListResponse> {
    return this.http.get<LeadsListResponse>('/api/leads', { params: toHttpParams(params) });
  }

  getLead(id: string): Observable<LeadResponse> {
    return this.http.get<LeadResponse>('/api/leads/' + id);
  }

  createLead(data: LeadFormData): Observable<LeadResponse> {
    return this.http.post<LeadResponse>('/api/leads', data);
  }

  updateLead(id: string, data: Partial<LeadFormData>): Observable<LeadResponse> {
    return this.http.put<LeadResponse>('/api/leads/' + id, data);
  }

  deleteLead(id: string): Observable<{ success: boolean; message?: string }> {
    return this.http.delete<{ success: boolean; message?: string }>('/api/leads/' + id);
  }
}

function toHttpParams(params: LeadListParams): HttpParams {
  let httpParams = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      httpParams = httpParams.set(key, String(value));
    }
  }
  return httpParams;
}
