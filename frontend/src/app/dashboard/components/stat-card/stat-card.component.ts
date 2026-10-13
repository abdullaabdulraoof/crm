import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { IconComponent, IconName } from '../../../layout/icon/icon.component';

export type StatTone = 'emerald' | 'indigo' | 'slate' | 'amber' | 'rose';

const ICON_TONE: Record<StatTone, string> = {
  emerald: 'bg-blue-600 text-white',
  indigo: 'bg-indigo-600 text-white',
  slate: 'bg-slate-700 text-slate-200',
  amber: 'bg-amber-600 text-white',
  rose: 'bg-rose-600 text-white',
};

@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div
      class="flex h-full min-h-24 flex-col justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-3.5"
    >
      <div class="flex min-w-0 items-center justify-between gap-2">
        <p class="truncate text-[11px] font-medium text-slate-500 sm:text-xs">{{ label() }}</p>
        <span
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          [class]="iconClasses()"
          aria-hidden="true"
        >
          <app-icon [name]="icon()" [size]="14" />
        </span>
      </div>
      <div class="min-w-0">
        <p class="truncate text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {{ value() }}
        </p>
        @if (hint()) {
          <p class="mt-0.5 truncate text-[10px] text-slate-400">{{ hint() }}</p>
        }
      </div>
    </div>
  `,
})
export class StatCardComponent {
  readonly label = input('');
  readonly value = input<string | number>('');
  readonly icon = input<IconName>('dashboard');
  readonly tone = input<StatTone>('slate');
  readonly hint = input('');

  readonly iconClasses = computed(() => ICON_TONE[this.tone()]);
}
