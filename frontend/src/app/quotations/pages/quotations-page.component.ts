import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';

import { QuotationsService } from '../services/quotations.service';
import { Quotation } from '../quotations.types';
import { QuotationFormComponent } from '../components/quotation-form.component';
import { QuotationViewComponent } from '../components/quotation-view.component';
import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../../layout/icon/icon.component';

interface Filters {
  search: string;
  status: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { search: '', status: '', from: '', to: '' };

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SENT', label: 'Sent' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'EXPIRED', label: 'Expired' },
];

@Component({
  selector: 'app-quotations-page',
  standalone: true,
  imports: [CommonModule, QuotationFormComponent, QuotationViewComponent, IconComponent],
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

  readonly statusOptions = STATUS_OPTIONS;
  readonly showFilters = signal(false);
  readonly selectedQuotationIds = signal<Set<string>>(new Set());

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
    if (f.from) chips.push({ key: 'from', label: 'From', value: f.from });
    if (f.to) chips.push({ key: 'to', label: 'To', value: f.to });
    return chips;
  });

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
      this.selectedQuotationIds.set(new Set(this.quotations().map((q) => q.id)));
    } else {
      this.selectedQuotationIds.set(new Set());
    }
  }

  toggleSelectQuotation(id: string): void {
    this.selectedQuotationIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  isQuotationSelected(id: string): boolean {
    return this.selectedQuotationIds().has(id);
  }

  isAllSelected(): boolean {
    const list = this.quotations();
    return list.length > 0 && list.every((q) => this.selectedQuotationIds().has(q.id));
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
        return 'crm-status-pill status-green';
      case 'REJECTED':
        return 'crm-status-pill status-red';
      case 'EXPIRED':
        return 'crm-status-pill status-muted';
      case 'SENT':
        return 'crm-status-pill status-blue';
      case 'DRAFT':
      default:
        return 'crm-status-pill status-amber';
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
