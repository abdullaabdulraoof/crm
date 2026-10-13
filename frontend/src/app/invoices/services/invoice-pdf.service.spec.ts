import { vi } from 'vitest';

import { Invoice } from '../invoices.types';

const { saveMock, autoTableMock } = vi.hoisted(() => {
  const save = vi.fn();
  const table = vi.fn((doc: { lastAutoTable?: { finalY: number } }) => {
    doc.lastAutoTable = { finalY: 120 };
  });
  return { saveMock: vi.fn(), autoTableMock: vi.fn() };
});

vi.mock('jspdf', () => {
  class MockJsPDF {
    lastAutoTable = { finalY: 100 };
    setFont = vi.fn();
    setFontSize = vi.fn();
    setTextColor = vi.fn();
    setDrawColor = vi.fn();
    text = vi.fn();
    line = vi.fn();
    addPage = vi.fn();
    setPage = vi.fn();
    getNumberOfPages = vi.fn(() => 1);
    splitTextToSize = vi.fn((value: string) => [value]);
    save = saveMock;
  }
  return { jsPDF: MockJsPDF };
});

vi.mock('jspdf-autotable', () => ({
  default: autoTableMock,
  autoTable: autoTableMock,
}));

import { InvoicePdfService } from './invoice-pdf.service';

const INVOICE: Invoice = {
  id: 'i1',
  companyId: 'c1',
  company: {
    id: 'c1',
    name: 'Acme Solutions',
    email: 'billing@acme.com',
    phone: '1234567890',
    gstNumber: 'GSTACME1',
    address: '1 Acme Way',
  },
  invoiceNumber: 'INV-2026-0001',
  quotationId: null,
  quotation: null,
  clientId: 'cl1',
  client: { id: 'cl1', name: 'Zephyr Corp', phoneNumber: '1', email: 'z@x.com' },
  createdBy: null,
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
  discountAmount: 0,
  taxAmount: 360,
  totalAmount: 2360,
  amountPaid: 0,
  balanceDue: 2360,
  issueDate: '2026-10-01T00:00:00.000Z',
  dueDate: null,
  status: 'ISSUED',
  isOverdue: false,
  effectiveStatus: 'ISSUED',
  notes: '',
  paymentTerms: 'Net 30',
  createdAt: null,
  updatedAt: null,
};

describe('InvoicePdfService', () => {
  const service = new InvoicePdfService();

  beforeEach(() => {
    saveMock.mockClear();
    autoTableMock.mockClear();
  });

  it('names the file after the invoice number', () => {
    expect(service.fileName(INVOICE)).toBe('Invoice-INV-2026-0001.pdf');
  });

  it('falls back to the invoice id when there is no number', () => {
    expect(service.fileName({ ...INVOICE, invoiceNumber: '' })).toBe('Invoice-i1.pdf');
  });

  it('generates and saves a PDF with the expected file name', async () => {
    await service.download(INVOICE);
    expect(autoTableMock).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledWith('Invoice-INV-2026-0001.pdf');
  });
});
