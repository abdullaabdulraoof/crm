import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { ResetPassword } from './reset-password.component';

const TOKEN = 'reset-token-123';

function queryParam(name: string, value: string | null): ActivatedRoute {
  return { snapshot: { queryParamMap: { get: (key: string) => (key === name ? value : null) } } } as ActivatedRoute;
}

describe('ResetPassword', () => {
  let fixture: ComponentFixture<ResetPassword>;
  let component: ResetPassword;
  let httpMock: HttpTestingController;

  async function createComponent(token: string | null = TOKEN): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ResetPassword],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: queryParam('token', token) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ResetPassword);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  }

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  function pageText(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function fillPasswords(password: string, confirmPassword: string): void {
    component.form.setValue({ password, confirmPassword });
    fixture.detectChanges();
  }

  it('reads the reset token from the URL query parameter', async () => {
    await createComponent();
    expect(component.token()).toBe(TOKEN);
  });

  it('shows an invalid-link message when no token is present and never calls the API', async () => {
    await createComponent(null);

    expect(component.token()).toBeNull();
    expect(pageText()).toContain('Invalid or expired password reset link.');
    expect(pageText()).toContain('Go to Login');

    component.onSubmit();
    httpMock.expectNone('/api/auth/reset-password');
  });

  it('blocks submit when passwords do not match', async () => {
    await createComponent();
    fillPasswords('SecretPass1', 'Different1');

    component.onSubmit();
    fixture.detectChanges();

    expect(component.form.invalid).toBe(true);
    expect(pageText()).toContain('Passwords do not match.');
    httpMock.expectNone('/api/auth/reset-password');
  });

  it('blocks submit for a weak password without calling the API', async () => {
    await createComponent();
    fillPasswords('short', 'short');

    component.onSubmit();
    fixture.detectChanges();

    expect(component.form.invalid).toBe(true);
    expect(pageText()).toContain('at least one letter and one digit');
    httpMock.expectNone('/api/auth/reset-password');
  });

  it('resets the password and shows the success state with a link to login', async () => {
    await createComponent();
    fillPasswords('NewSecret456', 'NewSecret456');

    component.onSubmit();
    fixture.detectChanges();

    const req = httpMock.expectOne('/api/auth/reset-password');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: TOKEN, password: 'NewSecret456' });
    req.flush({ success: true, message: 'Password reset successfully' });
    fixture.detectChanges();

    expect(component.done()).toBe(true);
    expect(pageText()).toContain('Password reset successfully.');
    expect(pageText()).toContain('Go to Login');
  });

  it('does not persist the reset token anywhere', async () => {
    await createComponent();
    expect(localStorage.getItem('crm.auth.token')).toBeNull();
    expect(localStorage.getItem('crm.auth.user')).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});