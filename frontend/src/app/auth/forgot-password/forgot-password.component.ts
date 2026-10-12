import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../auth.service';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.css',
})
export class ForgotPassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);
  readonly sent = signal(false);

  onSubmit(): void {
    this.form.markAllAsTouched();
    this.formError.set(null);
    if (this.form.invalid || this.submitting()) return;

    const { email } = this.form.getRawValue();
    this.submitting.set(true);

    // The API always responds with a generic message (no account enumeration).
    this.auth.forgotPassword(email).subscribe({
      next: () => {
        this.submitting.set(false);
        this.sent.set(true);
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
    if (status === 429) {
      return 'Too many requests. Please wait a few minutes and try again.';
    }
    return 'Something went wrong. Please try again later.';
  }
}