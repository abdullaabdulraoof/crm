import { Component, computed, inject, OnInit, signal } from '@angular/core';
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
import { IconComponent } from '../../layout/icon/icon.component';

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

const STATUS_OPTIONS = [
  { value: 'RECORDED', label: 'Recorded' },
  { value: 'VOIDED', label: 'Voided' },
  { value: 'REFUNDED', label: 'Refunded' },
];

@Component({
  selector: 'app-payments-page',
  standalone: true,
  imports: [CommonModule, PaymentFormComponent, PaymentViewComponent, IconComponent],
  templateUrl: './payments-page.component.html',
})
export class PaymentsPageComponent implements OnInit {
  private readonly paymentsService = inject(PaymentsService);
  private readonly clientsService = inject(ClientsService);
  private readonly invoicesService = inject(InvoicesService);
  readonly auth = inject(AuthService);

  readonly methods = PAYMENT_METHODS;
  readonly methodLabels = PAYMENT_METHOD_LABELS;
  readonly statusOptions = STATUS_OPTIONS;

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

  readonly showFilters = signal(false);
  readonly selectedPaymentIds = signal<Set<string>>(new Set());

  // Frontend convenience only - the backend enforces the real permissions.
  readonly canRecord = signal(false);
  readonly canVoid = signal(false);

  readonly rangeStart = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.limit + 1));
  readonly rangeEnd = computed(() => Math.min(this.page() * this.limit, this.total()));

  readonly activeChips = computed(() => {
    const f = this.filters();
    const chips: { key: keyof Filters; label: string; value: string }[] = [];
    if (f.search) chips.push({ key: 'search', label: 'Search', value: f.search });
    if (f.status) chips.push({ key: 'status', label: 'Status', value: f.status });
    if (f.method) chips.push({ key: 'method', label: 'Method', value: this.methodLabel(f.method as PaymentMethod) });
    if (f.clientId) {
      const c = this.clients().find((x) => x.id === f.clientId);
      chips.push({ key: 'clientId', label: 'Client', value: c?.name || f.clientId });
    }
    if (f.from) chips.push({ key: 'from', label: 'From', value: f.from });
    if (f.to) chips.push({ key: 'to', label: 'To', value: f.to });
    return chips;
  });

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

  removeFilter(key: keyof Filters): void {
    this.filters.update((f) => ({ ...f, [key]: '' }));
    this.page.set(1);
    this.refresh();
  }

  clearFilters(): void {
    this.filters.set({ ...EMPTY_FILTERS });
    this.page.set(1);
    this.refresh();
  }

  hasActiveFilters(): boolean {
    return this.activeChips().length > 0;
  }

  toggleSelectAll(checked: boolean): void {
    if (checked) {
      this.selectedPaymentIds.set(new Set(this.payments().map((p) => p.id)));
    } else {
      this.selectedPaymentIds.set(new Set());
    }
  }

  toggleSelectPayment(id: string): void {
    this.selectedPaymentIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  isPaymentSelected(id: string): boolean {
    return this.selectedPaymentIds().has(id);
  }

  isAllSelected(): boolean {
    const list = this.payments();
    return list.length > 0 && list.every((p) => this.selectedPaymentIds().has(p.id));
  }

  onAdd(): void {
    this.showForm.set(true);
    this.error.set(null);
    this.success.set(null);
  }

  onView(payment: Payment): void {
    this.viewing.set(payment);
    this.voidError.set(null);
  }

  onViewClosed(): void {
    this.viewing.set(null);
    this.voidError.set(null);
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

  onVoid(payment: Payment): void {
    if (this.voidBusy()) return;
    const input = prompt('Reason for voiding payment (optional):');
    if (input === null) return;
    const reason = input.trim();

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
        return 'crm-status-pill status-green';
      case 'VOIDED':
        return 'crm-status-pill status-red';
      case 'REFUNDED':
        return 'crm-status-pill status-amber';
      default:
        return 'crm-status-pill status-muted';
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
