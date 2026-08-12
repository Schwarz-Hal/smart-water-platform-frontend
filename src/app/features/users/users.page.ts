import { Component, computed, inject, signal } from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { UserPage, UserView } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';

const roleOptions = ['admin', 'algorithm_operator', 'data_operator', 'basic_user', 'viewer'];

@Component({
  selector: 'app-users-page',
  imports: [
    BeijingTimePipe,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">系统管理</p>
        <h1>用户与角色</h1>
        <p>管理账户、角色和用户关联资源。</p>
      </div>
      <div class="head-actions">
        <button mat-stroked-button (click)="load()">刷新</button
        ><button mat-flat-button (click)="openCreate()">创建用户</button>
      </div>
    </header>
    <section class="filters">
      <mat-form-field appearance="outline"
        ><mat-label>搜索用户</mat-label
        ><input matInput [(ngModel)]="query" (keyup.enter)="applyFilters()"
      /></mat-form-field>
      <mat-form-field appearance="outline"
        ><mat-label>角色</mat-label
        ><mat-select [(ngModel)]="roleFilter"
          ><mat-option value="">全部</mat-option>
          @for (role of roles; track role) {
            <mat-option [value]="role">{{ roleLabel(role) }}</mat-option>
          }
        </mat-select></mat-form-field
      >
      <mat-form-field appearance="outline"
        ><mat-label>状态</mat-label
        ><mat-select [(ngModel)]="statusFilter"
          ><mat-option value="">全部</mat-option><mat-option value="active">正常</mat-option
          ><mat-option value="disabled">已停用</mat-option
          ><mat-option value="pending_deletion">待清理</mat-option></mat-select
        ></mat-form-field
      >
      <button mat-flat-button (click)="applyFilters()">筛选</button>
    </section>
    <section class="users-grid">
      @for (user of pageData().items; track user.id) {
        <article class="user-card" [class.selected]="selectedIds().has(user.id)">
          <span class="role-stripe" [attr.data-role]="primaryRole(user)"></span>
          @if (batchMode()) {
            <mat-checkbox
              class="selector"
              [checked]="selectedIds().has(user.id)"
              (change)="toggleUser(user.id)"
            />
          }
          <div class="card-copy">
            <div class="card-title">
              <div>
                <h2>{{ user.display_name }}</h2>
                <p>@{{ user.username }}</p>
              </div>
              <span class="status" [attr.data-status]="user.status">{{
                statusLabel(user.status)
              }}</span>
            </div>
            <div class="roles">
              @for (role of user.roles; track role) {
                <span>{{ roleLabel(role) }}</span>
              }
            </div>
            <div class="counts">
              <span
                ><b>{{ user.resource_counts?.datasets ?? 0 }}</b> 数据</span
              ><span
                ><b>{{ user.resource_counts?.workflows ?? 0 }}</b> 工作流</span
              ><span
                ><b>{{ user.resource_counts?.tasks ?? 0 }}</b> 任务</span
              >
            </div>
          </div>
          @if (!batchMode()) {
            <div class="hover-actions">
              <button mat-stroked-button (click)="openDetail(user, false)">查看</button
              ><button mat-flat-button (click)="openDetail(user, true)">编辑</button>
            </div>
          }
        </article>
      } @empty {
        <div class="empty">没有符合条件的用户。</div>
      }
    </section>
    <footer class="pager">
      <span>共 {{ pageData().total }} 个用户</span
      ><button mat-button [disabled]="pageData().page <= 1" (click)="changePage(-1)">上一页</button
      ><span>第 {{ pageData().page }} 页</span
      ><button
        mat-button
        [disabled]="pageData().page * pageData().page_size >= pageData().total"
        (click)="changePage(1)"
      >
        下一页
      </button>
    </footer>
    <div class="batch-dock" [class.active]="batchMode()">
      <button mat-stroked-button (click)="toggleBatchMode()">
        {{ batchMode() ? '取消批量编辑' : '批量编辑' }}
      </button>
      @if (batchMode()) {
        <span>已选 {{ selectedIds().size }} 人</span
        ><mat-form-field appearance="outline"
          ><mat-label>覆盖角色</mat-label
          ><mat-select [(ngModel)]="batchRole">
            @for (role of roles; track role) {
              <mat-option [value]="role">{{ roleLabel(role) }}</mat-option>
            }
          </mat-select></mat-form-field
        ><button mat-flat-button [disabled]="!selectedIds().size" (click)="applyBatchRoles()">
          应用角色
        </button>
      }
    </div>

    @if (createOpen()) {
      <div class="overlay" (click)="closeCreate()">
        <section class="modal" (click)="$event.stopPropagation()">
          <header>
            <h2>创建用户</h2>
            <button mat-button (click)="closeCreate()">关闭</button>
          </header>
          <form [formGroup]="createForm" (ngSubmit)="create()">
            <mat-form-field appearance="outline"
              ><mat-label>用户名</mat-label
              ><input matInput formControlName="username" /></mat-form-field
            ><mat-form-field appearance="outline"
              ><mat-label>显示名称</mat-label
              ><input matInput formControlName="displayName" /></mat-form-field
            ><mat-form-field appearance="outline"
              ><mat-label>初始密码</mat-label
              ><input matInput type="password" formControlName="password" /></mat-form-field
            ><mat-form-field appearance="outline"
              ><mat-label>初始角色</mat-label
              ><mat-select formControlName="role">
                @for (role of roles; track role) {
                  <mat-option [value]="role">{{ roleLabel(role) }}</mat-option>
                }
              </mat-select></mat-form-field
            ><button mat-flat-button type="submit" [disabled]="createForm.invalid">创建</button>
          </form>
        </section>
      </div>
    }

    @if (activeUser(); as user) {
      <div class="overlay" (click)="closeDetail()">
        <aside class="drawer" (click)="$event.stopPropagation()">
          <header>
            <div>
              <small>用户详情</small>
              <h2>{{ user.display_name }}</h2>
              <p>@{{ user.username }}</p>
            </div>
            <button mat-button (click)="closeDetail()">关闭</button>
          </header>
          <div class="detail-status">
            <span class="status" [attr.data-status]="user.status">{{
              statusLabel(user.status)
            }}</span
            ><span>创建于 {{ user.created_at | beijingTime }}</span>
          </div>
          <section class="resource-summary">
            <div>
              <b>{{ user.resource_counts?.datasets ?? 0 }}</b
              ><span>数据资产</span>
            </div>
            <div>
              <b>{{ user.resource_counts?.workflows ?? 0 }}</b
              ><span>工作流</span>
            </div>
            <div>
              <b>{{ user.resource_counts?.tasks ?? 0 }}</b
              ><span>任务</span>
            </div>
          </section>
          @if (editMode()) {
            <form [formGroup]="editForm" (ngSubmit)="saveUser(user)">
              <mat-form-field appearance="outline"
                ><mat-label>显示名称</mat-label
                ><input matInput formControlName="displayName" /></mat-form-field
              ><mat-form-field appearance="outline"
                ><mat-label>状态</mat-label
                ><mat-select formControlName="status"
                  ><mat-option value="active">正常</mat-option
                  ><mat-option value="disabled">停用</mat-option></mat-select
                ></mat-form-field
              ><mat-form-field appearance="outline"
                ><mat-label>角色</mat-label
                ><mat-select formControlName="roles" multiple>
                  @for (role of roles; track role) {
                    <mat-option [value]="role">{{ roleLabel(role) }}</mat-option>
                  }
                </mat-select></mat-form-field
              ><button mat-flat-button type="submit">保存修改</button>
            </form>
          } @else {
            <section>
              <h3>角色与权限</h3>
              <div class="roles">
                @for (role of user.roles; track role) {
                  <span>{{ roleLabel(role) }}</span>
                }
              </div>
              <p class="permission-copy">
                共 {{ user.permissions.length }} 项权限。角色修改后旧令牌会立即失效。
              </p>
            </section>
          }
          <div class="danger-zone">
            @if (user.status === 'pending_deletion') {
              <button mat-stroked-button (click)="restoreUser(user)">恢复账户及资源</button>
            } @else {
              <button mat-stroked-button (click)="cancelUser(user)">注销账户</button>
            }
            <button mat-button (click)="editMode.set(!editMode())">
              {{ editMode() ? '查看信息' : '编辑信息' }}
            </button>
          </div>
        </aside>
      </div>
    }
  `,
  styles: `
    .page-head,
    .head-actions,
    .filters,
    .card-title,
    .counts,
    .hover-actions,
    .pager,
    .batch-dock,
    .modal header,
    .drawer header,
    .detail-status,
    .danger-zone {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .page-head {
      justify-content: space-between;
    }
    .eyebrow {
      margin: 0;
      color: #0f4c81;
      font-size: 12px;
      font-weight: 800;
    }
    .page-head h1 {
      margin: 4px 0;
    }
    .page-head p,
    .card-title p,
    .drawer p {
      margin: 0;
      color: #64748b;
    }
    .filters {
      margin: 20px 0;
      flex-wrap: wrap;
    }
    .filters mat-form-field {
      width: 210px;
    }
    .users-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      gap: 14px;
    }
    .user-card {
      position: relative;
      min-width: 0;
      min-height: 190px;
      padding: 18px 18px 16px 23px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      overflow: hidden;
      box-sizing: border-box;
      transition: 0.18s;
    }
    .user-card:hover,
    .user-card.selected {
      border-color: #93b9db;
      box-shadow: 0 10px 28px #0f4c8118;
    }
    .role-stripe {
      position: absolute;
      inset: 0 auto 0 0;
      width: 6px;
      background: #94a3b8;
    }
    .role-stripe[data-role='admin'] {
      background: #7c3aed;
    }
    .role-stripe[data-role='algorithm_operator'] {
      background: #0f4c81;
    }
    .role-stripe[data-role='data_operator'] {
      background: #059669;
    }
    .role-stripe[data-role='basic_user'] {
      background: #d97706;
    }
    .card-title {
      justify-content: space-between;
      align-items: flex-start;
    }
    .card-title h2 {
      font-size: 18px;
      margin: 0 0 4px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .status,
    .roles span {
      display: inline-flex;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 12px;
      background: #eef2f7;
      color: #475569;
    }
    .status[data-status='active'] {
      background: #dcfce7;
      color: #15803d;
    }
    .status[data-status='pending_deletion'],
    .status[data-status='disabled'] {
      background: #fee2e2;
      color: #b91c1c;
    }
    .roles {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin: 18px 0;
    }
    .counts {
      justify-content: space-between;
      color: #64748b;
      font-size: 12px;
    }
    .counts span {
      display: grid;
      gap: 2px;
    }
    .counts b {
      color: #0f172a;
      font-size: 17px;
    }
    .hover-actions {
      position: absolute;
      right: 14px;
      bottom: 12px;
      padding: 6px;
      background: #fffffff2;
      border-radius: 10px;
      opacity: 0;
      transform: translateY(5px);
      transition: 0.18s;
    }
    .user-card:hover .hover-actions {
      opacity: 1;
      transform: none;
    }
    .selector {
      position: absolute;
      right: 10px;
      top: 10px;
    }
    .pager {
      justify-content: flex-end;
      margin: 18px 0 80px;
    }
    .batch-dock {
      position: fixed;
      left: 260px;
      bottom: 18px;
      z-index: 20;
      padding: 8px 12px;
      background: #fff;
      border: 1px solid #dbe3ec;
      border-radius: 14px;
      box-shadow: 0 10px 30px #0f172a24;
    }
    .batch-dock mat-form-field {
      width: 190px;
      margin-bottom: -20px;
    }
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: #0f172a66;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .modal,
    .drawer {
      background: #fff;
      border-radius: 18px;
      box-shadow: 0 24px 70px #0f172a33;
      box-sizing: border-box;
    }
    .modal {
      width: min(520px, 100%);
      padding: 24px;
    }
    .modal header,
    .drawer header {
      justify-content: space-between;
    }
    .modal form,
    .drawer form {
      display: grid;
      gap: 4px;
      margin-top: 20px;
    }
    .drawer {
      position: absolute;
      right: 0;
      top: 0;
      height: 100%;
      width: min(520px, 100%);
      border-radius: 0;
      padding: 26px;
      overflow: auto;
    }
    .detail-status {
      justify-content: space-between;
      margin: 18px 0;
      color: #64748b;
    }
    .resource-summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .resource-summary div {
      display: grid;
      padding: 14px;
      background: #f8fafc;
      border-radius: 12px;
    }
    .resource-summary b {
      font-size: 24px;
    }
    .resource-summary span,
    .permission-copy {
      color: #64748b;
    }
    .danger-zone {
      justify-content: space-between;
      margin-top: 30px;
      padding-top: 18px;
      border-top: 1px solid #e2e8f0;
    }
    .empty {
      grid-column: 1/-1;
      padding: 48px;
      text-align: center;
      background: #fff;
      border-radius: 14px;
      color: #64748b;
    }
    @media (max-width: 800px) {
      .page-head {
        align-items: flex-start;
        flex-direction: column;
      }
      .filters mat-form-field {
        width: 100%;
      }
      .batch-dock {
        left: 14px;
        right: 14px;
        flex-wrap: wrap;
      }
      .hover-actions {
        position: static;
        opacity: 1;
        transform: none;
        margin-top: 12px;
      }
      .resource-summary {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class UsersPage {
  private readonly api = inject(ApiClient);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly roles = roleOptions;
  readonly pageData = signal<UserPage>({ items: [], page: 1, page_size: 24, total: 0 });
  readonly batchMode = signal(false);
  readonly selectedIds = signal(new Set<number>());
  readonly createOpen = signal(false);
  readonly activeUser = signal<UserView | null>(null);
  readonly editMode = signal(false);
  readonly selectedCount = computed(() => this.selectedIds().size);
  query = '';
  roleFilter = '';
  statusFilter = '';
  batchRole = 'basic_user';
  readonly createForm = this.fb.group({
    username: ['', [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z0-9_.-]{2,63}$/)]],
    displayName: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(12)]],
    role: ['basic_user'],
  });
  readonly editForm = this.fb.group({
    displayName: ['', Validators.required],
    status: ['active'],
    roles: this.fb.control<string[]>([]),
  });
  constructor() {
    this.load();
  }
  load(page = this.pageData().page): void {
    this.api
      .get<UserPage>('/api/v1/users', {
        query: this.query || null,
        role: this.roleFilter || null,
        status: this.statusFilter || null,
        page,
        page_size: 24,
      })
      .subscribe({
        next: (value) => this.pageData.set(value),
        error: (error) => this.notifications.error(error, '无法读取用户。'),
      });
  }
  applyFilters(): void {
    this.load(1);
  }
  changePage(offset: number): void {
    this.load(Math.max(1, this.pageData().page + offset));
  }
  roleLabel(role: string): string {
    return (
      (
        {
          admin: '管理员',
          algorithm_operator: '算法运营',
          data_operator: '数据运营',
          basic_user: '普通用户',
          viewer: '只读访客',
        } as Record<string, string>
      )[role] || role
    );
  }
  primaryRole(user: UserView): string {
    return this.roles.find((role) => user.roles.includes(role)) || 'viewer';
  }
  statusLabel(status: string): string {
    return (
      (
        {
          active: '正常',
          disabled: '已停用',
          pending_deletion: '待清理',
          deleted: '已注销',
        } as Record<string, string>
      )[status] || status
    );
  }
  toggleBatchMode(): void {
    this.batchMode.update((value) => !value);
    this.selectedIds.set(new Set());
  }
  toggleUser(id: number): void {
    const next = new Set(this.selectedIds());
    next.has(id) ? next.delete(id) : next.add(id);
    this.selectedIds.set(next);
  }
  applyBatchRoles(): void {
    if (
      !this.selectedIds().size ||
      !window.confirm(`将覆盖 ${this.selectedIds().size} 个用户的角色，是否继续？`)
    )
      return;
    this.api
      .post<{ updated: number }, { user_ids: number[]; role_codes: string[] }>(
        '/api/v1/users/batch/roles',
        { user_ids: [...this.selectedIds()], role_codes: [this.batchRole] },
      )
      .subscribe({
        next: () => {
          this.notifications.success('批量角色已更新。');
          this.toggleBatchMode();
          this.load();
        },
        error: (error) => this.notifications.error(error),
      });
  }
  openCreate(): void {
    this.createOpen.set(true);
  }
  closeCreate(): void {
    this.createOpen.set(false);
  }
  create(): void {
    if (this.createForm.invalid) return;
    const value = this.createForm.getRawValue();
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
          this.closeCreate();
          this.createForm.reset({
            username: '',
            displayName: '',
            password: '',
            role: 'basic_user',
          });
          this.load(1);
        },
        error: (error) => this.notifications.error(error),
      });
  }
  openDetail(user: UserView, edit: boolean): void {
    this.api.get<UserView>(`/api/v1/users/${user.id}`).subscribe({
      next: (value) => {
        this.activeUser.set(value);
        this.editMode.set(edit);
        this.editForm.setValue({
          displayName: value.display_name,
          status: value.status === 'disabled' ? 'disabled' : 'active',
          roles: value.roles,
        });
      },
      error: (error) => this.notifications.error(error),
    });
  }
  closeDetail(): void {
    this.activeUser.set(null);
    this.editMode.set(false);
  }
  saveUser(user: UserView): void {
    if (this.editForm.invalid) return;
    const value = this.editForm.getRawValue();
    this.api
      .patch<UserView, { display_name: string; status: string }>(`/api/v1/users/${user.id}`, {
        display_name: value.displayName,
        status: value.status,
      })
      .subscribe({
        next: () =>
          this.api
            .put<UserView, { role_codes: string[] }>(`/api/v1/users/${user.id}/roles`, {
              role_codes: value.roles,
            })
            .subscribe({
              next: (updated) => {
                this.notifications.success('用户信息已更新。');
                this.activeUser.set(updated);
                this.editMode.set(false);
                this.load();
              },
              error: (error) => this.notifications.error(error),
            }),
        error: (error) => this.notifications.error(error),
      });
  }
  cancelUser(user: UserView): void {
    if (!window.confirm(`确认注销 ${user.username}？其资源将进入回收站并保留 14 天。`)) return;
    this.api.delete<{ status: string }>(`/api/v1/users/${user.id}`).subscribe({
      next: () => {
        this.notifications.success('账户及资源已移入回收站。');
        this.closeDetail();
        this.load();
      },
      error: (error) => this.notifications.error(error),
    });
  }
  restoreUser(user: UserView): void {
    this.api.post<UserView, object>(`/api/v1/users/${user.id}/restore`, {}).subscribe({
      next: () => {
        this.notifications.success('账户及本次注销资源已恢复。');
        this.closeDetail();
        this.load();
      },
      error: (error) => this.notifications.error(error),
    });
  }
}
