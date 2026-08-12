import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { RecycleBinItem, RecycleBinPage as RecyclePageData } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';

@Component({
  selector: 'app-recycle-bin-page',
  imports: [
    BeijingTimePipe,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  template: `
    <header class="head">
      <div>
        <p class="eyebrow">系统管理</p>
        <h1>资源回收站</h1>
        <p>资源保留 14 天，到期后自动清理。恢复和永久清理仅限管理员。</p>
      </div>
      <div class="actions">
        <button mat-stroked-button (click)="load()">刷新</button
        ><button mat-flat-button [disabled]="!pageData().total" (click)="emptyBin()">
          清空回收站
        </button>
      </div>
    </header>
    <section class="filters">
      <mat-form-field appearance="outline"
        ><mat-label>资源类型</mat-label
        ><mat-select [(ngModel)]="resourceType" (selectionChange)="load(1)"
          ><mat-option value="">全部</mat-option>
          @for (type of resourceTypes; track type.code) {
            <mat-option [value]="type.code">{{ type.label }}</mat-option>
          }
        </mat-select></mat-form-field
      ><mat-form-field appearance="outline"
        ><mat-label>状态</mat-label
        ><mat-select [(ngModel)]="status" (selectionChange)="load(1)"
          ><mat-option value="">待处理</mat-option><mat-option value="trashed">回收中</mat-option
          ><mat-option value="purge_failed">清理失败</mat-option
          ><mat-option value="purging">清理中</mat-option></mat-select
        ></mat-form-field
      >
    </section>
    @if (selected().size) {
      <div class="batch">
        <span>已选 {{ selected().size }} 项</span
        ><button mat-stroked-button (click)="restoreSelected()">批量恢复</button
        ><button mat-flat-button (click)="purgeSelected()">永久清理</button>
      </div>
    }
    <section class="panel">
      <div class="row heading">
        <span></span><span>资源</span><span>类型</span><span>删除时间</span><span>自动清理</span
        ><span>操作</span>
      </div>
      @for (item of pageData().items; track item.item_id) {
        <div class="row">
          <mat-checkbox
            [checked]="selected().has(item.item_id)"
            [disabled]="item.status === 'purging'"
            (change)="toggle(item.item_id)"
          />
          <div>
            <b>{{ item.resource_name }}</b
            ><small>所有者 #{{ item.owner_user_id ?? '系统' }}</small>
          </div>
          <span>{{ resourceLabel(item.resource_type) }}</span
          ><span>{{ item.deleted_at | beijingTime }}</span>
          <div>
            <b>{{ remaining(item) }}</b
            ><small>{{ item.purge_after | beijingTime }}</small>
          </div>
          <div class="actions">
            <button mat-button [disabled]="item.status === 'purging'" (click)="restore(item)">
              恢复</button
            ><button mat-button [disabled]="item.status === 'purging'" (click)="purge(item)">
              清理
            </button>
          </div>
        </div>
      } @empty {
        <div class="empty">回收站中没有资源。</div>
      }
      <footer>
        <span>共 {{ pageData().total }} 项</span
        ><button mat-button [disabled]="pageData().page <= 1" (click)="load(pageData().page - 1)">
          上一页</button
        ><button
          mat-button
          [disabled]="pageData().page * pageData().page_size >= pageData().total"
          (click)="load(pageData().page + 1)"
        >
          下一页
        </button>
      </footer>
    </section>
  `,
  styles: `
    .head,
    .actions,
    .filters,
    .batch,
    footer {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .head {
      justify-content: space-between;
    }
    .eyebrow {
      margin: 0;
      color: #0f4c81;
      font-size: 12px;
      font-weight: 800;
    }
    .head h1 {
      margin: 4px 0;
    }
    .head p,
    small {
      color: #64748b;
    }
    .filters {
      margin: 20px 0;
    }
    .filters mat-form-field {
      width: 220px;
    }
    .batch {
      margin-bottom: 12px;
      padding: 10px 14px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 12px;
    }
    .panel {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      overflow: hidden;
    }
    .row {
      display: grid;
      grid-template-columns: 42px minmax(220px, 1.5fr) 130px 180px minmax(190px, 1fr) 150px;
      align-items: center;
      gap: 12px;
      padding: 14px 18px;
      border-top: 1px solid #f1f5f9;
    }
    .heading {
      border: 0;
      background: #f8fafc;
      font-weight: 700;
    }
    .row small {
      display: block;
      margin-top: 4px;
    }
    .actions {
      justify-content: flex-end;
    }
    footer {
      justify-content: flex-end;
      padding: 12px 18px;
    }
    .empty {
      padding: 48px;
      text-align: center;
      color: #64748b;
    }
    @media (max-width: 900px) {
      .head {
        align-items: flex-start;
        flex-direction: column;
      }
      .heading {
        display: none;
      }
      .row {
        grid-template-columns: 40px 1fr 1fr;
      }
      .row > .actions {
        grid-column: 2/-1;
        justify-content: flex-start;
      }
      .filters {
        flex-wrap: wrap;
      }
      .filters mat-form-field {
        width: 100%;
      }
    }
  `,
})
export class RecycleBinPage {
  private readonly api = inject(ApiClient);
  private readonly notifications = inject(NotificationService);
  readonly pageData = signal<RecyclePageData>({ items: [], page: 1, page_size: 20, total: 0 });
  readonly selected = signal(new Set<string>());
  readonly resourceTypes = [
    { code: 'dataset', label: '数据资产' },
    { code: 'data_source', label: '数据源' },
    { code: 'csv_upload_draft', label: '上传草稿' },
    { code: 'workflow', label: '工作流' },
    { code: 'task', label: '任务' },
    { code: 'user', label: '用户' },
  ];
  resourceType = '';
  status = '';
  constructor() {
    this.load();
  }
  load(page = this.pageData().page): void {
    this.api
      .get<RecyclePageData>('/api/v1/recycle-bin', {
        resource_type: this.resourceType || null,
        status: this.status || null,
        page,
        page_size: 20,
      })
      .subscribe({
        next: (value) => {
          this.pageData.set(value);
          this.selected.set(new Set());
        },
        error: (error) => this.notifications.error(error, '无法读取回收站。'),
      });
  }
  resourceLabel(code: string): string {
    return this.resourceTypes.find((item) => item.code === code)?.label || code;
  }
  remaining(item: RecycleBinItem): string {
    const milliseconds = new Date(item.purge_after).getTime() - Date.now();
    if (milliseconds <= 0) return '等待清理';
    return `${Math.ceil(milliseconds / 86_400_000)} 天后`;
  }
  toggle(id: string): void {
    const next = new Set(this.selected());
    next.has(id) ? next.delete(id) : next.add(id);
    this.selected.set(next);
  }
  restore(item: RecycleBinItem): void {
    this.api
      .post<RecycleBinItem, object>(`/api/v1/recycle-bin/${item.item_id}/restore`, {})
      .subscribe({
        next: () => {
          this.notifications.success('资源已恢复。');
          this.load();
        },
        error: (error) => this.notifications.error(error),
      });
  }
  purge(item: RecycleBinItem): void {
    if (window.confirm(`永久清理“${item.resource_name}”？此操作不可撤销。`))
      this.queuePurge([item.item_id]);
  }
  restoreSelected(): void {
    if (!window.confirm(`恢复选中的 ${this.selected().size} 项资源？`)) return;
    this.api
      .post<{ restored: number }, { item_ids: string[] }>('/api/v1/recycle-bin/restore', {
        item_ids: [...this.selected()],
      })
      .subscribe({
        next: () => {
          this.notifications.success('所选资源已恢复。');
          this.load();
        },
        error: (error) => this.notifications.error(error),
      });
  }
  purgeSelected(): void {
    if (window.confirm(`永久清理选中的 ${this.selected().size} 项资源？`))
      this.queuePurge([...this.selected()]);
  }
  emptyBin(): void {
    const confirmation = window.prompt('输入“清空回收站”以永久清理全部资源。');
    if (confirmation !== '清空回收站') return;
    this.api
      .post<{ queued: number }, { item_ids: string[]; all_items: boolean; confirmation: string }>(
        '/api/v1/recycle-bin/purge',
        { item_ids: [], all_items: true, confirmation },
      )
      .subscribe({
        next: (value) => {
          this.notifications.success(`已提交 ${value.queued} 项清理任务。`);
          this.load();
        },
        error: (error) => this.notifications.error(error),
      });
  }
  private queuePurge(itemIds: string[]): void {
    this.api
      .post<{ queued: number }, { item_ids: string[] }>('/api/v1/recycle-bin/purge', {
        item_ids: itemIds,
      })
      .subscribe({
        next: () => {
          this.notifications.success('永久清理任务已提交。');
          this.load();
        },
        error: (error) => this.notifications.error(error),
      });
  }
}
