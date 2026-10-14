import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../auth/auth.service';
import { IconComponent } from '../icon/icon.component';

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  SALES: 'Sales',
};

@Component({
  selector: 'app-navbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  templateUrl: './navbar.component.html',
})
export class NavbarComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly title = input('Dashboard');
  readonly toggleMenu = output<void>();

  readonly user = this.auth.user;
  readonly menuOpen = signal(false);

  // Logout confirmation. `loggingOut` is a one-way latch so the dialog cannot
  // be reopened and logout cannot run twice once it has started.
  readonly confirmingLogout = signal(false);
  readonly loggingOut = signal(false);

  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('logoutCancel');
  private readonly userMenuButton = viewChild<ElementRef<HTMLButtonElement>>('userMenuButton');
  private readonly restoreFocus = signal(false);

  constructor() {
    effect(() => {
      if (this.confirmingLogout()) {
        // Focus the safe option so a stray Enter never confirms a logout.
        this.cancelButton()?.nativeElement.focus();
      } else if (this.restoreFocus()) {
        this.restoreFocus.set(false);
        this.userMenuButton()?.nativeElement.focus();
      }
    });
  }

  readonly initials = computed(() => {
    const name = this.user()?.name?.trim();
    if (!name) return '?';
    const parts = name.split(/\s+/).slice(0, 2);
    return parts.map((part) => part.charAt(0).toUpperCase()).join('');
  });

  readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    if (!role) return '';
    return ROLE_LABELS[role] ?? role;
  });

  readonly todayFormatted = computed(() => {
    const d = new Date();
    const dayName = d.toLocaleDateString('en-GB', { weekday: 'short' });
    const dayNum = d.getDate();
    const monthName = d.toLocaleDateString('en-GB', { month: 'short' });
    return `Today, ${dayName} ${dayNum} ${monthName}`;
  });

  toggleUserMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) return;
    const target = event.target as HTMLElement | null;
    if (target && !target.closest('[data-user-menu]')) {
      this.menuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.confirmingLogout()) {
      this.cancelLogout();
      return;
    }
    this.menuOpen.set(false);
  }

  requestLogout(): void {
    if (this.loggingOut() || this.confirmingLogout()) return;
    this.menuOpen.set(false);
    this.confirmingLogout.set(true);
  }

  cancelLogout(): void {
    if (this.loggingOut()) return;
    this.confirmingLogout.set(false);
    this.restoreFocus.set(true);
  }

  confirmLogout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.confirmingLogout.set(false);
    this.logout();
  }

  logout(): void {
    this.menuOpen.set(false);
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
