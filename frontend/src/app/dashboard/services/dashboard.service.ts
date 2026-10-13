import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ActivityLogListResponse, DashboardResponse } from '../dashboard.types';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  getSummary(): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>('/api/dashboard/summary');
  }

  // Company audit trail (OWNER/ADMIN only on the backend). The dashboard only
  // calls this for roles that are authorized to read it.
  getRecentActivity(limit = 5): Observable<ActivityLogListResponse> {
    return this.http.get<ActivityLogListResponse>('/api/activity-logs', {
      params: { limit },
    });
  }
}
