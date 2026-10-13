import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';

import { QuotationsService } from '../services/quotations.service';
import { Quotation } from '../quotations.types';
import { QuotationFormComponent } from '../components/quotation-form.component';
import { QuotationViewComponent } from '../components/quotation-view.component';
import { AuthService } from '../../auth/auth.service';

interface Filters {
  search: string;
  status: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { search: '', status: '', from: '', to: '' };

@Component({
  selector: 'app-quotations-page',
  standalone: true,
  imports: [CommonModule, QuotationFormComponent, QuotationViewComponent],
  templateUrl: './quotations-page.component.html',
})
export class QuotationsPageComponent implements OnInit {
  private readonly quotationsService = inject(QuotationsService);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly quotations = signal<Quotation[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly page = signal(1);
  readonly limit = 10;
  readonly totalPages = signal(0);
  readonly total = signal(0);
  readonly filters = signal<Filters>({ ...EMPTY_FILTERS });
  readonly showForm = signal(false);
  readonly editing = signal<Quotation | null>(null);
  readonly viewing = signal<Quotation | null>(null);
  readonly busyId = signal<string | null>(null);

  // Frontend convenience only - the backend enforces the real permissions.
  readonly canEdit = signal(false);
  readonly canDelete = signal(false);

  ngOnInit(): void {
    this.updatePermissions();
    this.refresh();
    if (this.route.snapshot.queryParamMap.get('new') === '1') {
      this.onAdd();
    }
  }

  private updatePermissions(): void {
    const role = this.auth.user()?.role;
    this.canEdit.set(['OWNER', 'ADMIN', 'MANAGER', 'SALES'].includes(role ?? ''));
    this.canDelete.set(role === 'OWNER' || role === 'ADMIN');
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    const f = this.filters();
    this.quotationsService
      .getQuotations({
        page: this.page(),
        limit: this.limit,
        search: f.search || undefined,
        status: f.status || undefined,
        from: f.from || undefined,
        to: f.to || undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.quotations.set(res.data || []);
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
    if (status === 404) return 'Quotation not found.';
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
    return !!(f.search || f.status || f.from || f.to);
  }

  onAdd(): void {
    this.editing.set(null);
    this.showForm.set(true);
    this.error.set(null);
    this.success.set(null);
  }

  onView(quotation: Quotation): void {
    this.viewing.set(quotation);
  }

  onViewClosed(): void {
    this.viewing.set(null);
  }

  onEdit(quotation: Quotation): void {
    if (this.busyId()) return;
    this.editing.set(quotation);
    this.showForm.set(true);
    this.error.set(null);
    this.success.set(null);
  }

  onDelete(quotation: Quotation): void {
    if (this.busyId()) return;
    if (!confirm('Delete this quotation?')) return;

    this.busyId.set(quotation.id);
    this.error.set(null);
    this.success.set(null);
    this.quotationsService.deleteQuotation(quotation.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.success.set('Quotation deleted.');
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
      this.success.set('Quotation saved successfully.');
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

  customerName(q: Quotation): string {
    return q.client?.name || q.lead?.name || '-';
  }

  customerType(q: Quotation): string {
    return q.client ? 'Client' : q.lead ? 'Lead' : '-';
  }

  statusClass(status: string): string {
    switch (status) {
      case 'ACCEPTED':
        return 'bg-green-50 text-green-700 ring-green-200';
      case 'REJECTED':
        return 'bg-red-50 text-red-700 ring-red-200';
      case 'EXPIRED':
        return 'bg-gray-100 text-gray-600 ring-gray-200';
      case 'SENT':
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
