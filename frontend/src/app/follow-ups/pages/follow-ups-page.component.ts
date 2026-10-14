import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';

import { FollowUpsService } from '../services/follow-ups.service';
import {
  FollowUp,
  FollowUpStatus,
  FollowUpSummary,
  FollowUpType,
} from '../follow-ups.types';
import { FollowUpFormComponent } from '../components/follow-up-form.component';
import { FollowUpViewComponent } from '../components/follow-up-view.component';
import { IconComponent } from '../../layout/icon/icon.component';
import { UsersService } from '../../users/users.service';
import { AssignedUserOption } from '../../users/users.types';
import { LeadsService } from '../../leads/services/leads.service';
import { Lead } from '../../leads/leads.types';
import { ClientsService } from '../../clients/clients.service';
import { ClientOption } from '../../clients/clients.types';
import { AuthService } from '../../auth/auth.service';

interface Filters {
  search: string;
  status: string;
  type: string;
  assignedTo: string;
  leadId: string;
  clientId: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  search: '',
  status: '',
  type: '',
  assignedTo: '',
  leadId: '',
  clientId: '',
  from: '',
  to: '',
};

const STATUS_OPTIONS: { value: FollowUpStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const TYPE_OPTIONS: { value: FollowUpType; label: string }[] = [
  { value: 'CALL', label: 'Call' },
  { value: 'MEETING', label: 'Meeting' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'OTHER', label: 'Other' },
];

const PAGE_SIZES = [10, 25, 50, 100];

@Component({
  selector: 'app-follow-ups-page',
  standalone: true,
  imports: [CommonModule, FollowUpFormComponent, FollowUpViewComponent, IconComponent],
  templateUrl: './follow-ups-page.component.html',
})
export class FollowUpsPageComponent implements OnInit {
  private readonly followUpsService = inject(FollowUpsService);
  private readonly usersService = inject(UsersService);
  private readonly leadsService = inject(LeadsService);
  private readonly clientsService = inject(ClientsService);
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);

  readonly followUps = signal<FollowUp[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly page = signal(1);
  readonly limit = signal(10);
  readonly totalPages = signal(1);
  readonly total = signal(0);
  readonly filters = signal<Filters>({ ...EMPTY_FILTERS });
  readonly users = signal<AssignedUserOption[]>([]);
  readonly leads = signal<Lead[]>([]);
  readonly clients = signal<ClientOption[]>([]);
  readonly showForm = signal(false);
  readonly editing = signal<FollowUp | null>(null);
  readonly viewing = signal<FollowUp | null>(null);
  readonly presetLeadId = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);
  readonly summary = signal<FollowUpSummary | null>(null);
  readonly summaryLoading = signal(false);
  readonly summaryError = signal(false);

  readonly canDelete = signal(false);

  readonly statusOptions = STATUS_OPTIONS;
  readonly typeOptions = TYPE_OPTIONS;
  readonly pageSizes = PAGE_SIZES;

  readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.limit() + 1
  );
  readonly rangeEnd = computed(() => Math.min(this.page() * this.limit(), this.total()));

  readonly showFilters = signal(false);
  readonly selectedFollowUpIds = signal<Set<string>>(new Set());

  readonly activeChips = computed(() => {
    const f = this.filters();
    const chips: { key: keyof Filters; label: string; value: string }[] = [];
    if (f.search) chips.push({ key: 'search', label: 'Search', value: f.search });
    if (f.status) chips.push({ key: 'status', label: 'Status', value: this.displayStatus(f.status) });
    if (f.type) chips.push({ key: 'type', label: 'Type', value: this.displayType(f.type) });
    if (f.assignedTo) {
      const u = this.users().find((x) => x.id === f.assignedTo);
      chips.push({ key: 'assignedTo', label: 'Assigned', value: u?.name || f.assignedTo });
    }
    if (f.from) chips.push({ key: 'from', label: 'From', value: f.from });
    if (f.to) chips.push({ key: 'to', label: 'To', value: f.to });
    return chips;
  });

  removeFilter(key: keyof Filters): void {
    this.filters.update((f) => ({ ...f, [key]: '' }));
    this.page.set(1);
    this.refresh();
  }

  toggleSelectAll(checked: boolean): void {
    if (checked) {
      this.selectedFollowUpIds.set(new Set(this.followUps().map((f) => f.id)));
    } else {
      this.selectedFollowUpIds.set(new Set());
    }
  }

  toggleSelectFollowUp(id: string): void {
    this.selectedFollowUpIds.update((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  isFollowUpSelected(id: string): boolean {
    return this.selectedFollowUpIds().has(id);
  }

  isAllSelected(): boolean {
    const list = this.followUps();
    return list.length > 0 && list.every((f) => this.selectedFollowUpIds().has(f.id));
  }

  ngOnInit(): void {
    this.updatePermissions();
    this.loadUsers();
    this.loadTargets();
    this.loadSummary();
    const leadId = this.route.snapshot.queryParamMap.get('leadId');
    if (leadId) this.presetLeadId.set(leadId);
    this.refresh();
  }

  private updatePermissions(): void {
    const role = this.auth.user()?.role;
    // Backend: FOLLOWUP_DELETE_ROLES = [OWNER, ADMIN]
    this.canDelete.set(role === 'OWNER' || role === 'ADMIN');
  }

  private loadUsers(): void {
    // Picker failure must not block the list; the filter simply has no options.
    this.usersService.getAssignedToOptions().subscribe({
      next: (list) => this.users.set(list || []),
      error: () => this.users.set([]),
    });
  }

  private loadTargets(): void {
    this.leadsService.getLeads({ limit: 100 }).subscribe({
      next: (res) => this.leads.set(res.data || []),
      error: () => this.leads.set([]),
    });
    this.clientsService.getClients().subscribe({
      next: (list) => this.clients.set(list || []),
      error: () => this.clients.set([]),
    });
  }

  loadSummary(): void {
    this.summaryLoading.set(true);
    this.summaryError.set(false);
    this.followUpsService.getFollowUpSummary().subscribe({
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
    this.followUpsService
      .getFollowUps({
        page: this.page(),
        limit: this.limit(),
        search: f.search || undefined,
        status: f.status || undefined,
        type: f.type || undefined,
        assignedTo: f.assignedTo || undefined,
        leadId: f.leadId || undefined,
        clientId: f.clientId || undefined,
        from: f.from || undefined,
        to: f.to || undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.followUps.set(res.data || []);
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
    if (status === 404) return 'Follow-up not found.';
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

  activeFilterCount(): number {
    const f = this.filters();
    return [f.search, f.status, f.type, f.assignedTo, f.leadId, f.clientId, f.from, f.to].filter(
      (value) => !!value
    ).length;
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

  onView(followup: FollowUp): void {
    this.viewing.set(followup);
  }

  onViewClosed(): void {
    this.viewing.set(null);
  }

  onEdit(followup: FollowUp): void {
    if (this.busyId()) return;
    this.busyId.set(followup.id);
    this.error.set(null);
    this.success.set(null);
    this.followUpsService.getFollowUp(followup.id).subscribe({
      next: (res) => {
        this.busyId.set(null);
        this.editing.set(res.data.followup);
        this.showForm.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        this.error.set(this.friendly(err));
      },
    });
  }

  onComplete(followup: FollowUp): void {
    if (!confirm('Mark this follow-up as completed?')) return;
    this.changeStatus(followup, 'COMPLETED');
  }

  onCancel(followup: FollowUp): void {
    if (!confirm('Cancel this follow-up?')) return;
    this.changeStatus(followup, 'CANCELLED');
  }

  private changeStatus(followup: FollowUp, status: FollowUpStatus): void {
    if (this.busyId()) return;
    this.busyId.set(followup.id);
    this.error.set(null);
    this.success.set(null);
    this.followUpsService.updateFollowUp(followup.id, { status }).subscribe({
      next: () => {
        this.busyId.set(null);
        this.success.set(
          status === 'COMPLETED'
            ? 'Follow-up marked as completed.'
            : 'Follow-up cancelled.'
        );
        this.refresh();
        this.loadSummary();
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        this.error.set(this.friendly(err));
      },
    });
  }

  onDelete(followup: FollowUp): void {
    if (!confirm('Are you sure you want to delete this follow-up?')) return;
    if (this.busyId()) return;
    this.busyId.set(followup.id);
    this.error.set(null);
    this.success.set(null);
    this.followUpsService.deleteFollowUp(followup.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.success.set('Follow-up deleted successfully.');
        this.refresh();
        this.loadSummary();
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
    this.presetLeadId.set(null);
    if (saved) {
      this.success.set('Follow-up saved successfully.');
      this.refresh();
      this.loadSummary();
    }
  }

  onFormCancelled(): void {
    this.showForm.set(false);
    this.editing.set(null);
    this.presetLeadId.set(null);
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

  isOverdue(f: FollowUp): boolean {
    if (f.status !== 'PENDING' || !f.dueAt) return false;
    const due = new Date(f.dueAt).getTime();
    return !Number.isNaN(due) && due < Date.now();
  }

  statusLabel(f: FollowUp): string {
    return this.isOverdue(f) ? 'Overdue' : this.displayStatus(f.status);
  }

  relatedTo(f: FollowUp): string {
    const target = f.lead || f.client;
    if (target && typeof target === 'object') return target.name;
    return '-';
  }

  relatedKind(f: FollowUp): string {
    if (f.lead && typeof f.lead === 'object') return 'Lead';
    if (f.client && typeof f.client === 'object') return 'Client';
    return '';
  }

  displayType(t: string): string {
    const map: Record<string, string> = {
      CALL: 'Call',
      MEETING: 'Meeting',
      EMAIL: 'Email',
      WHATSAPP: 'WhatsApp',
      OTHER: 'Other',
    };
    return map[t] || t;
  }

  displayStatus(s: string): string {
    const map: Record<string, string> = {
      PENDING: 'Pending',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
    };
    return map[s] || s;
  }

  statusClass(f: FollowUp): string {
    if (this.isOverdue(f)) return 'crm-status-pill status-red';
    const map: Record<string, string> = {
      PENDING: 'crm-status-pill status-amber',
      COMPLETED: 'crm-status-pill status-green',
      CANCELLED: 'crm-status-pill status-muted',
    };
    return map[f.status] || 'crm-status-pill status-muted';
  }

  statusDotClass(f: FollowUp): string {
    if (this.isOverdue(f)) return 'bg-red-500';
    const map: Record<string, string> = {
      PENDING: 'bg-amber-500',
      COMPLETED: 'bg-green-500',
      CANCELLED: 'bg-slate-400',
    };
    return map[f.status] || 'bg-slate-400';
  }

  assignedName(f: FollowUp): string {
    const user = f.assignedTo;
    if (user && typeof user === 'object') return user.name;
    return '-';
  }

  displayDate(d: string | null): string {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  }

  trackById(id: string): string {
    return id;
  }
}