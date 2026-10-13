import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InvoiceDocumentComponent } from './invoice-document.component';
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
    address: '1 Acme Way\nSpringfield',
  },
  invoiceNumber: 'INV-2026-0001',
  quotationId: null,
  quotation: null,
  clientId: 'cl1',
  client: {
    id: 'cl1',
    name: 'Zephyr Corp',
    phoneNumber: '9876543210',
    email: 'z@x.com',
    address: '9 Client Rd',
    gstNo: 'GSTCL1',
  },
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
  taxAmount: 342,
  totalAmount: 2242,
  amountPaid: 500,
  balanceDue: 1742,
  issueDate: '2026-10-01T00:00:00.000Z',
  dueDate: '2026-11-01T00:00:00.000Z',
  status: 'PARTIALLY_PAID',
  isOverdue: false,
  effectiveStatus: 'PARTIALLY_PAID',
  notes: 'Thank you for your business.',
  paymentTerms: 'Net 30',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('InvoiceDocumentComponent', () => {
  let fixture: ComponentFixture<InvoiceDocumentComponent>;

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvoiceDocumentComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceDocumentComponent);
    fixture.componentRef.setInput('invoice', INVOICE);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders company, client, invoice number and status', () => {
    expect(text()).toContain('Acme Solutions');
    expect(text()).toContain('GSTACME1');
    expect(text()).toContain('Zephyr Corp');
    expect(text()).toContain('GSTCL1');
    expect(text()).toContain('INV-2026-0001');
    expect(text()).toContain('PARTIALLY_PAID');
  });

  it('renders line items with quantity, unit price and amount', () => {
    expect(text()).toContain('Consulting');
    expect(text()).toContain('2');
    expect(text()).toContain('1,000');
    expect(text()).toContain('2,000');
  });

  it('renders totals, discount, payment terms and notes', () => {
    expect(text()).toContain('Subtotal');
    expect(text()).toContain('Discount');
    expect(text()).toContain('GST');
    expect(text()).toContain('Total');
    expect(text()).toContain('2,242');
    expect(text()).toContain('Amount Paid');
    expect(text()).toContain('Balance Due');
    expect(text()).toContain('1,742');
    expect(text()).toContain('Net 30');
    expect(text()).toContain('Thank you for your business.');
  });

  it('hides the discount row when there is no discount', () => {
    fixture.componentRef.setInput('invoice', { ...INVOICE, discountAmount: 0 });
    fixture.detectChanges();
    expect(text()).not.toContain('Discount');
  });

  it('renders safely without a company or client', () => {
    fixture.componentRef.setInput('invoice', { ...INVOICE, company: null, client: null });
    fixture.detectChanges();
    expect(text()).toContain('INV-2026-0001');
    expect(fixture.componentInstance.companyName).toBe('');
    expect(fixture.componentInstance.clientName()).toBe('');
  });
});
