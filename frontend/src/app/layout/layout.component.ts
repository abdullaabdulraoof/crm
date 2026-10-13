import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  effect,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { NavbarComponent } from './navbar/navbar.component';
import { SidebarComponent } from './sidebar/sidebar.component';

@Component({
  selector: 'app-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SidebarComponent, NavbarComponent],
  templateUrl: './layout.component.html',
})
export class LayoutComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly collapsed = signal(false);
  readonly mobileOpen = signal(false);
  readonly title = signal('Dashboard');

  constructor() {
    this.updateTitle();
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.updateTitle();
        this.mobileOpen.set(false);
      });

    // Prevent the page behind the mobile drawer from scrolling while it is open.
    effect(() => {
      document.body.style.overflow = this.mobileOpen() ? 'hidden' : '';
    });
  }

  toggleCollapse(): void {
    this.collapsed.update((value) => !value);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mobileOpen()) {
      this.mobileOpen.set(false);
    }
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  private updateTitle(): void {
    // Walk the fully-populated snapshot tree rather than the ActivatedRoute tree:
    // during activation the LayoutComponent is constructed before its child
    // routes have a snapshot assigned, so `ActivatedRoute.snapshot` can be
    // undefined here. RouterStateSnapshot.root is ready up-front.
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    this.title.set((route.data?.['title'] as string | undefined) ?? 'Dashboard');
  }
}
