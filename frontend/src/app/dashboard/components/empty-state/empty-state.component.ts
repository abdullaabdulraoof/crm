import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent, IconName } from '../../../layout/icon/icon.component';

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <span class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <app-icon [name]="icon()" [size]="20" />
      </span>
      <p class="text-sm text-slate-500">{{ message() }}</p>
    </div>
  `,
})
export class EmptyStateComponent {
  readonly message = input('Nothing here yet.');
  readonly icon = input<IconName>('empty');
}
