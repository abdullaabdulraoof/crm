import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';

import { FollowUpsService } from '../services/follow-ups.service';
import { FollowUp, FollowUpStatus } from '../follow-ups.types';
import { FollowUpFormComponent } from '../components/follow-up-form.component';
import { UsersService } from '../../users/users.service';
import { AssignedUserOption } from '../../users/users.types';
import { AuthService } from '../../auth/auth.service';

interface Filters {
  search: string;
  status: string;
  type: string;
  assignedTo: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { search: '', status: '', type: '', assignedTo: '', from: '', to: '' };

@Component({
  selector: 'app-follow-ups-page',
  standalone: true,
  imports: [CommonModule, FollowUpFormComponent],
  templateUrl: './follow-ups-page.component.html',
})
export class FollowUpsPageComponent implements OnInit {
  private readonly followUpsService = inject(FollowUpsService);
  private readonly usersService = inject(UsersService);
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);

  readonly followUps = signal<FollowUp[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly page = signal(1);
  readonly limit = 10;
  readonly totalPages = signal(1);
  readonly total = signal(0);
  readonly filters = signal<Filters>({ ...EMPTY_FILTERS });
  readonly users = signal<AssignedUserOption[]>([]);
  readonly showForm = signal(false);
  readonly editing = signal<FollowUp | null>(null);
  readonly presetLeadId = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);

  readonly canDelete = signal(false);

  ngOnInit(): void {
    this.updatePermissions();
    this.loadUsers();
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
    this.usersService.getAssignedToOptions().subscribe({
      next: (list) => this.users.set(list),
      error: () => this.users.set([]),
    });
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    const f = this.filters();
    this.followUpsService
      .getFollowUps({
        page: this.page(),
        limit: this.limit,
        search: f.search || undefined,
        status: f.status || undefined,
        type: f.type || undefined,
        assignedTo: f.assignedTo || undefined,
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
    const f = this.filters();
    return !!(f.search || f.status || f.type || f.assignedTo || f.from || f.to);
  }

  onAdd(): void {
    this.editing.set(null);
    this.showForm.set(true);
    this.error.set(null);
    this.success.set(null);
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
      },
      error: (err: HttpErrorResponse) => {
        this.busyId.set(null);
        this.error.set(this.friendly(err));
      },
    });
  }

  onDelete(followup: FollowUp): void {
    if (!confirm('Are you sure you want to delete this follow-up?\n\nCancel = keep, Delete = remove')) return;
    if (this.busyId()) return;
    this.busyId.set(followup.id);
    this.error.set(null);
    this.success.set(null);
    this.followUpsService.deleteFollowUp(followup.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.success.set('Follow-up deleted successfully.');
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
    this.presetLeadId.set(null);
    if (saved) {
      this.success.set('Follow-up saved successfully.');
      this.refresh();
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

  relatedTo(f: FollowUp): string {
    const target = f.lead || f.client;
    if (target && typeof target === 'object') return target.name;
    if (typeof target === 'string') return '-';
    return '-';
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

  statusClass(s: string): string {
    const map: Record<string, string> = {
      PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
      COMPLETED: 'bg-green-50 text-green-700 ring-green-200',
      CANCELLED: 'bg-gray-100 text-gray-600 ring-gray-200',
    };
    return map[s] || 'bg-gray-100 text-gray-600 ring-gray-200';
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
