import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Invoice } from '../invoices.types';

@Component({
  selector: 'app-invoice-document',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invoice-document.component.html',
})
export class InvoiceDocumentComponent {
  @Input() invoice: Invoice | null = null;

  get companyName(): string {
    return this.invoice?.company?.name || '';
  }

  hasCompany(): boolean {
    const company = this.invoice?.company;
    return !!(
      company &&
      (company.name || company.address || company.email || company.phone || company.gstNumber)
    );
  }

  clientName(): string {
    return this.invoice?.client?.name || '';
  }

  hasDiscount(): boolean {
    return (this.invoice?.discountAmount ?? 0) > 0;
  }

  amount(value: number | null | undefined): string {
    return typeof value === 'number' ? value.toLocaleString() : '-';
  }

  quantity(value: number): string {
    return Number.isFinite(value) ? String(value) : '-';
  }

  date(iso: string | null): string {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
  }
}
