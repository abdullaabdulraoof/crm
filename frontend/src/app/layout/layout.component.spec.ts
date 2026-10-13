import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Routes, Router, RouterOutlet, provideRouter } from '@angular/router';

import { LayoutComponent } from './layout.component';

@Component({ standalone: true, template: '' })
class DummyPageComponent {}

@Component({
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
})
class HostComponent {}

const ROUTES: Routes = [
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: 'dashboard', component: DummyPageComponent, data: { title: 'Dashboard' } },
      { path: 'leads', component: DummyPageComponent, data: { title: 'Leads' } },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
];

describe('LayoutComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideRouter(ROUTES), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  function layout(): LayoutComponent {
    const debugEl = fixture.debugElement.query(By.directive(LayoutComponent));
    return debugEl.componentInstance as LayoutComponent;
  }

  it('derives the title from the deepest child snapshot without throwing', async () => {
    await router.navigateByUrl('/leads');
    fixture.detectChanges();

    expect(layout().title()).toBe('Leads');
  });

  it('updates the title when navigating between children', async () => {
    await router.navigateByUrl('/dashboard');
    fixture.detectChanges();
    expect(layout().title()).toBe('Dashboard');

    await router.navigateByUrl('/leads');
    fixture.detectChanges();
    expect(layout().title()).toBe('Leads');
  });
});
