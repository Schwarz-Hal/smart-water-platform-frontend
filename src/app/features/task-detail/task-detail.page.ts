import { DatePipe } from '@angular/common';
import { Component, OnDestroy, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { TaskDetail } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { TaskTrackerService, TaskTrackingHandle } from '../../core/services/task-tracker.service';
import { StatusChipComponent } from '../../shared/components/status-chip.component';

@Component({
  selector: 'app-task-detail-page',
  imports: [DatePipe, MatButtonModule, MatCardModule, RouterLink, StatusChipComponent],
  template: `
    @if (handle?.task(); as task) {
      <header class="page-head">
        <div>
          <p class="eyebrow">异步任务</p>
          <h1>{{ task.task_type }}</h1>
          <p class="mono">{{ task.task_id }}</p>
        </div>
        <div class="buttons">
          @if (task.status === 'success') {
            <a mat-stroked-button [routerLink]="['/results', task.task_id]">查看结果</a>
          }
          @if (canCancel(task)) {
            <button mat-flat-button color="warn" type="button" (click)="cancel(task)">
              请求取消
            </button>
          }
        </div>
      </header>
      <section class="grid">
        <mat-card class="status-card"
          ><div class="status-line">
            <app-status-chip [status]="task.status" /><strong>{{ task.progress }}%</strong>
          </div>
          <div class="progress"><span [style.width.%]="task.progress"></span></div>
          <p>实时通道：{{ connectionLabel() }}</p>
          <small>trace_id：{{ task.trace_id }}</small></mat-card
        ><mat-card
          ><p>创建时间</p>
          <strong>{{ task.created_at | date: 'yyyy-MM-dd HH:mm:ss' }}</strong>
          <p>开始：{{ task.started_at ? (task.started_at | date: 'HH:mm:ss') : '—' }}</p>
          <p>
            结束：{{ task.finished_at ? (task.finished_at | date: 'HH:mm:ss') : '—' }}
          </p></mat-card
        >
      </section>
      @if (task.error_code || task.error_message) {
        <section class="error">
          <strong>{{ task.error_code || '任务失败' }}</strong>
          <p>{{ task.error_message }}</p>
        </section>
      }
      <section class="panel">
        <h2>任务日志</h2>
        @for (log of handle?.logs() ?? []; track log.created_at + log.message) {
          <div class="log">
            <time>{{ log.created_at | date: 'HH:mm:ss' }}</time
            ><app-status-chip [status]="log.event_type" /><span>{{ log.message }}</span>
          </div>
        } @empty {
          <div class="empty">正在读取日志…</div>
        }
      </section>
    } @else {
      <div class="empty">正在读取任务状态…</div>
    }
  `,
  styles: `
    .page-head,
    .status-line,
    .buttons {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
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
    .mono {
      font-family: ui-monospace, monospace;
      color: #64748b;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: 16px;
    }
    .status-card,
    mat-card,
    .panel {
      padding: 20px;
    }
    .status-line strong {
      font-size: 30px;
      color: #0f172a;
    }
    .progress {
      height: 10px;
      border-radius: 999px;
      background: #e2e8f0;
      margin: 16px 0;
    }
    .progress span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: #0f4c81;
      transition: width 0.3s;
    }
    .status-card p,
    small {
      color: #64748b;
    }
    .panel {
      margin-top: 16px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
    }
    .log {
      display: grid;
      grid-template-columns: 76px auto 1fr;
      gap: 12px;
      align-items: center;
      padding: 10px 0;
      border-top: 1px solid #f1f5f9;
    }
    .log time {
      color: #94a3b8;
      font-family: ui-monospace, monospace;
    }
    .error {
      margin-top: 16px;
      padding: 16px;
      border-radius: 10px;
      background: #fef2f2;
      color: #991b1b;
    }
    .empty {
      padding: 30px;
      color: #64748b;
      text-align: center;
    }
    @media (max-width: 700px) {
      .grid {
        grid-template-columns: 1fr;
      }
      .page-head {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  `,
})
export class TaskDetailPage implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly tracker = inject(TaskTrackerService);
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  readonly taskId = this.route.snapshot.paramMap.get('taskId') ?? '';
  readonly handle: TaskTrackingHandle | null = this.taskId ? this.tracker.track(this.taskId) : null;

  connectionLabel(): string {
    const state = this.handle?.connection() ?? 'connecting';
    return state === 'connected'
      ? 'WebSocket 已连接'
      : state === 'polling'
        ? '轮询回退（每 2 秒）'
        : state === 'closed'
          ? '任务已结束'
          : '正在连接';
  }
  canCancel(task: TaskDetail): boolean {
    return (
      this.auth.hasPermission('task:cancel') &&
      !['success', 'failed', 'cancelled'].includes(task.status)
    );
  }
  cancel(task: TaskDetail): void {
    this.api
      .post<TaskDetail, Record<string, never>>(`/api/v1/tasks/${task.task_id}/cancel`, {})
      .subscribe({
        next: () => this.notifications.success('已提交取消请求，任务会在安全检查点结束。'),
        error: (error: unknown) => this.notifications.error(error),
      });
  }
  ngOnDestroy(): void {
    if (this.taskId) this.tracker.stop(this.taskId);
  }
}
