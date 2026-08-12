import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { AgGridAngular } from 'ag-grid-angular';
import { ICellRendererAngularComp } from 'ag-grid-angular';
import {
  AllCommunityModule,
  ColDef,
  GridOptions,
  ICellRendererParams,
  ModuleRegistry,
  themeQuartz,
} from 'ag-grid-community';

import { TaskDetail, TaskPage } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { formatBeijingTime } from '../../shared/pipes/beijing-time.pipe';

ModuleRegistry.registerModules([AllCommunityModule]);

interface TaskGridContext {
  open(task: TaskDetail): void;
  rerun(task: TaskDetail): void;
  remove(task: TaskDetail): void;
  canRerun(task: TaskDetail): boolean;
  canDelete(): boolean;
}

@Component({
  selector: 'app-task-status-cell',
  imports: [StatusChipComponent],
  template: `<app-status-chip [status]="status" />`,
  styles: `
    :host {
      display: flex;
      height: 100%;
      align-items: center;
    }
  `,
})
export class TaskStatusCellComponent implements ICellRendererAngularComp {
  status = '';

  agInit(params: ICellRendererParams<TaskDetail, string>): void {
    this.status = params.value ?? '';
  }

  refresh(params: ICellRendererParams<TaskDetail, string>): boolean {
    this.status = params.value ?? '';
    return true;
  }
}

@Component({
  selector: 'app-task-actions-cell',
  imports: [MatButtonModule],
  template: `
    <div class="task-actions">
      <button mat-button type="button" (click)="open()">详情</button>
      @if (task && context.canRerun(task)) {
        <button mat-button type="button" (click)="rerun()">重新运行</button>
      }
      @if (context.canDelete()) {
        <button mat-button type="button" (click)="remove()">删除</button>
      }
    </div>
  `,
  styles: `
    :host,
    .task-actions {
      display: flex;
      height: 100%;
      align-items: center;
      gap: 2px;
      white-space: nowrap;
    }
  `,
})
export class TaskActionsCellComponent implements ICellRendererAngularComp {
  task?: TaskDetail;
  context!: TaskGridContext;

  agInit(params: ICellRendererParams<TaskDetail, unknown, TaskGridContext>): void {
    this.task = params.data;
    this.context = params.context;
  }

  refresh(params: ICellRendererParams<TaskDetail, unknown, TaskGridContext>): boolean {
    this.task = params.data;
    this.context = params.context;
    return true;
  }

  open(): void {
    if (this.task) this.context.open(this.task);
  }

  rerun(): void {
    if (this.task) this.context.rerun(this.task);
  }

  remove(): void {
    if (this.task) this.context.remove(this.task);
  }
}

export function createTaskColumnDefs(compact: boolean): ColDef<TaskDetail>[] {
  const columns: ColDef<TaskDetail>[] = [
    {
      field: 'task_type',
      headerName: '任务类型和名称',
      flex: 1.4,
      minWidth: 190,
      cellClass: 'task-type-cell',
    },
    {
      field: 'status',
      headerName: '状态',
      width: 116,
      cellRenderer: TaskStatusCellComponent,
    },
    {
      field: 'progress',
      headerName: '进度',
      width: 90,
      valueFormatter: ({ value }) => `${value ?? 0}%`,
    },
    {
      headerName: '尝试次数',
      width: 100,
      valueGetter: ({ data }) => `${data?.attempt_no ?? 0}/${data?.max_attempts ?? 0}`,
      hide: compact,
    },
    {
      field: 'created_at',
      headerName: '创建时间',
      width: 172,
      valueFormatter: ({ value }) => formatBeijingTime(value),
      hide: compact,
    },
    {
      field: 'heartbeat_at',
      headerName: '更新时间',
      width: 172,
      valueFormatter: ({ value, data }) =>
        formatBeijingTime(value ?? data?.finished_at ?? data?.started_at ?? data?.created_at),
      hide: compact,
    },
    {
      field: 'trace_id',
      headerName: 'trace_id',
      minWidth: 210,
      flex: 1,
      hide: compact,
    },
    {
      headerName: '操作',
      width: compact ? 220 : 250,
      minWidth: 190,
      pinned: compact ? undefined : 'right',
      cellRenderer: TaskActionsCellComponent,
      sortable: false,
    },
  ];
  return columns;
}

