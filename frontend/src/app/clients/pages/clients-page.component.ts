import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import { ClientsService } from '../clients.service';
import { Client, ClientType } from '../clients.types';
import { ClientFormComponent } from '../components/client-form.component';
import { IconComponent } from '../../layout/icon/icon.component';
import { AuthService } from '../../auth/auth.service';

interface Filters {
  search: string;
  clientType: string;
}

const EMPTY_FILTERS: Filters = {
  search: '',
  clientType: '',
};

const TYPE_OPTIONS: { value: ClientType; label: string }[] = [
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'BUSINESS', label: 'Business' },
];

const PAGE_SIZES = [10, 25, 50, 100];

@Component({
  selector: 'app-clients-page',
  standalone: true,
  imports: [CommonModule, ClientFormComponent, IconComponent],
  templateUrl: './clients-page.component.html',
})
export class ClientsPageComponent implements OnInit {
  private readonly clientsService = inject(ClientsService);
  readonly auth = inject(AuthService);

  readonly clients = signal<Client[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly page = signal(1);
  readonly limit = signal(10);
  readonly totalPages = signal(1);
  readonly total = signal(0);
  readonly filters = signal<Filters>({ ...EMPTY_FILTERS });
  readonly showForm = signal(false);
  readonly editing = signal<Client | null>(null);
  readonly deletingId = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly canDelete = signal(false);

  readonly typeOptions = TYPE_OPTIONS;
  readonly pageSizes = PAGE_SIZES;

  readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.limit() + 1
  );
  readonly rangeEnd = computed(() => Math.min(this.page() * this.limit(), this.total()));
  readonly activeFilterCount = computed(() => {
    const f = this.filters();
    return [f.search, f.clientType].filter(Boolean).length;
  });

  ngOnInit(): void {
    this.updatePermissions();
    this.refresh();
  }

  private updatePermissions(): void {
    const role = this.auth.user()?.role;
    // Backend: CLIENT_DELETE_ROLES = [OWNER, ADMIN]
    this.canDelete.set(role === 'OWNER' || role === 'ADMIN');
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    const f = this.filters();
    this.clientsService
      .getClientsList({
        page: this.page(),
        limit: this.limit(),
        search: f.search || undefined,
        clientType: (f.clientType || undefined) as ClientType | undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.clients.set(res.data || []);
          this.total.set(res.pagination?.total || 0);
          const pages = res.pagination?.totalPages || 1;
          this.totalPages.set(pages);
          if (this.page() > pages && pages > 0) {
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
    if (status === 404) return 'Client not found.';
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
    return this.activeFilterCount() > 0;
  }

  onPageSize(value: string): void {
    const size = Number(value);
    if (!Number.isFinite(size) || size === this.limit()) return;
    this.limit.set(size);
    this.page.set(1);
    this.refresh();
  }

  onAdd(): void {
    this.editing.set(null);
    this.showForm.set(true);
    this.error.set(null);
    this.success.set(null);
  }

  onEdit(client: Client): void {
    this.editing.set(client);
    this.showForm.set(true);
    this.error.set(null);
    this.success.set(null);
  }

  onDelete(client: Client): void {
    if (!confirm('Are you sure you want to delete this client?')) return;
    if (this.deletingId()) return;
    this.deletingId.set(client.id);
    this.error.set(null);
    this.success.set(null);
    this.clientsService.deleteClient(client.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.success.set('Client deleted successfully.');
        this.refresh();
      },
      error: (err: HttpErrorResponse) => {
        this.deletingId.set(null);
        this.error.set(this.friendly(err));
      },
    });
  }

  onFormClosed(saved: boolean): void {
    this.showForm.set(false);
    this.editing.set(null);
    if (saved) {
      this.success.set('Client saved successfully.');
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

  displayClientType(type: string): string {
    const map: Record<string, string> = {
      INDIVIDUAL: 'Individual',
      BUSINESS: 'Business',
    };
    return map[type] || type;
  }

  typeBadgeClass(type: string): string {
    return type === 'BUSINESS'
      ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
      : 'bg-slate-100 text-slate-700 ring-slate-200';
  }

  displayDate(d: string | null): string {
    if (!d) return '-';
    try {
      const date = new Date(d);
      return date.toLocaleDateString();
    } catch {
      return d;
    }
  }

  trackById(id: string): string {
    return id;
  }
}
