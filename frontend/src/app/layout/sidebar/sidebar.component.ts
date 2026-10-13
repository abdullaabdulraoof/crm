import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { IconComponent } from '../icon/icon.component';
import { NAV_GROUPS } from '../nav-items';

@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [RouterLink, RouterLinkActive, IconComponent],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent {
  readonly collapsed = input(false);
  readonly mobileOpen = input(false);
  readonly toggleCollapse = output<void>();
  readonly closeMobile = output<void>();

  readonly groups = NAV_GROUPS;
}
