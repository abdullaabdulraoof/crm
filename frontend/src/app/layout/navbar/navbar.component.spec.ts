import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, Routes, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { NavbarComponent } from './navbar.component';
import { AuthService } from '../../auth/auth.service';

@Component({ standalone: true, template: '' })
class DummyComponent {}

const ROUTES: Routes = [
  { path: 'login', component: DummyComponent },
  { path: 'dashboard', component: DummyComponent },
];

function seedUser(role = 'OWNER'): void {
  localStorage.setItem('crm.auth.token', 'jwt-token');
  localStorage.setItem(
    'crm.auth.user',
    JSON.stringify({ id: 'u1', name: 'Tester', email: 't@x.com', role })
  );
}

describe('NavbarComponent', () => {
  let fixture: ComponentFixture<NavbarComponent>;
  let component: NavbarComponent;
  let router: Router;
  let auth: AuthService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [NavbarComponent],
      providers: [provideRouter(ROUTES), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    seedUser();
    router = TestBed.inject(Router);
    auth = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function queryButton(text: string): HTMLButtonElement {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button')
    ) as HTMLButtonElement[];
    const match = buttons.find((button) => (button.textContent ?? '').trim() === text);
    if (!match) {
      throw new Error(`Expected a button with text "${text}"`);
    }
    return match;
  }

  it('renders the provided title and user initials', () => {
    fixture.componentRef.setInput('title', 'Leads');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Leads');
    expect(fixture.nativeElement.textContent).toContain('Tester');
  });

  it('toggles the user menu on click', () => {
    const toggle = fixture.nativeElement.querySelector(
      '[aria-label="Open user menu"]'
    ) as HTMLButtonElement;

    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).not.toBeNull();

    toggle.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
  });

  it('opens the confirmation dialog without ending the session', () => {
    expect(auth.isAuthenticated()).toBe(true);

    component.requestLogout();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Log out?');
    expect(dialog.textContent).toContain('Are you sure you want to log out of your account?');
    expect(auth.isAuthenticated()).toBe(true);
    expect(router.url).not.toBe('/login');
  });

  it('focuses the Cancel button when the dialog opens', () => {
    component.requestLogout();
    fixture.detectChanges();

    const cancel = queryButton('Cancel');
    expect(document.activeElement).toBe(cancel);
  });

  it('keeps the session active when the dialog is cancelled', () => {
    component.requestLogout();
    fixture.detectChanges();

    queryButton('Cancel').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(auth.isAuthenticated()).toBe(true);
    expect(router.url).not.toBe('/login');
  });

  it('restores focus to the menu trigger when cancelled', () => {
    const toggle = fixture.nativeElement.querySelector(
      '[aria-label="Open user menu"]'
    ) as HTMLButtonElement;

    component.requestLogout();
    fixture.detectChanges();
    queryButton('Cancel').click();
    fixture.detectChanges();

    expect(document.activeElement).toBe(toggle);
  });

  it('closes the dialog on Escape', () => {
    component.requestLogout();
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('closes the dialog when the backdrop is clicked', () => {
    component.requestLogout();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    (panel.parentElement as HTMLElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
    expect(auth.isAuthenticated()).toBe(true);
  });

  it('logs out exactly once and navigates to login when confirmed', async () => {
    component.requestLogout();
    fixture.detectChanges();

    const logoutSpy = vi.spyOn(auth, 'logout');
    queryButton('Confirm Logout').click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.token()).toBeNull();
    expect(localStorage.getItem('crm.auth.token')).toBeNull();
    expect(localStorage.getItem('crm.auth.user')).toBeNull();
    expect(router.url).toBe('/login');
  });

  it('does not log out twice when confirmed repeatedly', async () => {
    component.requestLogout();
    fixture.detectChanges();

    const logoutSpy = vi.spyOn(auth, 'logout');
    component.confirmLogout();
    component.confirmLogout();
    await fixture.whenStable();

    expect(logoutSpy).toHaveBeenCalledTimes(1);
  });

  it('does not reopen the dialog once logout has started', () => {
    component.requestLogout();
    fixture.detectChanges();

    component.confirmLogout();
    component.requestLogout();
    fixture.detectChanges();

    expect(component.confirmingLogout()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });
});
