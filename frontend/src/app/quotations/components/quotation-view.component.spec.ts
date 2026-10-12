import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuotationViewComponent } from './quotation-view.component';
import { Quotation } from '../quotations.types';

const QUOTATION: Quotation = {
  id: 'q1',
  companyId: 'c1',
  quotationNumber: 'QT-2026-0001',
  leadId: null,
  lead: null,
  clientId: 'c1',
  client: { id: 'c1', name: 'Zephyr Corp', phoneNumber: '9876543210' },
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
  validUntil: '2026-11-01T00:00:00.000Z',
  status: 'ACCEPTED',
  notes: 'Net 30',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

describe('QuotationViewComponent', () => {
  let fixture: ComponentFixture<QuotationViewComponent>;
  let component: QuotationViewComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuotationViewComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(QuotationViewComponent);
    component = fixture.componentInstance;
    component.quotation = QUOTATION;
    component.isOpen = true;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the quotation details read-only', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('QT-2026-0001');
    expect(text).toContain('Zephyr Corp');
    expect(text).toContain('Client');
    expect(text).toContain('ACCEPTED');
    expect(text).toContain('CRM License');
    expect(text).toContain('2,260');
    expect(text).toContain('Net 30');
  });

  it('shows totals and GST', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Subtotal');
    expect(text).toContain('GST');
    expect(text).toContain('Total');
  });

  it('emits closed when the close button is clicked', () => {
    let closed = false;
    component.closed.subscribe(() => (closed = true));
    component.onClose();
    expect(closed).toBe(true);
  });

  it('returns a dash for a quotation without a customer', () => {
    component.quotation = { ...QUOTATION, client: null, clientId: null, lead: null, leadId: null };
    expect(component.customerName()).toBe('-');
  });
});
