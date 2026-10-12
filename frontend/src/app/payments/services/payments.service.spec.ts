import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PaymentsService } from './payments.service';
import { Payment } from '../payments.types';

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
  client: { id: 'cl1', name: 'Zephyr Corp', phoneNumber: '9876543210', email: 'z@x.com' },
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
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const LIST_RESPONSE = {
  success: true,
  data: [PAYMENT],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

describe('PaymentsService', () => {
  let service: PaymentsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PaymentsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('lists payments with default pagination', () => {
    service.getPayments().subscribe((res) => expect(res).toEqual(LIST_RESPONSE));

    const req = httpMock.expectOne('/api/payments?page=1&limit=10');
    expect(req.request.method).toBe('GET');
    req.flush(LIST_RESPONSE);
  });

  it('serializes invoice, client, method, status and date filters', () => {
    service
      .getPayments({
        page: 2,
        limit: 10,
        search: 'PAY-2026',
        invoiceId: 'i1',
        clientId: 'cl1',
        method: 'UPI',
        status: 'RECORDED',
        from: '2026-01-01',
        to: '2026-12-31',
      })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/payments' && r.params.get('method') === 'UPI');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('search')).toBe('PAY-2026');
    expect(req.request.params.get('invoiceId')).toBe('i1');
    expect(req.request.params.get('clientId')).toBe('cl1');
    expect(req.request.params.get('status')).toBe('RECORDED');
    expect(req.request.params.get('from')).toBe('2026-01-01');
    expect(req.request.params.get('to')).toBe('2026-12-31');
    req.flush(LIST_RESPONSE);
  });

  it('omits empty filters from query params', () => {
    service.getPayments({ page: 1, limit: 10, method: '' }).subscribe();

    const req = httpMock.expectOne('/api/payments?page=1&limit=10');
    expect(req.request.params.has('method')).toBe(false);
    expect(req.request.params.has('status')).toBe(false);
    req.flush(LIST_RESPONSE);
  });

  it('fetches a single payment', () => {
    service.getPayment('pay1').subscribe((res) => expect(res.data.payment.id).toBe('pay1'));

    const req = httpMock.expectOne('/api/payments/pay1');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { payment: PAYMENT } });
  });

  it('records a payment with POST and never sends tenant/identity fields', () => {
    const data = {
      invoiceId: 'i1',
      amount: 400,
      method: 'UPI' as const,
      transactionReference: 'UPI-123',
    };
    service.recordPayment(data).subscribe();

    const req = httpMock.expectOne('/api/payments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(data);
    expect(req.request.body?.companyId).toBeUndefined();
    expect(req.request.body?.paymentNumber).toBeUndefined();
    expect(req.request.body?.recordedBy).toBeUndefined();
    req.flush({ success: true, data: { payment: PAYMENT } });
  });

  it('voids a payment with a reason', () => {
    service.voidPayment('pay1', 'duplicate').subscribe();

    const req = httpMock.expectOne('/api/payments/pay1/void');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'duplicate' });
    req.flush({ success: true, data: { payment: { ...PAYMENT, status: 'VOIDED' } } });
  });
});
