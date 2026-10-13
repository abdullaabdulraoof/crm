import { Injectable } from '@angular/core';

import { Invoice } from '../invoices.types';

const MARGIN = 14; // mm
const PAGE_WIDTH = 210; // A4 width in mm
const PAGE_HEIGHT = 297; // A4 height in mm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Currency formatting mirrors the on-screen displayAmount() convention: plain
// thousands-separated numbers, no symbol. Values are taken verbatim from the
// invoice response - never recalculated here.
const formatAmount = (value: number | null | undefined): string =>
  typeof value === 'number' ? value.toLocaleString() : '-';

const formatDate = (iso: string | null): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
};

type AutoTableFn = (doc: unknown, options: Record<string, unknown>) => void;

@Injectable({ providedIn: 'root' })
export class InvoicePdfService {
  /**
   * Builds and downloads an A4 PDF of the given invoice. jsPDF and the
   * autoTable plugin are loaded lazily so they never enter the initial bundle.
   */
  async download(invoice: Invoice): Promise<void> {
    const [{ jsPDF }, autoTableModule] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const autoTable: AutoTableFn =
      (autoTableModule as unknown as { default?: AutoTableFn }).default ??
      (autoTableModule as unknown as { autoTable: AutoTableFn }).autoTable;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    this.drawHeader(doc, invoice);

    const y = MARGIN + 30;
    let cursor = this.drawParties(doc, invoice, y);
    cursor = this.drawItems(doc, autoTable, invoice, cursor);
    cursor = this.drawTotals(doc, invoice, cursor);
    this.drawNotes(doc, invoice, cursor);
    this.drawFooter(doc, invoice);

    doc.save(this.fileName(invoice));
  }

  fileName(invoice: Invoice): string {
    const number = invoice.invoiceNumber || invoice.id;
    return `Invoice-${number}.pdf`;
  }

