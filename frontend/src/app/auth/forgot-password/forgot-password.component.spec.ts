import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { ForgotPassword } from './forgot-password.component';

const GENERIC_MESSAGE =
  'If an account exists with this email, you will receive a password reset link.';

describe('ForgotPassword', () => {
  let fixture: ComponentFixture<ForgotPassword>;
  let component: ForgotPassword;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgotPassword],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPassword);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
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

  function pageText(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('blocks submit for an empty email without calling the API', () => {
    component.form.setValue({ email: '' });

    submitForm();

    expect(component.form.invalid).toBe(true);
    httpMock.expectNone('/api/auth/forgot-password');
  });

  it('shows an inline error for an invalid email and does not call the API', () => {
    component.form.setValue({ email: 'not-an-email' });

    submitForm();

    expect(pageText()).toContain('Enter a valid email address.');
    httpMock.expectNone('/api/auth/forgot-password');
  });

  it('sends the reset link request and shows the generic success message', () => {
    component.form.setValue({ email: 'user@example.com' });

    submitForm();
    const req = httpMock.expectOne('/api/auth/forgot-password');
    expect(req.request.body).toEqual({ email: 'user@example.com' });
    req.flush({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
    fixture.detectChanges();

    expect(component.sent()).toBe(true);
    expect(pageText()).toContain(GENERIC_MESSAGE);
    expect(pageText()).not.toContain('does not exist');
  });

  it('keeps the generic message even when the API reports an error', () => {
    component.form.setValue({ email: 'user@example.com' });

    submitForm();
    httpMock.expectOne('/api/auth/forgot-password').flush(
      { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests.' } },
      { status: 429, statusText: 'Too Many Requests' }
    );
    fixture.detectChanges();

    expect(component.sent()).toBe(false);
    expect(pageText()).toContain('Too many requests');
    expect(pageText()).not.toContain(GENERIC_MESSAGE);
  });

  it('shows a friendly message for network failures', () => {
    component.form.setValue({ email: 'user@example.com' });

    submitForm();
    httpMock.expectOne('/api/auth/forgot-password').error(new ProgressEvent('network'));
    fixture.detectChanges();

    expect(pageText()).toContain('Unable to reach the server');
    expect(component.submitting()).toBe(false);
  });
});