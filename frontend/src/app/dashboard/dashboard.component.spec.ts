import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { Dashboard } from './dashboard.component';
import { DashboardSummary } from './dashboard.types';

const SUMMARY: DashboardSummary = {
  generatedAt: '2026-10-09T00:00:00.000Z',
  month: { key: '2026-10' },
  cards: {
    totalLeads: 6,
    newLeads: 4,
    totalClients: 3,
    activeProducts: 5,
    quotationsSent: 2,
    outstandingBalance: 3200,
    paymentsThisMonth: 800,
    overdueInvoices: 2,
  },
  leadsByStatus: { NEW: 2, CONTACTED: 1, QUALIFIED: 0, PROPOSAL_SENT: 0, WON: 0, LOST: 0 },
  quotationsByStatus: { DRAFT: 1, SENT: 2, ACCEPTED: 0, REJECTED: 0, EXPIRED: 0 },
  invoiceStatus: { DRAFT: 0, ISSUED: 1, PARTIALLY_PAID: 1, PAID: 0, CANCELLED: 0, OVERDUE: 1 },
  monthlyPayments: [
    { month: '2026-05', total: 0 },
    { month: '2026-06', total: 0 },
    { month: '2026-07', total: 0 },
    { month: '2026-08', total: 0 },
    { month: '2026-09', total: 0 },
    { month: '2026-10', total: 800 },
  ],
  totals: { invoicedThisMonth: 6300, outstandingBalance: 3200, overdueBalance: 1600 },
  recent: {
    leads: [{ id: 'l1', name: 'Zephyr Lead', status: 'NEW', source: 'WEBSITE', createdAt: null }],
    quotations: [
      {
        id: 'q1',
        quotationNumber: 'QT-2026-0001',
        client: { id: 'c1', name: 'Zephyr Corp' },
        lead: null,
        targetName: 'Zephyr Corp',
        totalAmount: 1000,
        status: 'SENT',
        createdAt: null,
      },
    ],
    invoices: [
      {
        id: 'i1',
        invoiceNumber: 'INV-2026-0001',
        client: { id: 'c1', name: 'Zephyr Corp' },
        totalAmount: 1000,
        balanceDue: 600,
        status: 'PARTIALLY_PAID',
        effectiveStatus: 'PARTIALLY_PAID',
        issueDate: null,
        dueDate: null,
        createdAt: null,
      },
    ],
    followUps: [
      {
        id: 'f1',
        subject: 'Call back',
        type: 'CALL',
        status: 'PENDING',
        dueAt: '2026-10-05T00:00:00.000Z',
        lead: null,
        client: { id: 'c1', name: 'Zephyr Corp' },
        assignedTo: { id: 'u1', name: 'Owner', email: 'owner@x.com' },
      },
    ],
  },
};

function seedUser(role = 'OWNER'): void {
  localStorage.setItem('crm.auth.token', 'jwt-token');
  localStorage.setItem(
    'crm.auth.user',
    JSON.stringify({ id: 'u1', name: 'Tester', email: 't@x.com', role })
  );
}

describe('Dashboard', () => {
  let fixture: ComponentFixture<Dashboard>;
  let component: Dashboard;
  let httpMock: HttpTestingController;

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  async function setup(summary: DashboardSummary = SUMMARY): Promise<void> {
    seedUser();
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/dashboard/summary').flush({ success: true, data: summary });
    fixture.detectChanges();
  }

  it('requests the summary and renders the KPI cards', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(component.summary()?.cards.totalLeads).toBe(6);
    expect(text).toContain('Total Leads');
    expect(text).toContain('New Leads');
    expect(text).toContain('Total Clients');
    expect(text).toContain('Outstanding Payment');
    expect(text).toContain('3,200');
  });

  it('renders the pipeline chart, financial summary and recent quotations', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Upcoming follow-ups');
    expect(text).toContain('Financial summary');
    expect(text).toContain('Outstanding balance');
    expect(text).toContain('Recent quotations');
    expect(text).toContain('QT-2026-0001');
    expect(text).toContain('Zephyr Corp');
    expect(text).not.toContain('Recent activity');
    expect(text).not.toContain('Recent leads');
  });

  it('switches the chart series between leads and quotations', async () => {
    await setup();
    const el = fixture.nativeElement as HTMLElement;
    expect(component.pipeline()).toBe('leads');
    expect(el.textContent).toContain('Proposal Sent');
    expect(el.textContent).not.toContain('Expired');

    const tab = Array.from(el.querySelectorAll('button')).find(
      (button) => (button.textContent ?? '').trim() === 'Quotations'
    ) as HTMLButtonElement;
    tab.click();
    fixture.detectChanges();

    expect(component.pipeline()).toBe('quotations');
    expect(el.textContent).toContain('Expired');
    expect(el.textContent).not.toContain('Proposal Sent');
  });

  it('wires the quick actions to the create forms', async () => {
    await setup();
    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('a')
    );
    const href = (label: string): string | null | undefined =>
      links.find((link) => (link.textContent ?? '').includes(label))?.getAttribute('href');

    expect(href('Add Lead')).toBe('/leads?new=1');
    expect(href('Add Client')).toBe('/clients?new=1');
    expect(href('New Quotation')).toBe('/quotations?new=1');
  });

  it('renders follow-ups without loading recent activity', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Call back');
    httpMock.expectNone('/api/activity-logs?limit=5');
  });

  it('shows empty-state copy when there are no follow-ups or quotations', async () => {
    await setup({ ...SUMMARY, recent: { leads: [], quotations: [], invoices: [], followUps: [] } });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No pending follow-ups.');
    expect(text).toContain('No quotations yet.');
  });

  it('surfaces a friendly error when the summary request fails', async () => {
    seedUser();
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock
      .expectOne('/api/dashboard/summary')
      .flush(
        { success: false, error: { message: 'boom' } },
        { status: 500, statusText: 'Server Error' }
      );
    fixture.detectChanges();

    expect(component.error()).toBe('Something went wrong. Please try again.');
    expect(component.summary()).toBeNull();
  });
});
