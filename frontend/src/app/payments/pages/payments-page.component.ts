import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import { PaymentsService } from '../services/payments.service';
import {
  Payment,
  PaymentMethod,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_VOID_ROLES,
} from '../payments.types';
import { PaymentFormComponent } from '../components/payment-form.component';
import { PaymentViewComponent } from '../components/payment-view.component';
import { AuthService } from '../../auth/auth.service';
import { ClientsService } from '../../clients/clients.service';
import { ClientOption } from '../../clients/clients.types';
import { InvoicesService } from '../../invoices/services/invoices.service';
import { Invoice } from '../../invoices/invoices.types';

interface Filters {
  search: string;
  invoiceId: string;
  clientId: string;
  method: string;
  status: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { search: '', invoiceId: '', clientId: '', method: '', status: '', from: '', to: '' };

@Component({
  selector: 'app-payments-page',
  standalone: true,
  imports: [CommonModule, PaymentFormComponent, PaymentViewComponent],
  templateUrl: './payments-page.component.html',
})
export class PaymentsPageComponent implements OnInit {
  private readonly paymentsService = inject(PaymentsService);
  private readonly clientsService = inject(ClientsService);
  private readonly invoicesService = inject(InvoicesService);
  readonly auth = inject(AuthService);

  readonly methods = PAYMENT_METHODS;
  readonly methodLabels = PAYMENT_METHOD_LABELS;

  readonly payments = signal<Payment[]>([]);
  readonly clients = signal<ClientOption[]>([]);
  readonly invoices = signal<Invoice[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly page = signal(1);
  readonly limit = 10;
  readonly totalPages = signal(0);
  readonly total = signal(0);
  readonly filters = signal<Filters>({ ...EMPTY_FILTERS });
  readonly showForm = signal(false);
  readonly viewing = signal<Payment | null>(null);
  readonly voidBusy = signal(false);
  readonly voidError = signal<string | null>(null);

  // Frontend convenience only - the backend enforces the real permissions.
  readonly canRecord = signal(false);
  readonly canVoid = signal(false);

  ngOnInit(): void {
    this.updatePermissions();
    this.loadClients();
    this.loadInvoices();
    this.refresh();
  }

  private updatePermissions(): void {
    const role = this.auth.user()?.role;
    this.canRecord.set(['OWNER', 'ADMIN', 'MANAGER', 'SALES'].includes(role ?? ''));
    this.canVoid.set(PAYMENT_VOID_ROLES.includes(role ?? ''));
  }

  private loadClients(): void {
    this.clientsService.getClients().subscribe({
      next: (list) => this.clients.set(list),
      error: () => this.clients.set([]),
    });
  }

  private loadInvoices(): void {
    this.invoicesService.getInvoices({ page: 1, limit: 100 }).subscribe({
      next: (res) => this.invoices.set(res.data || []),
      error: () => this.invoices.set([]),
    });
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    const f = this.filters();
    this.paymentsService
      .getPayments({
        page: this.page(),
        limit: this.limit,
        search: f.search || undefined,
        invoiceId: f.invoiceId || undefined,
        clientId: f.clientId || undefined,
        method: f.method || undefined,
        status: f.status || undefined,
        from: f.from || undefined,
        to: f.to || undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.payments.set(res.data || []);
          this.total.set(res.pagination?.total || 0);
          const pages = res.pagination?.totalPages || 0;
          this.totalPages.set(pages);
          if (pages > 0 && this.page() > pages) {
            this.page.set(pages);
            this.refresh();
          }
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(this.friendly(err));
        },
      });
  }

  private friendly(err: HttpErrorResponse): string {
    const status = err?.status ?? 0;
    if (status === 0) return 'Unable to reach the server. Please check your connection and try again.';
    if (status === 401) return 'Unauthorized. Please login again.';
    if (status === 403) return 'You do not have permission to perform this action.';
    if (status === 404) return 'Payment not found.';
    if (status === 400) return err?.error?.error?.message || err?.error?.message || 'Validation failed.';
    if (status >= 500) return 'Something went wrong. Please try again.';
    return err?.error?.error?.message || 'Something went wrong. Please try again.';
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      const value = (event.target as HTMLInputElement).value;
      this.filters.update((f) => ({ ...f, search: value.trim() }));
      this.page.set(1);
      this.refresh();
    }
  }

  onFilterChange(key: keyof Filters, value: string): void {
    this.filters.update((f) => ({ ...f, [key]: value }));
    this.page.set(1);
    this.refresh();
  }

  clearFilters(): void {
    this.filters.set({ ...EMPTY_FILTERS });
    this.page.set(1);
    this.refresh();
  }

  hasActiveFilters(): boolean {
    const f = this.filters();
    return !!(f.search || f.invoiceId || f.clientId || f.method || f.status || f.from || f.to);
  }

  onAdd(): void {
    this.showForm.set(true);
    this.error.set(null);
    this.success.set(null);
  }

  onFormClosed(saved: boolean): void {
    this.showForm.set(false);
    if (saved) {
      this.success.set('Payment recorded successfully.');
      this.loadInvoices();
      this.refresh();
    }
  }

  onFormCancelled(): void {
    this.showForm.set(false);
  }

  onView(payment: Payment): void {
    this.voidError.set(null);
    this.viewing.set(payment);
  }

  onViewClosed(): void {
    this.viewing.set(null);
    this.voidError.set(null);
  }

  onVoid(reason: string): void {
    const payment = this.viewing();
    if (!payment || this.voidBusy()) return;

    this.voidBusy.set(true);
    this.voidError.set(null);
    this.paymentsService.voidPayment(payment.id, reason).subscribe({
      next: () => {
        this.voidBusy.set(false);
        this.viewing.set(null);
        this.success.set('Payment voided.');
        this.loadInvoices();
        this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        this.voidBusy.set(false);
        this.voidError.set(this.friendly(err));
      },
    });
  }

  prevPage(): void {
    if (this.page() > 1) {
      this.page.set(this.page() - 1);
      this.refresh();
    }
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) {
      this.page.set(this.page() + 1);
      this.refresh();
    }
  }

  invoiceNumber(payment: Payment): string {
    return payment.invoice?.invoiceNumber || '-';
  }

  customerName(payment: Payment): string {
    return payment.client?.name || '-';
  }

  methodLabel(method: PaymentMethod): string {
    return PAYMENT_METHOD_LABELS[method] || method;
  }

  statusClass(status: string): string {
    switch (status) {
      case 'RECORDED':
        return 'bg-green-50 text-green-700 ring-green-200';
      case 'VOIDED':
        return 'bg-gray-100 text-gray-600 ring-gray-200';
      case 'REFUNDED':
        return 'bg-indigo-50 text-indigo-700 ring-indigo-200';
      default:
        return 'bg-gray-100 text-gray-600 ring-gray-200';
    }
  }

  displayAmount(value: number): string {
    return typeof value === 'number' ? value.toLocaleString() : String(value);
  }

  formatDate(iso: string | null): string {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
  }

  trackById(id: string): string {
    return id;
  }
}
