import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AuthService } from '../auth.service';

// Mirrors the shared backend password rule (8-72 chars, letter + digit).
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)[\S]{8,72}$/;

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.css',
})
export class ResetPassword implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  // Held in component state only; never persisted to localStorage.
  readonly token = signal<string | null>(null);
  readonly done = signal(false);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly passwordVisible = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.pattern(PASSWORD_RE)]],
      confirmPassword: ['', [Validators.required]],
    },
    {
      validators: (group) =>
        group.value.password === group.value.confirmPassword ? null : { mismatch: true },
    }
  );

  get passwordInputType(): 'text' | 'password' {
    return this.passwordVisible() ? 'text' : 'password';
  }

  ngOnInit(): void {
    this.token.set(this.route.snapshot.queryParamMap.get('token'));
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.form.invalid || this.submitting() || !this.token()) return;

    const { password } = this.form.getRawValue();
    this.submitting.set(true);

    this.auth.resetPassword(this.token()!, password).subscribe({
      next: () => {
        this.submitting.set(false);
        this.done.set(true);
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
    if (status === 400) {
      return 'Invalid or expired password reset link.';
    }
    if (status === 429) {
      return 'Too many requests. Please wait a few minutes and try again.';
    }
    return 'Something went wrong. Please try again.';
  }
}