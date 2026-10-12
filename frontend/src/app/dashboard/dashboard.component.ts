import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { DashboardService } from './services/dashboard.service';
import { ChartBar, DashboardSummary, MonthlyPayment } from './dashboard.types';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
})
export class Dashboard implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly dashboardService = inject(DashboardService);

  readonly summary = signal<DashboardSummary | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly leadsBars = computed(() => this.toBars(this.summary()?.leadsByStatus));
  readonly quotationBars = computed(() => this.toBars(this.summary()?.quotationsByStatus));
  readonly invoiceBars = computed(() => this.toBars(this.summary()?.invoiceStatus));
  readonly paymentBars = computed(() => this.toMonthlyBars(this.summary()?.monthlyPayments ?? []));

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

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  private friendly(err: HttpErrorResponse): string {
    const status = err?.status ?? 0;
    if (status === 0) return 'Unable to reach the server. Please check your connection and try again.';
    if (status === 401) return 'Unauthorized. Please login again.';
    if (status === 403) return 'You do not have permission to perform this action.';
    if (status >= 500) return 'Something went wrong. Please try again.';
    return err?.error?.error?.message || 'Something went wrong. Please try again.';
  }

  private label(key: string): string {
    return key
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  }

  private toBars(map: Record<string, number> | undefined): ChartBar[] {
    const entries = Object.entries(map ?? {});
    const max = Math.max(1, ...entries.map(([, value]) => value));
    return entries.map(([key, value]) => ({
      key,
      label: this.label(key),
      value,
      width: `${Math.round((value / max) * 100)}%`,
    }));
  }

  private toMonthlyBars(months: MonthlyPayment[]): ChartBar[] {
    const max = Math.max(1, ...months.map((m) => m.total));
    return months.map((m) => ({
      key: m.month,
      label: this.formatMonth(m.month),
      value: m.total,
      width: `${Math.round((m.total / max) * 100)}%`,
    }));
  }

  formatMonth(key: string): string {
    const [year, month] = key.split('-').map(Number);
    if (!year || !month) return key;
    const d = new Date(Date.UTC(year, month - 1, 1));
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
  }

  displayAmount(value: number): string {
    return typeof value === 'number' ? value.toLocaleString() : String(value);
  }

  formatDate(iso: string | null): string {
    if (!iso) return '-';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
  }

  statusClass(status: string): string {
    switch (status) {
      case 'PAID':
      case 'WON':
      case 'ACCEPTED':
      case 'COMPLETED':
        return 'bg-green-50 text-green-700 ring-green-200';
      case 'OVERDUE':
      case 'REJECTED':
      case 'LOST':
      case 'CANCELLED':
        return 'bg-red-50 text-red-700 ring-red-200';
      case 'PARTIALLY_PAID':
        return 'bg-indigo-50 text-indigo-700 ring-indigo-200';
      case 'ISSUED':
      case 'SENT':
      case 'PROPOSAL_SENT':
        return 'bg-blue-50 text-blue-700 ring-blue-200';
      default:
        return 'bg-amber-50 text-amber-700 ring-amber-200';
    }
  }

  trackById(id: string): string {
    return id;
  }
}