@Component({
  selector: 'app-task-center-page',
  imports: [
    AgGridAngular,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
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
      <ag-grid-angular
        class="task-grid"
        [theme]="gridTheme"
        [rowData]="pageData().items"
        [columnDefs]="columnDefs()"
        [defaultColDef]="defaultColDef"
        [context]="gridContext"
        [gridOptions]="gridOptions"
        [domLayout]="'autoHeight'"
        [overlayNoRowsTemplate]="'暂无匹配任务。'"
      />
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
    footer {
      display: flex;
      align-items: center;
      gap: var(--sw-space-3);
    }
    .head {
      justify-content: space-between;
    }
    .eyebrow {
      color: var(--sw-primary);
      font-weight: 800;
      margin-bottom: 4px;
    }
    h1 {
      margin: 0;
    }
    .filters {
      margin: var(--sw-space-5) 0;
      flex-wrap: wrap;
    }
    .filters mat-form-field {
      width: 220px;
    }
    .panel {
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      overflow: hidden;
      box-shadow: var(--sw-shadow-sm);
    }
    .task-grid {
      display: block;
      width: 100%;
      min-height: 180px;
    }
    footer {
      justify-content: flex-end;
      padding: var(--sw-space-3) var(--sw-space-4);
      border-top: 1px solid var(--sw-border);
      color: var(--sw-text-muted);
    }
    :host ::ng-deep .task-type-cell {
      color: var(--sw-primary);
      font-weight: 700;
    }
    @media (max-width: 720px) {
      .head {
        align-items: flex-start;
      }
      .filters mat-form-field {
        width: min(100%, 260px);
      }
      footer {
        justify-content: center;
        flex-wrap: wrap;
      }
    }
  `,
})
export class TaskCenterPage {
  private readonly api = inject(ApiClient);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  readonly pageData = signal<TaskPage>({ items: [], page: 1, page_size: 20, total: 0 });
  readonly page = signal(1);
  readonly columnDefs = signal(createTaskColumnDefs(window.innerWidth < 900));
  readonly statuses = [
    'pending',
    'queued',
    'running',
    'retrying',
    'success',
    'failed',
    'cancelled',
  ];
  readonly defaultColDef: ColDef<TaskDetail> = {
    sortable: false,
    resizable: true,
    suppressHeaderMenuButton: true,
  };
  readonly gridOptions: GridOptions<TaskDetail> = {
    animateRows: false,
    ensureDomOrder: true,
    rowHeight: 52,
    headerHeight: 48,
    suppressCellFocus: false,
  };
  readonly gridTheme = themeQuartz.withParams({
    accentColor: 'var(--sw-primary)',
    backgroundColor: 'var(--sw-surface)',
    foregroundColor: 'var(--sw-text)',
    borderColor: 'var(--sw-border)',
    headerBackgroundColor: 'var(--sw-surface-subtle)',
    rowHoverColor: 'var(--sw-primary-container)',
    wrapperBorderRadius: '0px',
    fontFamily: 'var(--sw-font-family)',
  });
  readonly gridContext: TaskGridContext = {
    open: (task) => void this.router.navigate(['/tasks', task.task_id]),
    rerun: (task) => this.rerun(task),
    remove: (task) => this.remove(task),
    canRerun: (task) => this.canRerun(task),
    canDelete: () => this.auth.hasPermission('task:delete'),
  };
  taskType = '';
  status = '';

  constructor() {
    this.load();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.columnDefs.set(createTaskColumnDefs(window.innerWidth < 900));
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

  remove(task: TaskDetail): void {
    const message = ['success', 'failed', 'cancelled'].includes(task.status)
      ? '任务将进入回收站并保留 14 天，是否继续？'
      : '系统将先请求取消任务，再将其移入回收站，是否继续？';
    if (!window.confirm(message)) return;
    this.api.delete<{ task_id: string }>(`/api/v1/tasks/${task.task_id}`).subscribe({
      next: () => {
        this.notifications.success('任务已从列表中移除。');
        this.load();
      },
      error: (error) => this.notifications.error(error, '删除任务失败。'),
    });
  }
}
