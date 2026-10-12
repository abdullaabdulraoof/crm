import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReportsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('fetches a report with no range by default', () => {
    service.getReport('leads').subscribe((res) => expect(res.success).toBe(true));

    const req = httpMock.expectOne('/api/reports/leads');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('from')).toBe(false);
    req.flush({ success: true, data: { range: { from: null, to: null }, total: 0 } });
  });

  it('serializes the from/to range and targets the requested report', () => {
    service.getReport('invoices', { from: '2026-01-01', to: '2026-12-31' }).subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === '/api/reports/invoices' && r.params.get('from') === '2026-01-01'
    );
    expect(req.request.params.get('to')).toBe('2026-12-31');
    req.flush({ success: true, data: { range: { from: null, to: null }, total: 0 } });
  });
});
