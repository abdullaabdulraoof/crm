import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';

import { ReportsService } from '../services/reports.service';
import { MethodTotal, ReportBar, ReportData, ReportKey, REPORT_TABS } from '../reports.types';

interface MethodRow {
  key: string;
  label: string;
  count: number;
  total: number;
}

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reports-page.component.html',
})
export class ReportsPageComponent implements OnInit {
  private readonly reportsService = inject(ReportsService);

  readonly tabs = REPORT_TABS;
  readonly active = signal<ReportKey>('leads');
  readonly from = signal('');
  readonly to = signal('');

  readonly report = signal<ReportData | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly statusBars = computed(() => this.toBars(this.report()?.byStatus));
  readonly sourceBars = computed(() => this.toBars(this.report()?.bySource));
  readonly methodRows = computed<MethodRow[]>(() =>
    Object.entries(this.report()?.byMethod ?? {}).map(([key, value]: [string, MethodTotal]) => ({
      key,
      label: this.label(key),
      count: value.count,
      total: value.total,
    }))
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.reportsService
      .getReport(this.active(), { from: this.from() || undefined, to: this.to() || undefined })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.report.set(res.data);
        },
        error: (err: HttpErrorResponse) => {
          this.loading.set(false);
          this.error.set(this.friendly(err));
        },
      });
  }

  onTab(key: ReportKey): void {
    if (this.active() === key) return;
    this.active.set(key);
    this.load();
  }

  onDateChange(key: 'from' | 'to', value: string): void {
    if (key === 'from') this.from.set(value);
    else this.to.set(value);
  }

  clearRange(): void {
    this.from.set('');
    this.to.set('');
    this.load();
  }

  hasRange(): boolean {
    return !!(this.from() || this.to());
  }

  rangeLabel(): string {
    const r = this.report();
    if (!r || (!r.range.from && !r.range.to)) return 'All time';
    const from = r.range.from ? this.formatDate(r.range.from) : 'start';
    const to = r.range.to ? this.formatDate(r.range.to) : 'now';
    return `${from} \u2192 ${to}`;
  }

  private friendly(err: HttpErrorResponse): string {
    const status = err?.status ?? 0;
    if (status === 0) return 'Unable to reach the server. Please check your connection and try again.';
    if (status === 401) return 'Unauthorized. Please login again.';
    if (status === 403) return 'You do not have permission to perform this action.';
    if (status === 400) return err?.error?.error?.message || 'Invalid date range.';
    if (status >= 500) return 'Something went wrong. Please try again.';
    return err?.error?.error?.message || 'Something went wrong. Please try again.';
  }

  private label(key: string): string {
    return key
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  }

  private toBars(map: Record<string, number> | undefined): ReportBar[] {
    const entries = Object.entries(map ?? {});
    const max = Math.max(1, ...entries.map(([, value]) => value));
    return entries.map(([key, value]) => ({
      key,
      label: this.label(key),
      value,
      width: `${Math.round((value / max) * 100)}%`,
    }));
  }

  displayAmount(value: number | undefined): string {
    return typeof value === 'number' ? value.toLocaleString() : '0';
  }

  formatDate(iso: string | null): string {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
  }
}
