import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InvoiceViewComponent } from './invoice-view.component';
import { Invoice } from '../invoices.types';

const INVOICE: Invoice = {
  id: 'i1',
  companyId: 'c1',
  invoiceNumber: 'INV-2026-0001',
  quotationId: 'q1',
  quotation: { id: 'q1', quotationNumber: 'QT-2026-0001' },
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
  amountPaid: 500,
  balanceDue: 1760,
  issueDate: '2026-10-01T00:00:00.000Z',
  dueDate: '2026-11-01T00:00:00.000Z',
  status: 'PARTIALLY_PAID',
  isOverdue: false,
  effectiveStatus: 'PARTIALLY_PAID',
  notes: 'Net 30',
  paymentTerms: 'Net 30',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('InvoiceViewComponent', () => {
  let fixture: ComponentFixture<InvoiceViewComponent>;
  let component: InvoiceViewComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvoiceViewComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceViewComponent);
    component = fixture.componentInstance;
    component.invoice = INVOICE;
    component.isOpen = true;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the invoice details read-only', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('INV-2026-0001');
    expect(text).toContain('Zephyr Corp');
    expect(text).toContain('PARTIALLY_PAID');
    expect(text).toContain('CRM License');
    expect(text).toContain('2,260');
    expect(text).toContain('Net 30');
  });

  it('shows totals, amount paid and balance due', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Subtotal');
    expect(text).toContain('GST');
    expect(text).toContain('Total');
    expect(text).toContain('Amount Paid');
    expect(text).toContain('Balance Due');
    expect(text).toContain('1,760');
  });

  it('shows the effective OVERDUE status', () => {
    fixture.componentRef.setInput('invoice', {
      ...INVOICE,
      status: 'ISSUED',
      isOverdue: true,
      effectiveStatus: 'OVERDUE',
    });
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('OVERDUE');
  });

  it('emits closed when the close button is clicked', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));
    component.onClose();
    expect(closed).toBe(true);
  });

  it('returns a dash for an invoice without a client', () => {
    component.invoice = { ...INVOICE, client: null };
    expect(component.customerName()).toBe('-');
  });
});
