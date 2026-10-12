import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

import { LoginRequest, LoginResponse, MessageResponse, StoredUser } from './auth.types';

const TOKEN_KEY = 'crm.auth.token';
const USER_KEY = 'crm.auth.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly tokenSignal = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private readonly userSignal = signal<StoredUser | null>(this.readStoredUser());

  readonly token = this.tokenSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.tokenSignal() !== null);

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', credentials).pipe(
      tap((response) => {
        const user = this.toStoredUser(response.data.user);
        this.tokenSignal.set(response.data.token);
        this.userSignal.set(user);
        localStorage.setItem(TOKEN_KEY, response.data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
      })
    );
  }

  forgotPassword(email: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>('/api/auth/forgot-password', { email });
  }

  resetPassword(token: string, password: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>('/api/auth/reset-password', { token, password });
  }

  logout(): void {
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  private toStoredUser(user: LoginResponse['data']['user']): StoredUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }

  private readStoredUser(): StoredUser | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredUser;
    } catch {
      return null;
    }
  }
}