import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div class="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div class="min-w-0">
          <h2 class="truncate text-xs font-semibold text-slate-900 sm:text-sm">{{ title() }}</h2>
          @if (subtitle()) {
            <p class="mt-0.5 truncate text-[10px] text-slate-500 sm:text-[11px]">{{ subtitle() }}</p>
          }
        </div>
        <ng-content select="[panelAction]" />
      </div>
      <div class="min-h-0 flex-1 p-3 sm:p-3.5">
        <ng-content />
      </div>
    </section>
  `,
})
export class PanelComponent {
  readonly title = input('');
  readonly subtitle = input('');
}
