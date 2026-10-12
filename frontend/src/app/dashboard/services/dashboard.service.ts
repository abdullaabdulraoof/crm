import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { DashboardResponse } from '../dashboard.types';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  getSummary(): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>('/api/dashboard/summary');
  }
}
