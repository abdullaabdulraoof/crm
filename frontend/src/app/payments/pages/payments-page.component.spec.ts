import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PaymentsPageComponent } from './payments-page.component';
import { Payment } from '../payments.types';
import { Invoice } from '../../invoices/invoices.types';

const PAYMENT: Payment = {
  id: 'pay1',
  companyId: 'c1',
  paymentNumber: 'PAY-2026-0001',
  invoiceId: 'i1',
  invoice: {
    id: 'i1',
    invoiceNumber: 'INV-2026-0001',
    status: 'PARTIALLY_PAID',
    totalAmount: 1000,
    amountPaid: 400,
    balanceDue: 600,
  },
  clientId: 'cl1',
  client: { id: 'cl1', name: 'Zephyr Corp', phoneNumber: '1', email: 'z@x.com' },
  amount: 400,
  paymentDate: '2026-10-01T00:00:00.000Z',
  method: 'UPI',
  transactionReference: 'UPI-123',
  status: 'RECORDED',
  notes: '',
  recordedBy: { id: 'u1', name: 'Owner', email: 'owner@x.com' },
  voidReason: '',
  voidedBy: null,
  voidedAt: null,
  createdAt: null,
  updatedAt: null,
};

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
  client: { id: 'cl1', name: 'Zephyr Corp', phoneNumber: '1', email: 'z@x.com' },
  createdBy: { id: 'u1', name: 'Owner', email: 'owner@x.com' },
  items: [],
  subtotal: 1000,
  discountAmount: 0,
  taxAmount: 0,
  totalAmount: 1000,
  amountPaid: 400,
  balanceDue: 600,
  issueDate: '2026-10-01T00:00:00.000Z',
  dueDate: null,
  status: 'PARTIALLY_PAID',
  isOverdue: false,
  effectiveStatus: 'PARTIALLY_PAID',
  notes: '',
  paymentTerms: '',
  createdAt: null,
  updatedAt: null,
};

const LIST_RESPONSE = {
  success: true,
  data: [PAYMENT],
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

const INVOICES_RESPONSE = {
  success: true,
  data: [INVOICE],
  pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
};

function seedUser(role: string): void {
  localStorage.setItem('crm.auth.token', 'jwt-token');
  localStorage.setItem(
    'crm.auth.user',
    JSON.stringify({ id: 'u1', name: 'Tester', email: 't@x.com', role })
  );
}

describe('PaymentsPageComponent', () => {
  let fixture: ComponentFixture<PaymentsPageComponent>;
  let component: PaymentsPageComponent;
  let httpMock: HttpTestingController;

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  async function setup(role = 'OWNER', list = LIST_RESPONSE): Promise<void> {
    seedUser(role);
    await TestBed.configureTestingModule({
      imports: [PaymentsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/clients/options').flush(CLIENTS_RESPONSE);
    httpMock.expectOne('/api/invoices?page=1&limit=100').flush(INVOICES_RESPONSE);
    httpMock.expectOne('/api/payments?page=1&limit=10').flush(list);
    fixture.detectChanges();
  }

  it('renders the payments returned by the API', async () => {
    await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('PAY-2026-0001');
    expect(text).toContain('INV-2026-0001');
    expect(text).toContain('Zephyr Corp');
    expect(text).toContain('UPI');
    expect(text).toContain('400');
    expect(text).toContain('Page 1 of 1');
  });

  it('shows Record Payment to SALES but not the Void action', async () => {
    await setup('SALES');
    const labels = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).map((b) => b.textContent?.trim());
    expect(labels).toContain('Record Payment');
    expect(component.canVoid()).toBe(false);
  });

  it('grants the Void action only to OWNER and ADMIN', async () => {
    await setup('MANAGER');
    expect(component.canVoid()).toBe(false);

    TestBed.resetTestingModule();
    await setup('OWNER');
    expect(component.canVoid()).toBe(true);
  });

  it('method filter change refetches immediately', async () => {
    await setup();
    component.onFilterChange('method', 'UPI');

    const req = httpMock.expectOne((r) => r.url === '/api/payments' && r.params.get('method') === 'UPI');
    req.flush(EMPTY_RESPONSE);
  });

  it('search applies on Enter and resets to page 1', async () => {
    await setup();
    const input = (fixture.nativeElement as HTMLElement).querySelector('#filterSearch') as HTMLInputElement;
    input.value = 'PAY-2026';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const req = httpMock.expectOne(
      (r) => r.url === '/api/payments' && r.params.get('search') === 'PAY-2026'
    );
    expect(req.request.params.get('page')).toBe('1');
    req.flush(EMPTY_RESPONSE);
    expect(component.filters().search).toBe('PAY-2026');
  });

  it('clear filters removes all params', async () => {
    await setup();
    component.filters.set({ search: '', invoiceId: 'i1', clientId: 'cl1', method: 'UPI', status: 'RECORDED', from: '2026-01-01', to: '2026-12-31' });

    component.clearFilters();

    const req = httpMock.expectOne('/api/payments?page=1&limit=10');
    expect(req.request.params.has('method')).toBe(false);
    req.flush(LIST_RESPONSE);
    expect(component.hasActiveFilters()).toBe(false);
  });

  it('opens the read-only view for a payment', async () => {
    await setup();
    component.onView(PAYMENT);
    fixture.detectChanges();

    expect(component.viewing()?.id).toBe('pay1');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Payment PAY-2026-0001');
  });

  it('voids a payment and refreshes the list', async () => {
    await setup('OWNER');
    component.onView(PAYMENT);
    component.onVoid('Customer reversed the transfer');

    const req = httpMock.expectOne('/api/payments/pay1/void');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Customer reversed the transfer' });
    req.flush({ success: true, data: { payment: { ...PAYMENT, status: 'VOIDED' } } });

    httpMock.expectOne('/api/invoices?page=1&limit=100').flush(INVOICES_RESPONSE);
    httpMock.expectOne('/api/payments?page=1&limit=10').flush(EMPTY_RESPONSE);

    expect(component.viewing()).toBeNull();
    expect(component.success()).toBe('Payment voided.');
  });

  it('keeps the dialog open and shows an error when a void fails', async () => {
    await setup('OWNER');
    component.onView(PAYMENT);
    component.onVoid('reason');

    httpMock
      .expectOne('/api/payments/pay1/void')
      .flush({ success: false, error: { message: 'Cannot void' } }, { status: 400, statusText: 'Bad Request' });

    expect(component.voidError()).toBe('Cannot void');
    expect(component.viewing()?.id).toBe('pay1');
  });

  it('shows the empty state when nothing matches', async () => {
    await setup('OWNER', EMPTY_RESPONSE);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No payments found.');
    expect(text).toContain('Record Payment');
  });

  it('surfaces a friendly error when the list request fails', async () => {
    seedUser('OWNER');
    await TestBed.configureTestingModule({
      imports: [PaymentsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    httpMock.expectOne('/api/clients/options').flush(CLIENTS_RESPONSE);
    httpMock.expectOne('/api/invoices?page=1&limit=100').flush(INVOICES_RESPONSE);
    httpMock
      .expectOne('/api/payments?page=1&limit=10')
      .flush({ success: false, error: { message: 'boom' } }, { status: 500, statusText: 'Server Error' });

    expect(component.error()).toBe('Something went wrong. Please try again.');
  });
});
