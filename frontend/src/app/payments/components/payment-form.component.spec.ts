import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PaymentFormComponent } from './payment-form.component';
import { Invoice } from '../../invoices/invoices.types';

const ISSUED: Invoice = {
  id: 'i1',
  companyId: 'c1',
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

const DRAFT: Invoice = { ...ISSUED, id: 'i2', invoiceNumber: 'INV-2026-0002', status: 'DRAFT', isOverdue: false };

describe('PaymentFormComponent', () => {
  let fixture: ComponentFixture<PaymentFormComponent>;
  let component: PaymentFormComponent;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentFormComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentFormComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock.expectOne('/api/invoices?page=1&limit=100').flush({
      success: true,
      data: [ISSUED, DRAFT],
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    });
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('loads only payable invoices with an outstanding balance', () => {
    expect(component).toBeTruthy();
    expect(component.eligibleInvoices().map((i) => i.id)).toEqual(['i1']);
  });

  it('blocks submission when no invoice is selected', () => {
    component.onSubmit();
    expect(component.formError()).toBe('Select an eligible invoice.');
    httpMock.expectNone('/api/payments');
  });

  it('shows the selected invoice and rejects an amount above the balance due', () => {
    component.form.controls.invoiceId.setValue('i1');
    component.onInvoiceChange();

    expect(component.selectedInvoice()?.invoiceNumber).toBe('INV-2026-0001');
    expect(component.form.controls.amount.value).toBe(600);

    component.form.controls.amount.setValue(700);
    component.onSubmit();

    expect(component.formError()).toBe('Payment amount cannot exceed the invoice balance due.');
    httpMock.expectNone('/api/payments');
  });

  it('records a payment with the invoice id and amount only', () => {
    component.form.patchValue({ invoiceId: 'i1', amount: 250, method: 'BANK_TRANSFER' });
    component.onInvoiceChange();
    component.onSubmit();

    const req = httpMock.expectOne('/api/payments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.invoiceId).toBe('i1');
    expect(req.request.body.amount).toBe(250);
    expect(req.request.body.method).toBe('BANK_TRANSFER');
    expect(req.request.body.companyId).toBeUndefined();
    expect(req.request.body.clientId).toBeUndefined();
    expect(req.request.body.paymentNumber).toBeUndefined();
    req.flush({ success: true, data: { payment: {} } });
  });

  it('surfaces a backend validation error without closing', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));

    component.form.patchValue({ invoiceId: 'i1', amount: 100 });
    component.onInvoiceChange();
    component.onSubmit();

    httpMock.expectOne('/api/payments').flush(
      { success: false, error: { message: 'amount cannot exceed the invoice balance due' } },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(component.formError()).toBe('amount cannot exceed the invoice balance due');
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
