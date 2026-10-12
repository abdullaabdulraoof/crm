import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  FollowUpFormData,
  FollowUpListParams,
  FollowUpResponse,
  FollowUpsListResponse,
} from '../follow-ups.types';

@Injectable({ providedIn: 'root' })
export class FollowUpsService {
  private readonly http = inject(HttpClient);

  getFollowUps(params: FollowUpListParams = {}): Observable<FollowUpsListResponse> {
    let httpParams = new HttpParams().set('page', String(params.page ?? 1)).set('limit', String(params.limit ?? 10));
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.status) httpParams = httpParams.set('status', params.status);
    if (params.type) httpParams = httpParams.set('type', params.type);
    if (params.assignedTo) httpParams = httpParams.set('assignedTo', params.assignedTo);
    if (params.from) httpParams = httpParams.set('from', params.from);
    if (params.to) httpParams = httpParams.set('to', params.to);
    return this.http.get<FollowUpsListResponse>('/api/follow-ups', { params: httpParams });
  }

  getFollowUp(id: string): Observable<FollowUpResponse> {
    return this.http.get<FollowUpResponse>('/api/follow-ups/' + id);
  }

  createFollowUp(data: FollowUpFormData): Observable<FollowUpResponse> {
    return this.http.post<FollowUpResponse>('/api/follow-ups', data);
  }

  updateFollowUp(id: string, data: Partial<FollowUpFormData>): Observable<FollowUpResponse> {
    return this.http.put<FollowUpResponse>('/api/follow-ups/' + id, data);
  }

  deleteFollowUp(id: string): Observable<{ success: boolean; message?: string; data?: { id: string } }> {
    return this.http.delete<{ success: boolean; message?: string; data?: { id: string } }>(
      '/api/follow-ups/' + id
    );
  }
}
