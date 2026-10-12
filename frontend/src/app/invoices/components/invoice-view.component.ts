import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Invoice } from '../invoices.types';

@Component({
  selector: 'app-invoice-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invoice-view.component.html',
})
export class InvoiceViewComponent {
  @Input() invoice: Invoice | null = null;
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();

  onClose(): void {
    this.closed.emit();
  }

  customerName(): string {
    return this.invoice?.client?.name || '-';
  }

  displayAmount(value: number | null | undefined): string {
    return typeof value === 'number' ? value.toLocaleString() : '-';
  }

  displayDate(iso: string | null): string {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
  }
}
