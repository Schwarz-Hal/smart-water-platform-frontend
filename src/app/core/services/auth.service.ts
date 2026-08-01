import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';

import { ApiEnvelope, AuthUser, LoginResponse } from '../models/api.models';
import { ApiClient } from './api-client.service';

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
}

const sessionKey = 'smart-water.demo.session.v1';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiClient);
  private refreshRequest$: Observable<LoginResponse> | null = null;
  private readonly sessionState = signal<StoredSession | null>(this.loadSession());

  readonly session = this.sessionState.asReadonly();
  readonly user = computed(() => this.sessionState()?.user ?? null);
  readonly isAuthenticated = computed(() => !!this.sessionState()?.accessToken);

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<ApiEnvelope<LoginResponse>>('/api/v1/auth/login', { username, password })
      .pipe(
        map((response) => response.data),
        tap((response) => this.saveSession(response)),
      );
  }

  restoreProfile(): Observable<AuthUser | null> {
    if (!this.isAuthenticated()) {
      return of(null);
    }
    return this.api.get<AuthUser>('/api/v1/auth/me').pipe(
      tap((user) => this.updateUser(user)),
      catchError(() => {
        this.clearSession();
        return of(null);
      }),
    );
  }

  refreshAccessToken(): Observable<LoginResponse> {
    const refreshToken = this.sessionState()?.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('会话已过期，请重新登录。'));
    }
    if (this.refreshRequest$) {
      return this.refreshRequest$;
    }
    this.refreshRequest$ = this.http
      .post<ApiEnvelope<LoginResponse>>('/api/v1/auth/refresh', { refresh_token: refreshToken })
      .pipe(
        map((response) => response.data),
        tap((response) => this.saveSession(response)),
        catchError((error: unknown) => {
          this.clearSession();
          return throwError(() => error);
        }),
        finalize(() => {
          this.refreshRequest$ = null;
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    return this.refreshRequest$;
  }

  clearSession(): void {
    this.sessionState.set(null);
    sessionStorage.removeItem(sessionKey);
  }

  hasPermission(permission: string): boolean {
    return this.user()?.permissions.includes(permission) ?? false;
  }

  accessToken(): string | null {
    return this.sessionState()?.accessToken ?? null;
  }

  private saveSession(response: LoginResponse): void {
    const session: StoredSession = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
      user: response.user,
    };
    this.sessionState.set(session);
    sessionStorage.setItem(sessionKey, JSON.stringify(session));
  }

  private updateUser(user: AuthUser): void {
    const session = this.sessionState();
    if (!session) {
      return;
    }
    const next = { ...session, user };
    this.sessionState.set(next);
    sessionStorage.setItem(sessionKey, JSON.stringify(next));
  }

  private loadSession(): StoredSession | null {
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as StoredSession;
      return parsed.accessToken && parsed.refreshToken && parsed.user ? parsed : null;
    } catch {
      return null;
    }
  }
}
