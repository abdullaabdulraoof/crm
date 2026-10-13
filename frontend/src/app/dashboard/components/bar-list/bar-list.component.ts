import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { ChartBar } from '../../dashboard.types';

export type BarTone = 'emerald' | 'indigo' | 'blue' | 'slate';

const FILL_TONE: Record<BarTone, string> = {
  emerald: 'bg-blue-500',
  indigo: 'bg-blue-400',
  blue: 'bg-blue-600',
  slate: 'bg-blue-300',
};

@Component({
  selector: 'app-bar-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="space-y-2">
      @for (bar of bars(); track bar.key) {
      <li class="flex items-center gap-2.5">
        <span class="w-24 shrink-0 truncate text-[11px] font-medium text-slate-600 sm:w-28">
            {{ bar.label }}
          </span>
        <span class="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span
              class="block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
              [class]="fillClasses()"
              [style.width]="bar.width"
            ></span>
          </span>
          <span class="w-8 shrink-0 text-right text-[11px] font-semibold text-slate-700">
            {{ bar.value }}
          </span>
        </li>
      }
    </ul>
  `,
})
export class BarListComponent {
  readonly bars = input<ChartBar[]>([]);
  readonly tone = input<BarTone>('emerald');

  readonly fillClasses = computed(() => FILL_TONE[this.tone()]);
}