  private drawHeader(doc: any, invoice: Invoice): void {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(invoice.company?.name || 'Invoice', MARGIN, MARGIN + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    let leftY = MARGIN + 10;
    if (invoice.company?.address) {
      const lines = doc.splitTextToSize(invoice.company.address, CONTENT_WIDTH / 2);
      doc.text(lines, MARGIN, leftY);
      leftY += lines.length * 4;
    }
    if (invoice.company?.phone) {
      doc.text(`Phone: ${invoice.company.phone}`, MARGIN, leftY);
      leftY += 4;
    }
    if (invoice.company?.email) {
      doc.text(`Email: ${invoice.company.email}`, MARGIN, leftY);
      leftY += 4;
    }
    if (invoice.company?.gstNumber) {
      doc.text(`GST: ${invoice.company.gstNumber}`, MARGIN, leftY);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42);
    doc.text('INVOICE', PAGE_WIDTH - MARGIN, MARGIN + 4, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(invoice.invoiceNumber || '', PAGE_WIDTH - MARGIN, MARGIN + 11, { align: 'right' });
    doc.text(invoice.effectiveStatus || invoice.status || '', PAGE_WIDTH - MARGIN, MARGIN + 16, {
      align: 'right',
    });
  }

  private drawParties(doc: any, invoice: Invoice, startY: number): number {
    let y = startY;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('BILL TO', MARGIN, y);
    doc.text('DETAILS', PAGE_WIDTH - MARGIN, y, { align: 'right' });
    y += 6;

    const client = invoice.client;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(client?.name || '-', MARGIN, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    let clientY = y + 4;
    if (client?.address) {
      const lines = doc.splitTextToSize(client.address, CONTENT_WIDTH / 2);
      doc.text(lines, MARGIN, clientY);
      clientY += lines.length * 4;
    }
    if (client?.phoneNumber) {
      doc.text(`Phone: ${client.phoneNumber}`, MARGIN, clientY);
      clientY += 4;
    }
    if (client?.email) {
      doc.text(`Email: ${client.email}`, MARGIN, clientY);
      clientY += 4;
    }
    if (client?.gstNo) {
      doc.text(`GST: ${client.gstNo}`, MARGIN, clientY);
      clientY += 4;
    }

    let metaY = y;
    const metaRight = PAGE_WIDTH - MARGIN;
    const metaRows: Array<[string, string]> = [
      ['Issue Date', formatDate(invoice.issueDate)],
      ['Due Date', formatDate(invoice.dueDate)],
    ];
    if (invoice.quotation?.quotationNumber) {
      metaRows.push(['Quotation', invoice.quotation.quotationNumber]);
    }
    metaRows.push(['Status', invoice.effectiveStatus || invoice.status]);

    for (const [label, value] of metaRows) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(label, metaRight - 45, metaY, { align: 'left' });
      doc.setTextColor(30, 41, 59);
      doc.text(value, metaRight, metaY, { align: 'right' });
      metaY += 5;
    }

    return Math.max(clientY, metaY) + 4;
  }

  private drawItems(doc: any, autoTable: AutoTableFn, invoice: Invoice, startY: number): number {
    autoTable(doc, {
      startY,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Description', 'Qty', 'Unit Price', 'GST %', 'Amount']],
      body: (invoice.items || []).map((item) => [
        item.description,
        String(item.quantity),
        formatAmount(item.unitPrice),
        String(item.gstRate),
        formatAmount(item.amount),
      ]),
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 'auto', halign: 'left' },
        1: { halign: 'right', cellWidth: 16 },
        2: { halign: 'right', cellWidth: 26 },
        3: { halign: 'right', cellWidth: 18 },
        4: { halign: 'right', cellWidth: 28 },
      },
    });

    const finalY = (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
    return (typeof finalY === 'number' ? finalY : startY) + 8;
  }

  private drawTotals(doc: any, invoice: Invoice, startY: number): number {
    const rows: Array<[string, string, boolean]> = [
      ['Subtotal', formatAmount(invoice.subtotal), false],
    ];
    if ((invoice.discountAmount ?? 0) > 0) {
      rows.push(['Discount', `-${formatAmount(invoice.discountAmount)}`, false]);
    }
    rows.push(['GST', formatAmount(invoice.taxAmount), false]);
    rows.push(['Total', formatAmount(invoice.totalAmount), true]);
    rows.push(['Amount Paid', formatAmount(invoice.amountPaid), false]);
    rows.push(['Balance Due', formatAmount(invoice.balanceDue), true]);

    const valueX = PAGE_WIDTH - MARGIN;
    const labelX = valueX - 70;
    const rowHeight = 6;
    const blockHeight = rows.length * rowHeight;

    let y = startY;
    // Keep the totals block intact on one page where practical.
    if (y + blockHeight > PAGE_HEIGHT - MARGIN - 20) {
      doc.addPage();
      y = MARGIN + 6;
    }

    for (const [label, value, emphasize] of rows) {
      if (emphasize) {
        doc.setDrawColor(203, 213, 216);
        doc.line(labelX, y - 4, valueX, y - 4);
      }
      doc.setFont('helvetica', emphasize ? 'bold' : 'normal');
      doc.setFontSize(emphasize ? 10 : 9);
      doc.setTextColor(71, 85, 105);
      doc.text(label, labelX, y);
      doc.setTextColor(15, 23, 42);
      doc.text(value, valueX, y, { align: 'right' });
      y += rowHeight;
    }

    return y + 4;
  }

  private drawNotes(doc: any, invoice: Invoice, startY: number): void {
    const blocks: Array<[string, string]> = [];
    if (invoice.paymentTerms) blocks.push(['Payment Terms', invoice.paymentTerms]);
    if (invoice.notes) blocks.push(['Notes', invoice.notes]);
    if (blocks.length === 0) return;

    let y = startY;
    for (const [label, value] of blocks) {
      if (y > PAGE_HEIGHT - MARGIN - 16) {
        doc.addPage();
        y = MARGIN + 6;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text(label, MARGIN, y);
      y += 5;

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const lines = doc.splitTextToSize(value, CONTENT_WIDTH);
      for (const line of lines) {
        if (y > PAGE_HEIGHT - MARGIN - 8) {
          doc.addPage();
          y = MARGIN + 6;
        }
        doc.text(line, MARGIN, y);
        y += 4;
      }
      y += 3;
    }
  }

  private drawFooter(doc: any, invoice: Invoice): void {
    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `${invoice.invoiceNumber || 'Invoice'}  |  Page ${page} of ${pageCount}`,
        PAGE_WIDTH - MARGIN,
        PAGE_HEIGHT - 8,
        { align: 'right' }
      );
    }
  }
}
