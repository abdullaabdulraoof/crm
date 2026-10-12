import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuotationFormComponent } from './quotation-form.component';
import { Quotation } from '../quotations.types';

const PRODUCT = {
  id: 'p1',
  companyId: 'co1',
  name: 'CRM License',
  description: '',
  sku: 'SKU-100',
  unitPrice: 1000,
  gstRate: 18,
  type: 'PRODUCT' as const,
  isActive: true,
  createdAt: null,
  updatedAt: null,
};

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
  validUntil: null,
  status: 'DRAFT',
  notes: '',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('QuotationFormComponent', () => {
  let fixture: ComponentFixture<QuotationFormComponent>;
  let component: QuotationFormComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuotationFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(QuotationFormComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/leads?page=1&limit=100').flush({
      success: true,
      data: [{ id: 'l1', name: 'Acme Prospect' }],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    httpMock.expectOne('/api/clients/options').flush({
      success: true,
      data: { clients: [{ id: 'c1', name: 'Zephyr Corp', phoneNumber: '1' }] },
    });
    httpMock.expectOne('/api/products?page=1&limit=100&isActive=true').flush({
      success: true,
      data: [PRODUCT],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('creates the component with one empty item row', () => {
    expect(component).toBeTruthy();
    expect(component.isEdit).toBe(false);
    expect(component.itemRows.length).toBe(1);
  });

  it('blocks submission when no lead or client is selected', () => {
    component.onSubmit();

    expect(component.formError()).toBe('Select a lead or client to relate this quotation to.');
    httpMock.expectNone('/api/quotations');
  });

  it('creates a quotation with a manual item and never sends totals', () => {
    component.form.patchValue({ relatedType: 'LEAD', leadId: 'l1' });
    component.itemRows.at(0).patchValue({
      description: 'Consulting',
      quantity: 2,
      unitPrice: 1000,
      gstRate: 18,
    });
    component.onSubmit();

    const req = httpMock.expectOne('/api/quotations');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.leadId).toBe('l1');
    expect(req.request.body.clientId).toBeNull();
    expect(req.request.body.items).toEqual([
      { description: 'Consulting', quantity: 2, unitPrice: 1000, gstRate: 18 },
    ]);
    expect(req.request.body.subtotal).toBeUndefined();
    expect(req.request.body.totalAmount).toBeUndefined();
    req.flush({ success: true, data: { quotation: QUOTATION } });
  });

  it('sends only productId and quantity for a product-linked item', () => {
    component.form.patchValue({ relatedType: 'CLIENT', clientId: 'c1' });
    component.itemRows.at(0).patchValue({ productId: 'p1' });
    component.onProductChange(0);
    component.itemRows.at(0).patchValue({ quantity: 3 });

    expect(component.itemRows.at(0).getRawValue().unitPrice).toBe(1000);
    expect(component.isProductLinked(0)).toBe(true);

    component.onSubmit();

    const req = httpMock.expectOne('/api/quotations');
    expect(req.request.body.clientId).toBe('c1');
    expect(req.request.body.leadId).toBeNull();
    expect(req.request.body.items).toEqual([{ productId: 'p1', quantity: 3 }]);
    req.flush({ success: true, data: { quotation: QUOTATION } });
  });

  it('adds and removes item rows but keeps at least one', () => {
    component.addItem();
    expect(component.itemRows.length).toBe(2);

    component.removeItem(1);
    expect(component.itemRows.length).toBe(1);

    component.removeItem(0);
    expect(component.itemRows.length).toBe(1);
  });

  it('previews subtotal, GST and total from the current rows', () => {
    component.itemRows.at(0).patchValue({ quantity: 2, unitPrice: 1000, gstRate: 18 });
    component.form.controls.discountAmount.setValue(100);

    const preview = component.preview();
    expect(preview.subtotal).toBe(2000);
    expect(preview.taxAmount).toBe(360);
    expect(preview.totalAmount).toBe(2260);
  });

  it('populates edit mode and PUTs without server-owned fields', () => {
    component.quotation = QUOTATION;
    component.ngOnChanges({ quotation: {} as never, isOpen: {} as never });
    fixture.detectChanges();

    expect(component.isEdit).toBe(true);
    expect(component.form.getRawValue().leadId).toBe('l1');
    expect(component.itemRows.length).toBe(1);

    component.onSubmit();

    const req = httpMock.expectOne('/api/quotations/q1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.companyId).toBeUndefined();
    expect(req.request.body.quotationNumber).toBeUndefined();
    expect(req.request.body.totalAmount).toBeUndefined();
    req.flush({ success: true, data: { quotation: QUOTATION } });
  });

  it('surfaces a backend validation error without closing', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    component.form.patchValue({ relatedType: 'LEAD', leadId: 'l1' });
    component.itemRows.at(0).patchValue({ description: 'X', quantity: 1, unitPrice: 10 });
    component.onSubmit();

    httpMock.expectOne('/api/quotations').flush(
      { success: false, error: { message: 'Validation failed' } },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(component.formError()).toBe('Validation failed');
    expect(closed).toBe(false);
    expect(component.submitting()).toBe(false);
  });

  it('emits cancelled when cancel is clicked', () => {
    let cancelled = false;
    component.cancelled.subscribe(() => (cancelled = true));
    component.onCancel();
    expect(cancelled).toBe(true);
  });
});
