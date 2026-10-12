import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { InvoicesService } from './invoices.service';
import { Invoice } from '../invoices.types';

const INVOICE: Invoice = {
  id: 'i1',
  companyId: 'c1',
  invoiceNumber: 'INV-2026-0001',
  quotationId: null,
  quotation: null,
  clientId: 'cl1',
  client: { id: 'cl1', name: 'Zephyr Corp', phoneNumber: '9876543210', email: 'z@x.com' },
  createdBy: { id: 'u1', name: 'Owner', email: 'owner@x.com' },
  items: [
    {
      id: 'it1',
      productId: 'p1',
      product: { id: 'p1', name: 'CRM License', sku: 'SKU-100' },
      description: 'CRM License',
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

describe('InvoicesService', () => {
  let service: InvoicesService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(InvoicesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('lists invoices with default pagination', () => {
    service.getInvoices().subscribe((res) => expect(res).toEqual(LIST_RESPONSE));

    const req = httpMock.expectOne('/api/invoices?page=1&limit=10');
    expect(req.request.method).toBe('GET');
    req.flush(LIST_RESPONSE);
  });

  it('serializes search, status, client and date filters', () => {
    service
      .getInvoices({
        page: 2,
        limit: 10,
        search: 'INV-2026',
        status: 'ISSUED',
        clientId: 'cl1',
        from: '2026-01-01',
        to: '2026-12-31',
      })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === '/api/invoices' && r.params.get('search') === 'INV-2026');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('status')).toBe('ISSUED');
    expect(req.request.params.get('clientId')).toBe('cl1');
    expect(req.request.params.get('from')).toBe('2026-01-01');
    expect(req.request.params.get('to')).toBe('2026-12-31');
    req.flush(LIST_RESPONSE);
  });

  it('omits empty filters from query params', () => {
    service.getInvoices({ page: 1, limit: 10, search: '', status: undefined }).subscribe();

    const req = httpMock.expectOne('/api/invoices?page=1&limit=10');
    expect(req.request.params.has('search')).toBe(false);
    expect(req.request.params.has('status')).toBe(false);
    req.flush(LIST_RESPONSE);
  });

  it('fetches a single invoice', () => {
    service.getInvoice('i1').subscribe((res) => expect(res.data.invoice.id).toBe('i1'));

    const req = httpMock.expectOne('/api/invoices/i1');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { invoice: INVOICE } });
  });

  it('creates an invoice with POST and never sends totals', () => {
    const data = {
      clientId: 'cl1',
      items: [{ description: 'Consulting', quantity: 1, unitPrice: 100, gstRate: 18 }],
    };
    service.createInvoice(data).subscribe();

    const req = httpMock.expectOne('/api/invoices');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(data);
    expect(req.request.body?.totalAmount).toBeUndefined();
    expect(req.request.body?.invoiceNumber).toBeUndefined();
    req.flush({ success: true, data: { invoice: INVOICE } });
  });

  it('updates an invoice with PUT', () => {
    service.updateInvoice('i1', { status: 'ISSUED' }).subscribe();

    const req = httpMock.expectOne('/api/invoices/i1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'ISSUED' });
    req.flush({ success: true, data: { invoice: { ...INVOICE, status: 'ISSUED' } } });
  });

  it('deletes an invoice with DELETE', () => {
    service.deleteInvoice('i1').subscribe();

    const req = httpMock.expectOne('/api/invoices/i1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });
});
