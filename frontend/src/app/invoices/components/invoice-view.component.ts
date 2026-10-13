import {
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  Output,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { Invoice } from '../invoices.types';
import { InvoiceDocumentComponent } from './invoice-document.component';
import { InvoicePdfService } from '../services/invoice-pdf.service';
import { InvoicePrintService } from '../services/invoice-print.service';
import { IconComponent } from '../../layout/icon/icon.component';

@Component({
  selector: 'app-invoice-view',
  standalone: true,
  imports: [CommonModule, InvoiceDocumentComponent, IconComponent],
  templateUrl: './invoice-view.component.html',
})
export class InvoiceViewComponent {
  private readonly pdfService = inject(InvoicePdfService);
  private readonly printService = inject(InvoicePrintService);

  @Input() invoice: Invoice | null = null;
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();

  readonly downloading = signal(false);
  readonly actionError = signal<string | null>(null);

  private readonly docRoot = viewChild<ElementRef<HTMLElement>>('invoiceDocRoot');

  onClose(): void {
    this.closed.emit();
  }

  async onDownloadPdf(): Promise<void> {
    const invoice = this.invoice;
    if (!invoice || this.downloading()) return;
    this.actionError.set(null);
    this.downloading.set(true);
    try {
      await this.pdfService.download(invoice);
    } catch {
      this.actionError.set('Could not generate the PDF. Please try again.');
    } finally {
      this.downloading.set(false);
    }
  }

  onPrint(): void {
    if (!this.invoice) return;
    const element = this.docRoot()?.nativeElement;
    if (!element) return;
    this.actionError.set(null);
    try {
      this.printService.print(element);
    } catch {
      this.actionError.set('Could not open the print dialog. Please try again.');
    }
  }

  customerName(): string {
    return this.invoice?.client?.name || '-';
  }
}
