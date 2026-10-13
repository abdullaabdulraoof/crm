import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { IconComponent } from '../layout/icon/icon.component';
import { DashboardService } from './services/dashboard.service';
import { ChartBar, DashboardSummary, RecentQuotation } from './dashboard.types';
import { StatCardComponent } from './components/stat-card/stat-card.component';
import { PanelComponent } from './components/panel/panel.component';
import { StatusBadgeComponent } from './components/status-badge/status-badge.component';
import { BarListComponent, BarTone } from './components/bar-list/bar-list.component';
import { EmptyStateComponent } from './components/empty-state/empty-state.component';

type Pipeline = 'leads' | 'quotations';

const PIPELINE_TABS: ReadonlyArray<{ key: Pipeline; label: string }> = [
  { key: 'leads', label: 'Leads' },
  { key: 'quotations', label: 'Quotations' },
];

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterLink,
    StatCardComponent,
    PanelComponent,
    StatusBadgeComponent,
    BarListComponent,
    EmptyStateComponent,
    IconComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class Dashboard implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly auth = inject(AuthService);

  readonly summary = signal<DashboardSummary | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly pipeline = signal<Pipeline>('leads');
  readonly pipelineTabs = PIPELINE_TABS;

  readonly userName = computed(() => this.auth.user()?.name || '');

  private readonly leadsBars = computed(() => this.toBars(this.summary()?.leadsByStatus));
  private readonly quotationBars = computed(() =>
    this.toBars(this.summary()?.quotationsByStatus)
  );

  readonly pipelineBars = computed(() =>
    this.pipeline() === 'quotations' ? this.quotationBars() : this.leadsBars()
  );

  readonly pipelineTone = computed<BarTone>(() =>
    this.pipeline() === 'quotations' ? 'indigo' : 'emerald'
  );

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.error.set(null);
    this.dashboardService.getSummary().subscribe({
      next: (res) => {
        this.loading.set(false);
        this.summary.set(res.data);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(this.friendly(err));
      },
    });
  }

  setPipeline(pipeline: Pipeline): void {
    this.pipeline.set(pipeline);
  }

  private friendly(err: HttpErrorResponse): string {
    const status = err?.status ?? 0;
    if (status === 0) {
      return 'Unable to reach the server. Please check your connection and try again.';
    }
    if (status === 401) return 'Unauthorized. Please login again.';
    if (status === 403) return 'You do not have permission to perform this action.';
    if (status >= 500) return 'Something went wrong. Please try again.';
    return err?.error?.error?.message || 'Something went wrong. Please try again.';
  }

  private humanize(key: string): string {
    return key
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  }

  private toBars(counts: Record<string, number> | undefined): ChartBar[] {
    const entries = Object.entries(counts ?? {});
    const max = entries.reduce((peak, [, value]) => Math.max(peak, value), 0);
    return entries.map(([key, value]) => ({
      key,
      label: this.humanize(key),
      value,
      width: `${max > 0 ? Math.round((value / max) * 100) : 0}%`,
    }));
  }

  customerName(quotation: RecentQuotation): string {
    return quotation.client?.name || quotation.lead?.name || quotation.targetName || '-';
  }

  displayAmount(value: number | undefined | null): string {
    return typeof value === 'number' ? value.toLocaleString() : '-';
  }

  formatDate(iso: string | null): string {
    if (!iso) return '-';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
  }

  formatDateTime(iso: string | null): string {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  isOverdue(iso: string | null): boolean {
    if (!iso) return false;
    const date = new Date(iso);
    return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
  }

  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }
}
