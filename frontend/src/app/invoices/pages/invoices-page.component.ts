import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import { InvoicesService } from '../services/invoices.service';
import { Invoice } from '../invoices.types';
import { InvoiceFormComponent } from '../components/invoice-form.component';
import { InvoiceViewComponent } from '../components/invoice-view.component';
import { AuthService } from '../../auth/auth.service';
import { ClientsService } from '../../clients/clients.service';
import { ClientOption } from '../../clients/clients.types';
import { IconComponent } from '../../layout/icon/icon.component';

interface Filters {
  search: string;
  status: string;
  clientId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { search: '', status: '', clientId: '', from: '', to: '' };

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ISSUED', label: 'Issued' },
  { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

@Component({
  selector: 'app-invoices-page',
  standalone: true,
  imports: [CommonModule, InvoiceFormComponent, InvoiceViewComponent, IconComponent],
  templateUrl: './invoices-page.component.html',
})
export class InvoicesPageComponent implements OnInit {
  private readonly invoicesService = inject(InvoicesService);
  private readonly clientsService = inject(ClientsService);
  readonly auth = inject(AuthService);

  readonly invoices = signal<Invoice[]>([]);
  readonly clients = signal<ClientOption[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly page = signal(1);
  readonly limit = 10;
  readonly totalPages = signal(0);
  readonly total = signal(0);
  readonly filters = signal<Filters>({ ...EMPTY_FILTERS });
  readonly showForm = signal(false);
  readonly editing = signal<Invoice | null>(null);
  readonly viewing = signal<Invoice | null>(null);
  readonly busyId = signal<string | null>(null);

  readonly statusOptions = STATUS_OPTIONS;
  readonly showFilters = signal(false);
  readonly selectedInvoiceIds = signal<Set<string>>(new Set());

  // Frontend convenience only - the backend enforces the real permissions.
  readonly canEdit = signal(false);
  readonly canDelete = signal(false);

  readonly rangeStart = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.limit + 1));
  readonly rangeEnd = computed(() => Math.min(this.page() * this.limit, this.total()));

  readonly activeChips = computed(() => {
    const f = this.filters();
    const chips: { key: keyof Filters; label: string; value: string }[] = [];
    if (f.search) chips.push({ key: 'search', label: 'Search', value: f.search });
    if (f.status) chips.push({ key: 'status', label: 'Status', value: f.status });
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
    this.refresh();
  }

  private updatePermissions(): void {
    const role = this.auth.user()?.role;
    this.canEdit.set(['OWNER', 'ADMIN', 'MANAGER', 'SALES'].includes(role ?? ''));
    this.canDelete.set(role === 'OWNER' || role === 'ADMIN');
  }

  private loadClients(): void {
    this.clientsService.getClients().subscribe({
      next: (list) => this.clients.set(list),
      error: () => this.clients.set([]),
    });
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    const f = this.filters();
    this.invoicesService
      .getInvoices({
        page: this.page(),
        limit: this.limit,
        search: f.search || undefined,
        status: f.status || undefined,
        clientId: f.clientId || undefined,
        from: f.from || undefined,
        to: f.to || undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.invoices.set(res.data || []);
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
    if (status === 404) return 'Invoice not found.';
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
      this.selectedInvoiceIds.set(new Set(this.invoices().map((i) => i.id)));
    } else {
      this.selectedInvoiceIds.set(new Set());
    }
  }

  toggleSelectInvoice(id: string): void {
    this.selectedInvoiceIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  isInvoiceSelected(id: string): boolean {
    return this.selectedInvoiceIds().has(id);
  }

  isAllSelected(): boolean {
    const list = this.invoices();
    return list.length > 0 && list.every((i) => this.selectedInvoiceIds().has(i.id));
  }

  onAdd(): void {
    this.editing.set(null);
    this.showForm.set(true);
    this.error.set(null);
    this.success.set(null);
  }

  onView(invoice: Invoice): void {
    this.viewing.set(invoice);
  }

  onViewClosed(): void {
    this.viewing.set(null);
  }

  onEdit(invoice: Invoice): void {
    if (this.busyId()) return;
    this.editing.set(invoice);
    this.showForm.set(true);
    this.error.set(null);
    this.success.set(null);
  }

  onDelete(invoice: Invoice): void {
    if (this.busyId()) return;
    if (!confirm('Delete this invoice?')) return;

    this.busyId.set(invoice.id);
    this.error.set(null);
    this.success.set(null);
    this.invoicesService.deleteInvoice(invoice.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.success.set('Invoice deleted.');
        this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        this.error.set(this.friendly(err));
      },
    });
  }

  onFormClosed(saved: boolean): void {
    this.showForm.set(false);
    this.editing.set(null);
    if (saved) {
      this.success.set('Invoice saved successfully.');
      this.refresh();
    }
  }

  onFormCancelled(): void {
    this.showForm.set(false);
    this.editing.set(null);
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

  customerName(invoice: Invoice): string {
    return invoice.client?.name || '-';
  }

  statusClass(status: string): string {
    switch (status) {
      case 'PAID':
        return 'crm-status-pill status-green';
      case 'OVERDUE':
        return 'crm-status-pill status-red';
      case 'CANCELLED':
        return 'crm-status-pill status-muted';
      case 'PARTIALLY_PAID':
        return 'crm-status-pill status-amber';
      case 'ISSUED':
        return 'crm-status-pill status-blue';
      case 'DRAFT':
      default:
        return 'crm-status-pill status-yellow';
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
