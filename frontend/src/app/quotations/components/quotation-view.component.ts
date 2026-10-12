import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Quotation } from '../quotations.types';

@Component({
  selector: 'app-quotation-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './quotation-view.component.html',
})
export class QuotationViewComponent {
  @Input() quotation: Quotation | null = null;
  @Input() isOpen = false;
  @Output() closed = new EventEmitter<void>();

  onClose(): void {
    this.closed.emit();
  }

  customerName(): string {
    return this.quotation?.client?.name || this.quotation?.lead?.name || '-';
  }

  customerLabel(): string {
    return this.quotation?.client ? 'Client' : this.quotation?.lead ? 'Lead' : '';
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
