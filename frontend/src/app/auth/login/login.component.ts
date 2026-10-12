import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly passwordVisible = signal(false);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  get passwordInputType(): 'text' | 'password' {
    return this.passwordVisible() ? 'text' : 'password';
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.form.invalid || this.submitting()) return;

    const { email, password } = this.form.getRawValue();
    this.submitting.set(true);

    this.auth.login({ email, password }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err: HttpErrorResponse) => {
        this.submitting.set(false);
        this.formError.set(this.toFriendlyMessage(err));
      },
    });
  }

  private toFriendlyMessage(err: HttpErrorResponse): string {
    const status = err?.status ?? 0;
    if (status === 0) {
      return 'Unable to reach the server. Please check your connection and try again.';
    }
    if (status === 401) {
      return 'Invalid email or password.';
    }
    if (status === 403 && err.error?.error?.code === 'ACCOUNT_INACTIVE') {
      return 'Your account is deactivated. Contact your company administrator.';
    }
    if (status === 400) {
      return 'Please check your credentials and try again.';
    }
    if (status === 429) {
      return 'Too many attempts. Please wait a moment and try again.';
    }
    return 'Something went wrong. Please try again.';
  }
}