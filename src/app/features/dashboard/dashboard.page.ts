import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { DependencyHealth, TaskDetail } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { TaskTrackerService } from '../../core/services/task-tracker.service';
import { StatusChipComponent } from '../../shared/components/status-chip.component';

@Component({
  selector: 'app-dashboard-page',
  imports: [MatButtonModule, MatCardModule, RouterLink, StatusChipComponent],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">平台状态</p>
        <h1>欢迎回来，{{ auth.user()?.display_name }}</h1>
        <p>查看平台依赖状态、账户权限和近期任务。</p>
      </div>
      <button mat-stroked-button type="button" (click)="reload()">刷新状态</button>
    </header>
    <section class="grid deps">
      @for (dependency of dependencyEntries(); track dependency[0]) {
        <mat-card
          ><div class="card-row">
            <span>{{ dependency[0] }}</span
            ><app-status-chip [status]="dependency[1]" />
          </div>
          <strong>{{ dependency[1] === 'ok' ? '可用' : '不可用' }}</strong></mat-card
        >
      }
      @if (!health() && !loading()) {
        <mat-card class="wide">未能读取健康状态，请检查网络连接或联系平台管理员。</mat-card>
      }
    </section>
    <section class="grid summary">
      <mat-card
        ><p>当前角色</p>
        <h2>{{ auth.user()?.roles?.join('、') || '—' }}</h2>
        <small>权限由后端最终校验</small></mat-card
      >
      <mat-card
        ><p>本会话任务</p>
        <h2>{{ tasks().length }}</h2>
        <small>只保存当前浏览器会话创建/查看过的任务</small></mat-card
      >
      <mat-card
        ><p>S01 漏损工作流</p>
        <h2>DMA 评估</h2>
        <a [routerLink]="['/workflows/new']" [queryParams]="{ template: 's01_leakage_basic' }">进入评估流程 →</a></mat-card
      >
    </section>
    <section class="panel">
      <div class="section-title">
        <div>
          <h2>当前会话任务</h2>
          <p>平台暂未提供全局任务列表接口，因此此处不会伪造历史数据。</p>
        </div>
        <a mat-flat-button color="primary" [routerLink]="['/operators']" [queryParams]="{ kind: 'algorithm' }">进入算子中心</a>
      </div>
      @if (tasks().length) {
        <div class="task-list">
          @for (task of tasks(); track task.task_id) {
            <a [routerLink]="['/tasks', task.task_id]"
              ><span
                ><strong>{{ task.task_type }}</strong
                ><small>{{ task.task_id }}</small></span
              ><app-status-chip [status]="task.status" /><span>{{ task.progress }}%</span></a
            >
          }
        </div>
      } @else {
        <div class="empty">尚无本会话任务。可运行 Qscore、Seasonal Naive 或 Hampel 进行演示。</div>
      }
    </section>
  `,
  styles: `
    .page-head,
    .section-title,
    .card-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .page-head {
      margin-bottom: 20px;
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
    h1 {
      margin-bottom: 6px;
    }
    .page-head p:not(.eyebrow),
    .section-title p,
    small {
      color: #64748b;
    }
    .grid {
      display: grid;
      gap: 14px;
    }
    .deps {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .summary {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      margin: 16px 0;
    }
    mat-card {
      padding: 16px;
    }
    .card-row {
      color: #64748b;
      text-transform: capitalize;
    }
    mat-card strong {
      display: block;
      margin-top: 16px;
      color: #0f172a;
      font-size: 20px;
    }
    .wide {
      grid-column: 1/-1;
      color: #92400e;
    }
    .panel {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
    }
    .section-title h2 {
      margin-bottom: 4px;
    }
    .task-list {
      display: grid;
      gap: 8px;
      margin-top: 16px;
    }
    .task-list a {
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: center;
      gap: 14px;
      padding: 12px;
      color: #1e293b;
      text-decoration: none;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .task-list a:hover {
      background: #f8fafc;
    }
    .task-list small {
      display: block;
      margin-top: 3px;
      font-family: ui-monospace, monospace;
    }
    .empty {
      margin-top: 14px;
      padding: 24px;
      text-align: center;
      color: #64748b;
      background: #f8fafc;
      border-radius: 8px;
    }
  `,
})
export class DashboardPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiClient);
  private readonly tracker = inject(TaskTrackerService);
  readonly health = signal<DependencyHealth | null>(null);
  readonly tasks = signal<TaskDetail[]>([]);
  readonly loading = signal(false);
  readonly dependencyEntries = computed(() => Object.entries(this.health()?.dependencies ?? {}));

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.api
      .get<DependencyHealth>('/health/ready')
      .subscribe({ next: (health) => this.health.set(health), error: () => this.health.set(null) });
    const ids = this.tracker.recentTaskIds();
    if (!ids.length) {
      this.tasks.set([]);
      this.loading.set(false);
      return;
    }
    forkJoin(ids.map((id) => this.api.get<TaskDetail>(`/api/v1/tasks/${id}`))).subscribe({
      next: (tasks) => this.tasks.set(tasks),
      error: () => {
        this.tasks.set([]);
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }
}
