import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('fetches the dashboard summary', () => {
    service.getSummary().subscribe((res) => expect(res.success).toBe(true));

    const req = httpMock.expectOne('/api/dashboard/summary');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { cards: { totalLeads: 0 } } });
  });

  it('fetches recent activity with a limit', () => {
    service.getRecentActivity().subscribe((res) => expect(res.data.length).toBe(0));

    const req = httpMock.expectOne('/api/activity-logs?limit=5');
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      data: [],
      pagination: { page: 1, limit: 5, total: 0, totalPages: 0 },
    });
  });
});
