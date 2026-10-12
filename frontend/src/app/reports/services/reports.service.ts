import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ReportKey, ReportParams, ReportResponse } from '../reports.types';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);

  getReport(key: ReportKey, params: ReportParams = {}): Observable<ReportResponse> {
    let httpParams = new HttpParams();
    if (params.from) httpParams = httpParams.set('from', params.from);
    if (params.to) httpParams = httpParams.set('to', params.to);
    return this.http.get<ReportResponse>(`/api/reports/${key}`, { params: httpParams });
  }
}
