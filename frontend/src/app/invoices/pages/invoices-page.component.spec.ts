import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { InvoicesPageComponent } from './invoices-page.component';
import { Invoice } from '../invoices.types';

const INVOICE: Invoice = {
  id: 'i1',
  companyId: 'c1',
  company: {
    id: 'c1',
    name: 'Acme Solutions',
    email: 'billing@acme.com',
    phone: '1234567890',
    gstNumber: 'GSTACME1',
    address: '1 Acme Way, Springfield',
  },
  invoiceNumber: 'INV-2026-0001',
  quotationId: null,
  quotation: null,
  clientId: 'cl1',
  client: { id: 'cl1', name: 'Zephyr Corp', phoneNumber: '9876543210', email: 'z@x.com' },
  createdBy: { id: 'u1', name: 'Owner', email: 'owner@x.com' },
  items: [
    {
      id: 'it1',
      productId: null,
      product: null,
      description: 'Consulting',
      quantity: 2,
      unitPrice: 1000,
      gstRate: 18,
      amount: 2000,
    },
  ],
  subtotal: 2000,
  discountAmount: 100,
  taxAmount: 360,
  totalAmount: 2260,
  amountPaid: 0,
  balanceDue: 2260,
  issueDate: '2026-10-01T00:00:00.000Z',
  dueDate: null,
  status: 'DRAFT',
  isOverdue: false,
  effectiveStatus: 'DRAFT',
  notes: '',
  paymentTerms: '',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const LIST_RESPONSE = {
  success: true,
  data: [INVOICE],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

const EMPTY_RESPONSE = {
  success: true,
  data: [],
  pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
};

const CLIENTS_RESPONSE = {
  success: true,
  data: { clients: [{ id: 'cl1', name: 'Zephyr Corp', phoneNumber: '1' }] },
};

function seedUser(role: string): void {
  localStorage.setItem('crm.auth.token', 'jwt-token');
  localStorage.setItem(
    'crm.auth.user',
    JSON.stringify({ id: 'u1', name: 'Tester', email: 't@x.com', role })
  );
}

describe('InvoicesPageComponent', () => {
  let fixture: ComponentFixture<InvoicesPageComponent>;
  let component: InvoicesPageComponent;
  let httpMock: HttpTestingController;

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function configure(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [InvoicesPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoicesPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/clients/options').flush(CLIENTS_RESPONSE);
    httpMock.expectOne('/api/invoices?page=1&limit=10').flush(LIST_RESPONSE);
    fixture.detectChanges();
  }

  async function setup(role = 'OWNER'): Promise<void> {
    seedUser(role);
    await configure();
  }

  it('renders the invoices returned by the API', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('INV-2026-0001');
    expect(text).toContain('Zephyr Corp');
    expect(text).toContain('DRAFT');
    expect(text).toContain('2,260');
    expect(text).toContain('Page 1 of 1');
  });

  it('shows New/Issue/Edit but not Delete for SALES', async () => {
    await setup('SALES');
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).map((b) => b.textContent?.trim());
    expect(labels).toContain('New Invoice');
    expect(labels).toContain('Issue');
    expect(labels).toContain('Edit');
    expect(labels).not.toContain('Delete');
  });

  it('hides Delete from MANAGER but shows it for OWNER', async () => {
    await setup('MANAGER');
    let labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).map((b) => b.textContent?.trim());
    expect(labels).not.toContain('Delete');

    TestBed.resetTestingModule();
    await setup('OWNER');
    labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).map((b) => b.textContent?.trim());
    expect(labels).toContain('Delete');
  });

  it('search applies on Enter and resets to page 1', async () => {
    await setup();
    const input = (fixture.nativeElement as HTMLElement).querySelector('#filterSearch') as HTMLInputElement;
    input.value = 'INV-2026';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const req = httpMock.expectOne(
      (r) => r.url === '/api/invoices' && r.params.get('search') === 'INV-2026'
    );
    expect(req.request.params.get('page')).toBe('1');
    req.flush(EMPTY_RESPONSE);
    expect(component.filters().search).toBe('INV-2026');
  });

  it('status filter change refetches immediately', async () => {
    await setup();
    component.onFilterChange('status', 'ISSUED');

    const req = httpMock.expectOne(
      (r) => r.url === '/api/invoices' && r.params.get('status') === 'ISSUED'
    );
    req.flush(EMPTY_RESPONSE);
  });

  it('client filter change refetches immediately', async () => {
    await setup();
    component.onFilterChange('clientId', 'cl1');

    const req = httpMock.expectOne(
      (r) => r.url === '/api/invoices' && r.params.get('clientId') === 'cl1'
    );
    req.flush(EMPTY_RESPONSE);
  });

  it('clear filters removes all params and refreshes', async () => {
    await setup();
    component.filters.set({ search: 'x', status: 'ISSUED', clientId: 'cl1', from: '2026-01-01', to: '2026-12-31' });

    component.clearFilters();

    const req = httpMock.expectOne('/api/invoices?page=1&limit=10');
    expect(req.request.params.has('search')).toBe(false);
    req.flush(LIST_RESPONSE);
    expect(component.hasActiveFilters()).toBe(false);
  });

  it('opens the read-only view for an invoice', async () => {
    await setup();
    component.onView(INVOICE);
    fixture.detectChanges();

    expect(component.viewing()?.id).toBe('i1');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Invoice INV-2026-0001');
  });

  it('issues a draft invoice and refreshes', async () => {
    await setup();
    component.onIssue(INVOICE);

    const req = httpMock.expectOne('/api/invoices/i1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'ISSUED' });
    req.flush({ success: true, data: { invoice: { ...INVOICE, status: 'ISSUED' } } });

    const listReq = httpMock.expectOne('/api/invoices?page=1&limit=10');
    listReq.flush(EMPTY_RESPONSE);
    expect(component.success()).toBe('Invoice issued.');
  });

  it('deletes after confirmation and refreshes', async () => {
    await setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.onDelete(INVOICE);
    expect(confirmSpy).toHaveBeenCalledWith('Delete this invoice?');

    const delReq = httpMock.expectOne('/api/invoices/i1');
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush({ success: true });

    const listReq = httpMock.expectOne('/api/invoices?page=1&limit=10');
    listReq.flush(EMPTY_RESPONSE);
    expect(component.success()).toBe('Invoice deleted.');
  });

  it('does not delete when confirmation is dismissed', async () => {
    await setup();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    component.onDelete(INVOICE);

    httpMock.expectNone((r) => r.url === '/api/invoices/i1' && r.method === 'DELETE');
  });

  it('shows the empty state when nothing matches', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [InvoicesPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoicesPageComponent);
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/clients/options').flush(CLIENTS_RESPONSE);
    httpMock.expectOne('/api/invoices?page=1&limit=10').flush(EMPTY_RESPONSE);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No invoices found.');
    expect(text).toContain('New Invoice');
  });

  it('surfaces a friendly error when the list request fails', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [InvoicesPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoicesPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/clients/options').flush(CLIENTS_RESPONSE);
    httpMock
      .expectOne('/api/invoices?page=1&limit=10')
      .flush({ success: false, error: { message: 'boom' } }, { status: 500, statusText: 'Server Error' });

    expect(component.error()).toBe('Something went wrong. Please try again.');
  });
});
