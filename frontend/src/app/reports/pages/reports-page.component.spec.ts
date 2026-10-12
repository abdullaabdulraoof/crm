import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportsPageComponent } from './reports-page.component';
import { ReportData } from '../reports.types';

const LEADS: ReportData = {
  range: { from: null, to: null },
  total: 5,
  byStatus: { NEW: 3, CONTACTED: 1, QUALIFIED: 0, PROPOSAL_SENT: 0, WON: 1, LOST: 0 },
  bySource: { WEBSITE: 2, PHONE: 1, WHATSAPP: 0, REFERRAL: 2, SOCIAL_MEDIA: 0, OTHER: 0 },
};

const INVOICES: ReportData = {
  range: { from: '2026-01-01T00:00:00.000Z', to: null },
  total: 7,
  byStatus: { DRAFT: 1, ISSUED: 1, PARTIALLY_PAID: 1, PAID: 1, CANCELLED: 1, OVERDUE: 2 },
  totalInvoiced: 6300,
  amountCollected: 1600,
  outstandingBalance: 3200,
  overdueCount: 2,
  overdueBalance: 1600,
};

const PAYMENTS: ReportData = {
  range: { from: null, to: null },
  total: 2,
  totalRecorded: 2,
  totalAmount: 800,
  byMethod: {
    CASH: { count: 1, total: 500 },
    BANK_TRANSFER: { count: 0, total: 0 },
    UPI: { count: 1, total: 300 },
    CARD: { count: 0, total: 0 },
    CHEQUE: { count: 0, total: 0 },
    OTHER: { count: 0, total: 0 },
  },
};

describe('ReportsPageComponent', () => {
  let fixture: ComponentFixture<ReportsPageComponent>;
  let component: ReportsPageComponent;
  let httpMock: HttpTestingController;

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  async function setup(initial: ReportData = LEADS): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ReportsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/reports/leads').flush({ success: true, data: initial });
    fixture.detectChanges();
  }

  it('loads the leads report by default and renders totals', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(component.active()).toBe('leads');
    expect(text).toContain('Reports');
    expect(text).toContain('Total Leads');
    expect(text).toContain('5');
    expect(text).toContain('By Source');
  });

  it('switches tabs and fetches the matching report', async () => {
    await setup();
    component.onTab('invoices');

    const req = httpMock.expectOne('/api/reports/invoices');
    req.flush({ success: true, data: INVOICES });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(component.active()).toBe('invoices');
    expect(text).toContain('Total Invoiced');
    expect(text).toContain('6,300');
    expect(text).toContain('Outstanding Balance');
    expect(text).toContain('3,200');
  });

  it('applies the selected date range to the request', async () => {
    await setup();
    component.onDateChange('from', '2026-01-01');
    component.onDateChange('to', '2026-12-31');
    component.load();

    const req = httpMock.expectOne(
      (r) => r.url === '/api/reports/leads' && r.params.get('from') === '2026-01-01'
    );
    expect(req.request.params.get('to')).toBe('2026-12-31');
    req.flush({ success: true, data: LEADS });
    fixture.detectChanges();
    expect(component.hasRange()).toBe(true);
  });

  it('clears the range and refetches without params', async () => {
    await setup();
    component.onDateChange('from', '2026-01-01');
    component.clearRange();

    const req = httpMock.expectOne('/api/reports/leads');
    expect(req.request.params.has('from')).toBe(false);
    req.flush({ success: true, data: LEADS });
    fixture.detectChanges();
    expect(component.hasRange()).toBe(false);
    expect(component.rangeLabel()).toBe('All time');
  });

  it('lists payment methods including zero-filled rows', async () => {
    await setup();
    component.onTab('payments');
    httpMock.expectOne('/api/reports/payments').flush({ success: true, data: PAYMENTS });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('By Method');
    expect(text).toContain('Bank Transfer');
    expect(component.methodRows().length).toBe(6);
    expect(component.methodRows().find((r) => r.key === 'CASH')?.total).toBe(500);
  });

  it('shows a friendly error when the report request fails', async () => {
    await setup();
    component.load();
    httpMock
      .expectOne('/api/reports/leads')
      .flush({ success: false, error: { message: 'Invalid date range' } }, { status: 400, statusText: 'Bad Request' });

    expect(component.error()).toBe('Invalid date range');
  });
});
