import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';

import { Login } from './login.component';

const OK_RESPONSE = {
  success: true,
  message: 'Signed in successfully',
  data: {
    token: 'jwt-token',
    tokenType: 'Bearer',
    expiresIn: '15m',
    user: {
      id: 'u1',
      companyId: 'c1',
      name: 'Test Owner',
      email: 'owner@example.com',
      phone: '',
      role: 'OWNER',
      isActive: true,
      lastLogin: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  },
};

const ERROR_RESPONSE = {
  success: false,
  error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' },
};

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let component: Login;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  function submitForm(): void {
    component.onSubmit();
    fixture.detectChanges();
  }

  function subjectButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('blocks submit for empty required fields without calling the API', () => {
    component.form.setValue({ email: '', password: '' });

    submitForm();

    expect(component.form.invalid).toBe(true);
    expect(subjectButton().disabled).toBe(true);
    httpMock.expectNone('/api/auth/login');
  });

  it('shows an inline error for an invalid email and does not call the API', () => {
    component.form.setValue({ email: 'not-an-email', password: 'Secret123' });

    submitForm();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Enter a valid email address.');
    httpMock.expectNone('/api/auth/login');
  });

  it('disables the Login button while the request is in flight', () => {
    component.form.setValue({ email: 'owner@example.com', password: 'Secret123' });

    submitForm();

    expect(component.submitting()).toBe(true);
    expect(subjectButton().disabled).toBe(true);

    httpMock.expectOne('/api/auth/login').flush(OK_RESPONSE);
    fixture.detectChanges();

    expect(component.submitting()).toBe(false);
  });

  it('redirects to the dashboard after a successful login', () => {
    component.form.setValue({ email: 'owner@example.com', password: 'Secret123' });

    submitForm();
    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ email: 'owner@example.com', password: 'Secret123' });
    req.flush(OK_RESPONSE);
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('shows a friendly message for invalid credentials and stays usable', () => {
    component.form.setValue({ email: 'owner@example.com', password: 'wrong' });

    submitForm();
    httpMock.expectOne('/api/auth/login').flush(ERROR_RESPONSE, {
      status: 401,
      statusText: 'Unauthorized',
    });
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Invalid email or password.');
    expect(component.submitting()).toBe(false);
    expect(subjectButton().disabled).toBe(false);
  });

  it('shows a friendly message for network failures', () => {
    component.form.setValue({ email: 'owner@example.com', password: 'Secret123' });

    submitForm();
    httpMock.expectOne('/api/auth/login').error(new ProgressEvent('network'));
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Unable to reach the server');
    expect(subjectButton().disabled).toBe(false);
  });

  it('toggles the password field visibility', () => {
    const input = fixture.nativeElement.querySelector('input#password') as HTMLInputElement;
    const toggle = fixture.nativeElement.querySelector(
      'button[aria-label="Show or hide password"]'
    ) as HTMLButtonElement;

    expect(input.type).toBe('password');

    toggle.click();
    fixture.detectChanges();
    expect(input.type).toBe('text');

    toggle.click();
    fixture.detectChanges();
    expect(input.type).toBe('password');
  });

  it('links to the forgot-password page', () => {
    const link = fixture.nativeElement.querySelector(
      'a[routerlink="/forgot-password"]'
    ) as HTMLAnchorElement;

    expect(link).toBeTruthy();
    expect(link.textContent?.trim()).toBe('Forgot password?');
    expect(link.getAttribute('href')).toBe('/forgot-password');
  });
});