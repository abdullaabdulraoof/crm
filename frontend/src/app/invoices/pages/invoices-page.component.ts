import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import { InvoicesService } from '../services/invoices.service';
import { Invoice } from '../invoices.types';
import { InvoiceFormComponent } from '../components/invoice-form.component';
import { InvoiceViewComponent } from '../components/invoice-view.component';
import { AuthService } from '../../auth/auth.service';
import { ClientsService } from '../../clients/clients.service';
import { ClientOption } from '../../clients/clients.types';

interface Filters {
  search: string;
  status: string;
  clientId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { search: '', status: '', clientId: '', from: '', to: '' };

@Component({
  selector: 'app-invoices-page',
  standalone: true,
  imports: [CommonModule, InvoiceFormComponent, InvoiceViewComponent],
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

  // Frontend convenience only - the backend enforces the real permissions.
  readonly canEdit = signal(false);
  readonly canDelete = signal(false);

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

  clearFilters(): void {
    this.filters.set({ ...EMPTY_FILTERS });
    this.page.set(1);
    this.refresh();
  }

  hasActiveFilters(): boolean {
    const f = this.filters();
    return !!(f.search || f.status || f.clientId || f.from || f.to);
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

  onIssue(invoice: Invoice): void {
    if (this.busyId()) return;
    this.busyId.set(invoice.id);
    this.error.set(null);
    this.success.set(null);
    this.invoicesService.updateInvoice(invoice.id, { status: 'ISSUED' }).subscribe({
      next: () => {
        this.busyId.set(null);
        this.success.set('Invoice issued.');
        this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        this.error.set(this.friendly(err));
      },
    });
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
        return 'bg-green-50 text-green-700 ring-green-200';
      case 'OVERDUE':
        return 'bg-red-50 text-red-700 ring-red-200';
      case 'CANCELLED':
        return 'bg-gray-100 text-gray-600 ring-gray-200';
      case 'PARTIALLY_PAID':
        return 'bg-indigo-50 text-indigo-700 ring-indigo-200';
      case 'ISSUED':
        return 'bg-blue-50 text-blue-700 ring-blue-200';
      default:
        return 'bg-amber-50 text-amber-700 ring-amber-200';
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
