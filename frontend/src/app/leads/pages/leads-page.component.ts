import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import { LeadsService } from '../services/leads.service';
import { Lead, LeadSource, LeadStatus, LeadSummary } from '../leads.types';
import { LeadFormComponent } from '../components/lead-form.component';
import { LeadViewComponent } from '../components/lead-view.component';
import { IconComponent } from '../../layout/icon/icon.component';
import { AuthService } from '../../auth/auth.service';
import { UsersService } from '../../users/users.service';
import { AssignedUserOption } from '../../users/users.types';

interface Filters {
  search: string;
  status: string;
  source: string;
  assignedTo: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  search: '',
  status: '',
  source: '',
  assignedTo: '',
  from: '',
  to: '',
};

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'QUALIFIED', label: 'Qualified' },
  { value: 'PROPOSAL_SENT', label: 'Proposal Sent' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
];

const SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: 'WEBSITE', label: 'Website' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'SOCIAL_MEDIA', label: 'Social Media' },
  { value: 'OTHER', label: 'Other' },
];

const PAGE_SIZES = [10, 25, 50, 100];

@Component({
  selector: 'app-leads-page',
  standalone: true,
  imports: [CommonModule, LeadFormComponent, LeadViewComponent, IconComponent],
  templateUrl: './leads-page.component.html',
})
export class LeadsPageComponent implements OnInit {
  private readonly leadsService = inject(LeadsService);
  private readonly usersService = inject(UsersService);
  readonly auth = inject(AuthService);

  readonly leads = signal<Lead[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly page = signal(1);
  readonly limit = signal(10);
  readonly totalPages = signal(1);
  readonly total = signal(0);
  readonly filters = signal<Filters>({ ...EMPTY_FILTERS });
  readonly assignees = signal<AssignedUserOption[]>([]);
  readonly showForm = signal(false);
  readonly editing = signal<Lead | null>(null);
  readonly viewing = signal<Lead | null>(null);
  readonly deletingId = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly summary = signal<LeadSummary | null>(null);
  readonly summaryLoading = signal(false);
  readonly summaryError = signal(false);

  readonly canDelete = signal(false);

  readonly statusOptions = STATUS_OPTIONS;
  readonly sourceOptions = SOURCE_OPTIONS;
  readonly pageSizes = PAGE_SIZES;

  readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.limit() + 1
  );
  readonly rangeEnd = computed(() => Math.min(this.page() * this.limit(), this.total()));
  readonly activeFilterCount = computed(() => {
    const f = this.filters();
    return [f.search, f.status, f.source, f.assignedTo, f.from, f.to].filter(Boolean).length;
  });

  ngOnInit(): void {
    this.updatePermissions();
    this.loadAssignees();
    this.loadSummary();
    this.refresh();
  }

  private updatePermissions(): void {
    const role = this.auth.user()?.role;
    // Backend: LEAD_DELETE_ROLES = [OWNER, ADMIN]
    this.canDelete.set(role === 'OWNER' || role === 'ADMIN');
  }

  private loadAssignees(): void {
    // Picker failure must not block the list; the filter simply has no options.
    this.usersService.getAssignedToOptions().subscribe({
      next: (users) => this.assignees.set(users || []),
      error: () => this.assignees.set([]),
    });
  }

  loadSummary(): void {
    this.summaryLoading.set(true);
    this.summaryError.set(false);
    this.leadsService.getLeadSummary().subscribe({
      next: (res) => {
        this.summaryLoading.set(false);
        this.summary.set(res.data);
      },
      error: () => {
        this.summaryLoading.set(false);
        this.summaryError.set(true);
      },
    });
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    const f = this.filters();
    this.leadsService
      .getLeads({
        page: this.page(),
        limit: this.limit(),
        search: f.search || undefined,
        status: (f.status || undefined) as LeadStatus | undefined,
        source: (f.source || undefined) as LeadSource | undefined,
        assignedTo: f.assignedTo || undefined,
        from: f.from || undefined,
        to: f.to || undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.leads.set(res.data || []);
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
    if (status === 404) return 'Lead not found.';
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

  onEdit(lead: Lead): void {
    this.editing.set(lead);
    this.showForm.set(true);
    this.error.set(null);
    this.success.set(null);
  }

  onView(lead: Lead): void {
    this.viewing.set(lead);
  }

  onViewClosed(): void {
    this.viewing.set(null);
  }

  onDelete(lead: Lead): void {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    if (this.deletingId()) return;
    this.deletingId.set(lead.id);
    this.error.set(null);
    this.success.set(null);
    this.leadsService.deleteLead(lead.id).subscribe({
      next: () => {
        this.deletingId.set(null);
        this.success.set('Lead deleted successfully.');
        this.refresh();
        this.loadSummary();
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
      this.success.set('Lead saved successfully.');
      this.refresh();
      this.loadSummary();
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

  displayStatus(s: string): string {
    const map: Record<string, string> = {
      NEW: 'New',
      CONTACTED: 'Contacted',
      QUALIFIED: 'Qualified',
      PROPOSAL_SENT: 'Proposal Sent',
      WON: 'Won',
      LOST: 'Lost',
    };
    return map[s] || s;
  }

  displaySource(s: string): string {
    const map: Record<string, string> = {
      WEBSITE: 'Website',
      PHONE: 'Phone',
      WHATSAPP: 'WhatsApp',
      REFERRAL: 'Referral',
      SOCIAL_MEDIA: 'Social Media',
      OTHER: 'Other',
    };
    return map[s] || s;
  }

  statusClass(status: string): string {
    switch (status) {
      case 'WON':
        return 'bg-green-50 text-green-700 ring-green-200';
      case 'LOST':
        return 'bg-red-50 text-red-700 ring-red-200';
      case 'QUALIFIED':
        return 'bg-indigo-50 text-indigo-700 ring-indigo-200';
      case 'PROPOSAL_SENT':
        return 'bg-sky-50 text-sky-700 ring-sky-200';
      case 'CONTACTED':
        return 'bg-amber-50 text-amber-700 ring-amber-200';
      case 'NEW':
      default:
        return 'bg-slate-100 text-slate-700 ring-slate-200';
    }
  }

  statusDotClass(status: string): string {
    switch (status) {
      case 'WON':
        return 'bg-green-500';
      case 'LOST':
        return 'bg-red-500';
      case 'QUALIFIED':
        return 'bg-indigo-500';
      case 'PROPOSAL_SENT':
        return 'bg-sky-500';
      case 'CONTACTED':
        return 'bg-amber-500';
      case 'NEW':
      default:
        return 'bg-slate-400';
    }
  }

  displayAssigned(a: Lead['assignedTo']): string {
    return a?.name || '-';
  }

  displayDate(d: string | null): string {
    if (!d) return '-';
    try {
      const date = new Date(d);
      return date.toLocaleString();
    } catch {
      return d;
    }
  }

  trackById(id: string): string {
    return id;
  }
}
