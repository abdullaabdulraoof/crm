import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { LoginResponse } from './auth.types';

const LOGIN_PAYLOAD = { email: 'owner@example.com', password: 'Secret123' };

const LOGIN_RESPONSE: LoginResponse = {
  success: true,
  message: 'Signed in successfully',
  data: {
    token: 'jwt-token',
    tokenType: 'Bearer',
    expiresIn: '15m',
    user: {
      id: 'user-1',
      companyId: 'company-1',
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

describe('AuthService', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('posts credentials to the login endpoint', () => {
    const service = TestBed.inject(AuthService);
    service.login(LOGIN_PAYLOAD).subscribe();

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(LOGIN_PAYLOAD);
    req.flush(LOGIN_RESPONSE);
  });

  it('stores the token and a minimal user on success', () => {
    const service = TestBed.inject(AuthService);
    service.login(LOGIN_PAYLOAD).subscribe();
    httpMock.expectOne('/api/auth/login').flush(LOGIN_RESPONSE);

    expect(service.token()).toBe('jwt-token');
    expect(service.user()).toEqual({
      id: 'user-1',
      name: 'Test Owner',
      email: 'owner@example.com',
      role: 'OWNER',
    });
    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem('crm.auth.token')).toBe('jwt-token');
  });

  it('restores persisted state on init', () => {
    localStorage.setItem('crm.auth.token', 'stored-token');
    localStorage.setItem(
      'crm.auth.user',
      JSON.stringify({ id: 'u2', name: 'A', email: 'a@b.com', role: 'ADMIN' })
    );

    const restored = TestBed.inject(AuthService);
    expect(restored.token()).toBe('stored-token');
    expect(restored.user()?.email).toBe('a@b.com');
    expect(restored.isAuthenticated()).toBe(true);
  });

  it('clears token and user on logout', () => {
    const service = TestBed.inject(AuthService);
    service.login(LOGIN_PAYLOAD).subscribe();
    httpMock.expectOne('/api/auth/login').flush(LOGIN_RESPONSE);

    service.logout();

    expect(service.token()).toBeNull();
    expect(service.user()).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('crm.auth.token')).toBeNull();
    expect(localStorage.getItem('crm.auth.user')).toBeNull();
  });

  it('posts the email to the forgot-password endpoint without auth state changes', () => {
    const service = TestBed.inject(AuthService);
    service.forgotPassword('user@example.com').subscribe();

    const req = httpMock.expectOne('/api/auth/forgot-password');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'user@example.com' });
    req.flush({ success: true, message: 'If an account exists with this email, a password reset link has been sent.' });

    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('crm.auth.token')).toBeNull();
  });

  it('posts the token and password to the reset-password endpoint', () => {
    const service = TestBed.inject(AuthService);
    service.resetPassword('tok-123', 'NewPass456').subscribe();

    const req = httpMock.expectOne('/api/auth/reset-password');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'tok-123', password: 'NewPass456' });
    req.flush({ success: true, message: 'Password reset successfully' });

    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('crm.auth.token')).toBeNull();
  });
});