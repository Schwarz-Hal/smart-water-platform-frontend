import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, Validators, NonNullableFormBuilder } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <section class="login-page">
      <mat-card class="login-card">
        <div class="logo">SW</div>
        <h1>智能水务算法管理平台</h1>
        <p>使用平台账号登录，所有业务请求均通过后端 API 完成。</p>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <mat-form-field appearance="outline"
            ><mat-label>用户名</mat-label
            ><input matInput formControlName="username" autocomplete="username"
          /></mat-form-field>
          <mat-form-field appearance="outline"
            ><mat-label>密码</mat-label
            ><input
              matInput
              type="password"
              formControlName="password"
              autocomplete="current-password"
          /></mat-form-field>
          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="form.invalid || loading()"
          >
            {{ loading() ? '登录中…' : '登录' }}
          </button>
        </form>
      </mat-card>
    </section>
  `,
  styles: `
    .login-page {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: radial-gradient(circle at top right, #dbeafe, #f8fafc 42%, #e2e8f0);
    }
    .login-card {
      width: min(420px, 100%);
      padding: 32px;
      box-sizing: border-box;
    }
    .logo {
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      background: #0f4c81;
      color: white;
      border-radius: 12px;
      font-weight: 800;
    }
    h1 {
      margin: 18px 0 8px;
      font-size: 24px;
      color: #0f172a;
    }
    p,
    small {
      color: #64748b;
      line-height: 1.6;
    }
    form {
      display: grid;
      gap: 4px;
      margin: 22px 0;
    }
    mat-form-field {
      width: 100%;
    }
    button {
      height: 44px;
    }
  `,
})
export class LoginPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notifications = inject(NotificationService);
  readonly loading = signal(false);
  readonly form = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid || this.loading()) {
      return;
    }
    this.loading.set(true);
    const { username, password } = this.form.getRawValue();
    this.auth
      .login(username, password)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          const redirect = this.route.snapshot.queryParamMap.get('redirect') || '/dashboard';
          void this.router.navigateByUrl(redirect);
        },
        error: (error: unknown) => this.notifications.error(error, '用户名或密码错误。'),
      });
  }
}
