import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { InvoiceViewComponent } from './invoice-view.component';
import { Invoice } from '../invoices.types';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import { InvoicePrintService } from '../services/invoice-print.service';

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
  let pdfService: { download: ReturnType<typeof vi.fn> };
  let printService: { print: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    pdfService = { download: vi.fn().mockResolvedValue(undefined) };
    printService = { print: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [InvoiceViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: InvoicePdfService, useValue: pdfService },
        { provide: InvoicePrintService, useValue: printService },
      ],
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
    expect(text).toContain('Acme Solutions');
    expect(text).toContain('PARTIALLY_PAID');
    expect(text).toContain('CRM License');
    expect(text).toContain('2,260');
    expect(text).toContain('Net 30');
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

  it('shows Download PDF and Print Invoice actions', () => {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button')
    ).map((b) => (b.textContent ?? '').trim());
    expect(buttons.some((b) => b.includes('Download PDF'))).toBe(true);
    expect(buttons.some((b) => b.includes('Print Invoice'))).toBe(true);
  });

  it('generates a PDF for the current invoice when Download PDF is clicked', async () => {
    await component.onDownloadPdf();
    expect(pdfService.download).toHaveBeenCalledTimes(1);
    expect(pdfService.download).toHaveBeenCalledWith(INVOICE);
    expect(component.downloading()).toBe(false);
  });

  it('surfaces an inline error when PDF generation fails', async () => {
    pdfService.download.mockRejectedValueOnce(new Error('boom'));
    await component.onDownloadPdf();
    expect(component.actionError()).toBeTruthy();
    expect(component.downloading()).toBe(false);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Could not generate the PDF');
  });

  it('prints the rendered document when Print Invoice is clicked', () => {
    component.onPrint();
    expect(printService.print).toHaveBeenCalledTimes(1);
    const el = printService.print.mock.calls[0][0] as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.textContent).toContain('INV-2026-0001');
  });

  it('does nothing when there is no invoice', async () => {
    component.invoice = null;
    await component.onDownloadPdf();
    component.onPrint();
    expect(pdfService.download).not.toHaveBeenCalled();
    expect(printService.print).not.toHaveBeenCalled();
  });
});
