import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { QuotationsService } from './quotations.service';
import { Quotation } from '../quotations.types';

const QUOTATION: Quotation = {
  id: 'q1',
  companyId: 'c1',
  quotationNumber: 'QT-2026-0001',
  leadId: 'l1',
  lead: { id: 'l1', name: 'Acme Prospect', phoneNumber: '9876543210' },
  clientId: null,
  client: null,
  createdBy: { id: 'u1', name: 'Owner', email: 'owner@x.com' },
  items: [
    {
      id: 'i1',
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
  validUntil: null,
  status: 'DRAFT',
  notes: '',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const LIST_RESPONSE = {
  success: true,
  data: [QUOTATION],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

describe('QuotationsService', () => {
  let service: QuotationsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(QuotationsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('lists quotations with default pagination', () => {
    service.getQuotations().subscribe((res) => expect(res).toEqual(LIST_RESPONSE));

    const req = httpMock.expectOne('/api/quotations?page=1&limit=10');
    expect(req.request.method).toBe('GET');
    req.flush(LIST_RESPONSE);
  });

  it('serializes search and status filters', () => {
    service
      .getQuotations({
        page: 2,
        limit: 10,
        search: 'QT-2026',
        status: 'SENT',
        from: '2026-10-01',
        to: '2026-10-31',
      })
      .subscribe();

    const req = httpMock.expectOne(
      (r) => r.url === '/api/quotations' && r.params.get('search') === 'QT-2026'
    );
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('status')).toBe('SENT');
    expect(req.request.params.get('from')).toBe('2026-10-01');
    expect(req.request.params.get('to')).toBe('2026-10-31');
    req.flush(LIST_RESPONSE);
  });

  it('omits empty filters from query params', () => {
    service.getQuotations({ page: 1, limit: 10, search: '', status: undefined }).subscribe();

    const req = httpMock.expectOne('/api/quotations?page=1&limit=10');
    expect(req.request.params.has('search')).toBe(false);
    expect(req.request.params.has('status')).toBe(false);
    req.flush(LIST_RESPONSE);
  });

  it('fetches a single quotation', () => {
    service.getQuotation('q1').subscribe((res) => expect(res.data.quotation.id).toBe('q1'));

    const req = httpMock.expectOne('/api/quotations/q1');
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { quotation: QUOTATION } });
  });

  it('creates a quotation with POST', () => {
    const data = {
      leadId: 'l1',
      items: [{ description: 'Consulting', quantity: 1, unitPrice: 100, gstRate: 18 }],
    };
    service.createQuotation(data).subscribe();

    const req = httpMock.expectOne('/api/quotations');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(data);
    expect(req.request.body?.subtotal).toBeUndefined();
    expect(req.request.body?.totalAmount).toBeUndefined();
    req.flush({ success: true, data: { quotation: QUOTATION } });
  });

  it('updates a quotation with PUT', () => {
    service.updateQuotation('q1', { status: 'SENT' }).subscribe();

    const req = httpMock.expectOne('/api/quotations/q1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'SENT' });
    req.flush({ success: true, data: { quotation: { ...QUOTATION, status: 'SENT' } } });
  });

  it('deletes a quotation with DELETE', () => {
    service.deleteQuotation('q1').subscribe();

    const req = httpMock.expectOne('/api/quotations/q1');
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true });
  });
});
