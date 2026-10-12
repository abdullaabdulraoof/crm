import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InvoiceFormComponent } from './invoice-form.component';
import { Invoice } from '../invoices.types';

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

const ACCEPTED_QUOTATION = {
  id: 'q1',
  companyId: 'c1',
  quotationNumber: 'QT-2026-0001',
  leadId: null,
  lead: null,
  clientId: 'cl1',
  client: { id: 'cl1', name: 'Zephyr Corp', phoneNumber: '1' },
  createdBy: { id: 'u1', name: 'Owner', email: 'owner@x.com' },
  items: [
    {
      id: 'qi1',
      productId: null,
      product: null,
      description: 'Q item',
      quantity: 2,
      unitPrice: 500,
      gstRate: 18,
      amount: 1000,
    },
  ],
  subtotal: 1000,
  discountAmount: 0,
  taxAmount: 180,
  totalAmount: 1180,
  validUntil: null,
  status: 'ACCEPTED' as const,
  notes: '',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('InvoiceFormComponent', () => {
  let fixture: ComponentFixture<InvoiceFormComponent>;
  let component: InvoiceFormComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvoiceFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceFormComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/clients/options').flush({
      success: true,
      data: { clients: [{ id: 'cl1', name: 'Zephyr Corp', phoneNumber: '1' }] },
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

  it('blocks submission when no client is selected', () => {
    component.onSubmit();

    expect(component.formError()).toBe('Select a client for this invoice.');
    httpMock.expectNone('/api/invoices');
  });

  it('creates a direct invoice with a manual item and never sends totals', () => {
    component.form.patchValue({ clientId: 'cl1' });
    component.itemRows.at(0).patchValue({
      description: 'Consulting',
      quantity: 2,
      unitPrice: 1000,
      gstRate: 18,
    });
    component.onSubmit();

    const req = httpMock.expectOne('/api/invoices');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.clientId).toBe('cl1');
    expect(req.request.body.items).toEqual([
      { description: 'Consulting', quantity: 2, unitPrice: 1000, gstRate: 18 },
    ]);
    expect(req.request.body.totalAmount).toBeUndefined();
    expect(req.request.body.invoiceNumber).toBeUndefined();
    req.flush({ success: true, data: { invoice: INVOICE } });
  });

  it('sends only productId and quantity for a product-linked item', () => {
    component.form.patchValue({ clientId: 'cl1' });
    component.itemRows.at(0).patchValue({ productId: 'p1' });
    component.onProductChange(0);
    component.itemRows.at(0).patchValue({ quantity: 3 });

    expect(component.itemRows.at(0).getRawValue().unitPrice).toBe(1000);
    expect(component.isProductLinked(0)).toBe(true);

    component.onSubmit();

    const req = httpMock.expectOne('/api/invoices');
    expect(req.request.body.items).toEqual([{ productId: 'p1', quantity: 3 }]);
    req.flush({ success: true, data: { invoice: INVOICE } });
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
    component.invoice = INVOICE;
    component.ngOnChanges({ invoice: {} as never, isOpen: {} as never });
    fixture.detectChanges();

    expect(component.isEdit).toBe(true);
    expect(component.form.getRawValue().clientId).toBe('cl1');
    expect(component.itemRows.length).toBe(1);

    component.onSubmit();

    const req = httpMock.expectOne('/api/invoices/i1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.invoiceNumber).toBeUndefined();
    expect(req.request.body.amountPaid).toBeUndefined();
    expect(req.request.body.totalAmount).toBeUndefined();
    req.flush({ success: true, data: { invoice: INVOICE } });
  });

  it('loads accepted quotations and creates from a quotation with only its id', () => {
    component.onModeChange('FROM_QUOTATION');

    httpMock.expectOne('/api/quotations?page=1&limit=100&status=ACCEPTED').flush({
      success: true,
      data: [ACCEPTED_QUOTATION],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });

    component.form.controls.quotationId.setValue('q1');
    component.onQuotationChange();
    httpMock.expectOne('/api/quotations/q1').flush({
      success: true,
      data: { quotation: ACCEPTED_QUOTATION },
    });
    fixture.detectChanges();

    expect(component.selectedQuotation()?.quotationNumber).toBe('QT-2026-0001');
    expect(component.preview().totalAmount).toBe(1180);

    component.onSubmit();

    const req = httpMock.expectOne('/api/invoices');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.quotationId).toBe('q1');
    expect(req.request.body.items).toBeUndefined();
    expect(req.request.body.clientId).toBeUndefined();
    req.flush({ success: true, data: { invoice: INVOICE } });
  });

  it('surfaces a backend validation error without closing', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    component.form.patchValue({ clientId: 'cl1' });
    component.itemRows.at(0).patchValue({ description: 'X', quantity: 1, unitPrice: 10 });
    component.onSubmit();

    httpMock.expectOne('/api/invoices').flush(
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
