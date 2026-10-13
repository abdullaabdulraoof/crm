import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// Single source of truth for status colours. Emerald is the positive tone
// (the dashboard accent); everything else follows the existing app mapping.
const TONE_BY_STATUS: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  WON: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ACCEPTED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  RECORDED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  OVERDUE: 'bg-red-50 text-red-700 ring-red-200',
  REJECTED: 'bg-red-50 text-red-700 ring-red-200',
  LOST: 'bg-red-50 text-red-700 ring-red-200',
  CANCELLED: 'bg-red-50 text-red-700 ring-red-200',
  PARTIALLY_PAID: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  ISSUED: 'bg-blue-50 text-blue-700 ring-blue-200',
  SENT: 'bg-blue-50 text-blue-700 ring-blue-200',
  PROPOSAL_SENT: 'bg-blue-50 text-blue-700 ring-blue-200',
  CONTACTED: 'bg-blue-50 text-blue-700 ring-blue-200',
  QUALIFIED: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  DRAFT: 'bg-slate-100 text-slate-600 ring-slate-200',
  NEW: 'bg-sky-50 text-sky-700 ring-sky-200',
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const DEFAULT_TONE = 'bg-slate-100 text-slate-600 ring-slate-200';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset"
      [class]="tone()"
    >
      {{ label() }}
    </span>
  `,
})
export class StatusBadgeComponent {
  readonly status = input<string>('');

  readonly label = computed(() => {
    const value = (this.status() || '').trim();
    if (!value) return '-';
    return value
      .split('_')
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(' ');
  });

  readonly tone = computed(() => TONE_BY_STATUS[this.status()] ?? DEFAULT_TONE);
}
