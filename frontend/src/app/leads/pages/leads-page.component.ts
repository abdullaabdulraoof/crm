import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import { LeadsService } from '../services/leads.service';
import { Lead, LeadSource, LeadStatus } from '../leads.types';
import { LeadFormComponent } from '../components/lead-form.component';
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

@Component({
  selector: 'app-leads-page',
  standalone: true,
  imports: [CommonModule, LeadFormComponent],
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
  readonly limit = 10;
  readonly totalPages = signal(1);
  readonly total = signal(0);
  readonly filters = signal<Filters>({ ...EMPTY_FILTERS });
  readonly assignees = signal<AssignedUserOption[]>([]);
  readonly showForm = signal(false);
  readonly editing = signal<Lead | null>(null);
  readonly deletingId = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  readonly canDelete = signal(false);

  ngOnInit(): void {
    this.updatePermissions();
    this.loadAssignees();
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

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    const f = this.filters();
    this.leadsService
      .getLeads({
        page: this.page(),
        limit: this.limit,
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
    const f = this.filters();
    return !!(f.search || f.status || f.source || f.assignedTo || f.from || f.to);
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

  displayAssigned(a: Lead['assignedTo']): string {
    return a?.name || '-';
  }

  displayDate(d: string | null): string {
    if (!d) return '-';
    try {
      const date = new Date(d);
      // Simple ISO-like display; keep consistent with simple UI
      return date.toLocaleString();
    } catch {
      return d;
    }
  }

  trackById(id: string): string {
    return id;
  }
}
