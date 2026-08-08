import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';

import { TaskDetail, TaskPage } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { StatusChipComponent } from '../../shared/components/status-chip.component';

@Component({
  selector: 'app-task-center-page',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    RouterLink,
    StatusChipComponent,
  ],
  template: `
    <header class="head">
      <div>
        <p class="eyebrow">统一任务中心</p>
        <h1>任务记录</h1>
        <p>查询导入、算法与工作流任务，并从历史记录安全地重新运行。</p>
      </div>
      <button mat-stroked-button (click)="load()">刷新</button>
    </header>
    <section class="filters">
      <mat-form-field appearance="outline"
        ><mat-label>任务类型</mat-label><input matInput [(ngModel)]="taskType"
      /></mat-form-field>
      <mat-form-field appearance="outline"
        ><mat-label>状态</mat-label
        ><mat-select [(ngModel)]="status"
          ><mat-option value="">全部</mat-option>
          @for (item of statuses; track item) {
            <mat-option [value]="item">{{ item }}</mat-option>
          }
        </mat-select></mat-form-field
      >
      <button mat-flat-button (click)="applyFilters()">查询</button>
    </section>
    <section class="panel">
      <div class="task heading">
        <span>类型</span><span>状态</span><span>进度</span><span>尝试</span><span>创建时间</span
        ><span>操作</span>
      </div>
      @for (task of pageData().items; track task.task_id) {
        <div class="task">
          <a [routerLink]="['/tasks', task.task_id]">{{ task.task_type }}</a
          ><app-status-chip [status]="task.status" /><span>{{ task.progress }}%</span
          ><span>{{ task.attempt_no ?? 0 }}/{{ task.max_attempts ?? 0 }}</span
          ><span>{{ task.created_at | date: 'yyyy-MM-dd HH:mm:ss' }}</span
          ><span class="actions"
            ><a mat-button [routerLink]="['/tasks', task.task_id]">详情</a>
            @if (canRerun(task)) {
              <button mat-button (click)="rerun(task)">重新运行</button>
            }
          </span>
        </div>
      } @empty {
        <div class="empty">暂无匹配任务。</div>
      }
      <footer>
        <span>共 {{ pageData().total }} 条</span
        ><button mat-button [disabled]="page() <= 1" (click)="changePage(-1)">上一页</button
        ><span>第 {{ page() }} 页</span
        ><button
          mat-button
          [disabled]="page() * pageData().page_size >= pageData().total"
          (click)="changePage(1)"
        >
          下一页
        </button>
      </footer>
    </section>
  `,
  styles: `
    .head,
    .filters,
    .task,
    footer,
    .actions {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .head {
      justify-content: space-between;
    }
    .eyebrow {
      color: #0f4c81;
      font-weight: 800;
      margin-bottom: 4px;
    }
    h1 {
      margin: 0;
    }
    .filters {
      margin: 20px 0;
      flex-wrap: wrap;
    }
    .filters mat-form-field {
      width: 220px;
    }
    .panel {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      overflow: hidden;
    }
    .task {
      display: grid;
      grid-template-columns: minmax(180px, 1.3fr) 110px 70px 70px 180px minmax(150px, 1fr);
      padding: 14px 18px;
      border-top: 1px solid #f1f5f9;
    }
    .heading {
      background: #f8fafc;
      border: 0;
      font-weight: 700;
    }
    .task a {
      color: #0f4c81;
      text-decoration: none;
    }
    .actions {
      justify-content: flex-end;
    }
    footer {
      justify-content: flex-end;
      padding: 12px 18px;
    }
    .empty {
      padding: 32px;
      text-align: center;
      color: #64748b;
    }
    @media (max-width: 900px) {
      .heading {
        display: none;
      }
      .task {
        grid-template-columns: 1fr 1fr;
      }
      .actions {
        justify-content: flex-start;
      }
    }
  `,
})
export class TaskCenterPage {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  readonly pageData = signal<TaskPage>({ items: [], page: 1, page_size: 20, total: 0 });
  readonly page = signal(1);
  readonly statuses = [
    'pending',
    'queued',
    'running',
    'retrying',
    'success',
    'failed',
    'cancelled',
  ];
  taskType = '';
  status = '';
  constructor() {
    this.load();
  }
  load(): void {
    this.api
      .get<TaskPage>('/api/v1/tasks', {
        page: this.page(),
        page_size: 20,
        task_type: this.taskType || null,
        status: this.status || null,
      })
      .subscribe({
        next: (value) => this.pageData.set(value),
        error: (error) => this.notifications.error(error, '无法读取任务记录。'),
      });
  }
  applyFilters(): void {
    this.page.set(1);
    this.load();
  }
  changePage(offset: number): void {
    this.page.update((value) => Math.max(1, value + offset));
    this.load();
  }
  canRerun(task: TaskDetail): boolean {
    return (
      this.auth.hasPermission('task:rerun') &&
      ['success', 'failed', 'cancelled'].includes(task.status)
    );
  }
  rerun(task: TaskDetail): void {
    if (!window.confirm('将基于原始快照创建一条全新任务，是否继续？')) return;
    this.api
      .post<{ run_id: string; task_id: string }, object>(`/api/v1/tasks/${task.task_id}/rerun`, {})
      .subscribe({
        next: (run) => void this.router.navigate(['/workflow-runs', run.run_id]),
        error: (error) => this.notifications.error(error, '重新运行失败。'),
      });
  }
}
