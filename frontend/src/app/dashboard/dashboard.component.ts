import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule, TitleCasePipe, UpperCasePipe, SlicePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { DashboardService } from './services/dashboard.service';
import { ChartBar, DashboardSummary, RecentQuotation, RecentFollowUp } from './dashboard.types';
import { IconComponent } from '../layout/icon/icon.component';

type Pipeline = 'leads' | 'quotations' | 'payments';

const PIPELINE_TABS: ReadonlyArray<{ key: Pipeline; label: string }> = [
  { key: 'leads', label: 'Leads' },
  { key: 'quotations', label: 'Quotations' },
  { key: 'payments', label: 'Payments' },
];

const DONUT_COLORS = ['#648BFF', '#FFA07A', '#FED766', '#77DD77', '#FF6B81', '#92929D'];
const CIRCUMFERENCE = 251.327; // 2 * PI * 40

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  percent: number;
  color: string;
  dashArray: string;
  dashOffset: number;
}

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TitleCasePipe, UpperCasePipe, SlicePipe, IconComponent],
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
  private readonly paymentBars = computed(() => {
    const monthly = this.summary()?.monthlyPayments ?? [];
    const max = monthly.reduce((peak, m) => Math.max(peak, m.total), 0);
    return monthly.map((m) => ({
      key: m.month,
      label: m.month,
      value: m.total,
      width: `${max > 0 ? Math.round((m.total / max) * 100) : 0}%`,
    }));
  });

  readonly pipelineBars = computed(() => {
    if (this.pipeline() === 'quotations') return this.quotationBars();
    if (this.pipeline() === 'payments') return this.paymentBars();
    return this.leadsBars();
  });

  /** The bar with the highest value (used to show tooltip + active style) */
  readonly topBarKey = computed(() => {
    const bars = this.pipelineBars();
    if (!bars.length) return '';
    return bars.reduce((top, b) => (b.value > top.value ? b : top), bars[0]).key;
  });

  /** Y-axis tick labels derived from bar data */
  readonly chartYTicks = computed(() => {
    const bars = this.pipelineBars();
    const max = bars.reduce((m, b) => Math.max(m, b.value), 0);
    if (!max) return ['0', '0', '0'];
    const half = Math.round(max / 2);
    const format = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v));
    return [format(max), format(half), '0'];
  });

  /** Donut chart data for Quotations/Leads distribution */
  readonly donutSlices = computed<DonutSlice[]>(() => {
    const statusData = this.summary()?.quotationsByStatus ?? this.summary()?.leadsByStatus ?? {};
    const entries = Object.entries(statusData).filter(([, v]) => v > 0);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);
    if (total === 0) return [];

    let accumulatedPercent = 0;
    return entries.slice(0, 5).map(([key, value], idx) => {
      const percent = Math.round((value / total) * 100);
      const dashLength = (percent / 100) * CIRCUMFERENCE;
      const dashOffset = -(accumulatedPercent / 100) * CIRCUMFERENCE;
      accumulatedPercent += percent;

      return {
        key,
        label: this.humanize(key),
        value,
        percent,
        color: DONUT_COLORS[idx % DONUT_COLORS.length],
        dashArray: `${dashLength} ${CIRCUMFERENCE}`,
        dashOffset,
      };
    });
  });

  readonly donutTotal = computed(() => {
    return this.donutSlices().reduce((sum, s) => sum + s.value, 0);
  });

  /** Label for current month range */
  readonly currentMonthLabel = computed(() => {
    const key = this.summary()?.month?.key;
    if (!key) {
      const now = new Date();
      return now.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    }
    try {
      const d = new Date(`${key}-01`);
      return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
    } catch {
      return key;
    }
  });

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

  isTopBar(bar: ChartBar): boolean {
    return bar.key === this.topBarKey();
  }

  statusPillClass(status: string): string {
    const s = (status || '').toUpperCase();
    if (['PAID', 'WON', 'ACCEPTED', 'COMPLETED', 'RECORDED'].includes(s)) return 'crm-status-pill status-green';
    if (['OVERDUE', 'REJECTED', 'LOST', 'CANCELLED'].includes(s)) return 'crm-status-pill status-red';
    if (['PENDING', 'DRAFT', 'ON_HOLD'].includes(s)) return 'crm-status-pill status-amber';
    if (['ISSUED', 'SENT', 'NEW', 'CONTACTED', 'QUALIFIED'].includes(s)) return 'crm-status-pill status-blue';
    return 'crm-status-pill status-muted';
  }

  private friendly(err: HttpErrorResponse): string {
    const status = err?.status ?? 0;
    if (status === 0) return 'Unable to reach the server. Please check your connection.';
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
    if (typeof value !== 'number') return '0';
    return value.toLocaleString();
  }

  formatDate(iso: string | null): string {
    if (!iso) return '-';
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? '-'
      : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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
