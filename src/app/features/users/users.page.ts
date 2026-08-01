import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { UserView } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';

const roleOptions = ['admin', 'data_operator', 'algorithm_operator', 'viewer'];

@Component({
  selector: 'app-users-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">系统管理</p>
        <h1>用户与角色</h1>
        <p>角色调整后，目标用户的旧令牌会失效并需重新登录。</p>
      </div>
      <button mat-stroked-button type="button" (click)="load()">刷新用户</button>
    </header>
    <mat-card class="create"
      ><h2>创建用户</h2>
      <form [formGroup]="form" (ngSubmit)="create()">
        <mat-form-field appearance="outline"
          ><mat-label>用户名</mat-label
          ><input matInput formControlName="username" /></mat-form-field
        ><mat-form-field appearance="outline"
          ><mat-label>显示名称</mat-label
          ><input matInput formControlName="displayName" /></mat-form-field
        ><mat-form-field appearance="outline"
          ><mat-label>初始密码</mat-label
          ><input
            matInput
            type="password"
            formControlName="password"
            autocomplete="new-password" /></mat-form-field
        ><mat-form-field appearance="outline"
          ><mat-label>初始角色</mat-label
          ><mat-select formControlName="role">
            @for (role of roles; track role) {
              <mat-option [value]="role">{{ role }}</mat-option>
            }
          </mat-select></mat-form-field
        ><button mat-flat-button color="primary" type="submit" [disabled]="form.invalid">
          创建用户
        </button>
      </form></mat-card
    >
    <section class="users">
      @for (user of users(); track user.id) {
        <mat-card
          ><div>
            <h2>{{ user.display_name }}</h2>
            <p>{{ user.username }} · {{ user.status }} · 当前角色：{{ user.roles.join('、') }}</p>
          </div>
          <label
            >覆盖为<select [value]="user.roles[0] || 'viewer'" (change)="assign(user, $event)">
              @for (role of roles; track role) {
                <option [value]="role">{{ role }}</option>
              }
            </select></label
          ></mat-card
        >
      } @empty {
        <div class="empty">暂无用户或当前账号无 user:manage 权限。</div>
      }
    </section>
  `,
  styles: `
    .page-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 18px;
    }
    .eyebrow {
      margin: 0;
      color: #0f4c81;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    h1,
    h2,
    p {
      margin-top: 0;
    }
    .page-head p:not(.eyebrow),
    .users p {
      color: #64748b;
    }
    .create,
    mat-card {
      padding: 20px;
    }
    .create form {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
      gap: 10px;
      align-items: center;
    }
    mat-form-field {
      width: 100%;
    }
    .users {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }
    .users mat-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .users h2 {
      margin-bottom: 4px;
    }
    .users label {
      display: grid;
      gap: 5px;
      color: #64748b;
      font-size: 12px;
    }
    .users select {
      padding: 7px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #fff;
    }
    .empty {
      padding: 36px;
      text-align: center;
      color: #64748b;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
    }
    @media (max-width: 900px) {
      .create form {
        grid-template-columns: 1fr;
      }
      .page-head,
      .users mat-card {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  `,
})
export class UsersPage {
  private readonly api = inject(ApiClient);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly roles = roleOptions;
  readonly users = signal<UserView[]>([]);
  readonly form = this.fb.group({
    username: ['', [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z0-9_.-]{2,63}$/)]],
    displayName: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(12)]],
    role: ['viewer'],
  });
  constructor() {
    this.load();
  }
  load(): void {
    this.api.get<UserView[]>('/api/v1/users').subscribe({
      next: (users) => this.users.set(users),
      error: (error: unknown) => this.notifications.error(error),
    });
  }
  create(): void {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    this.api
      .post<
        UserView,
        { username: string; display_name: string; password: string; role_codes: string[] }
      >('/api/v1/users', {
        username: value.username,
        display_name: value.displayName,
        password: value.password,
        role_codes: [value.role],
      })
      .subscribe({
        next: () => {
          this.notifications.success('用户已创建。');
          this.form.reset({ username: '', displayName: '', password: '', role: 'viewer' });
          this.load();
        },
        error: (error: unknown) => this.notifications.error(error),
      });
  }
  assign(user: UserView, event: Event): void {
    const role = (event.target as HTMLSelectElement).value;
    this.api
      .put<UserView, { role_codes: string[] }>(`/api/v1/users/${user.id}/roles`, {
        role_codes: [role],
      })
      .subscribe({
        next: () => {
          this.notifications.success(`${user.username} 的角色已更新。`);
          this.load();
        },
        error: (error: unknown) => this.notifications.error(error),
      });
  }
}
