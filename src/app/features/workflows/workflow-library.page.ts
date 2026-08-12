import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';

interface WorkflowVersion {
  id: number;
  version: number;
  status: string;
  created_at: string;
}

interface WorkflowItem {
  id: number;
  workflow_name: string;
  workflow_code: string;
  description?: string | null;
  status: string;
  draft_state: string;
  draft_revision: number;
  latest_published_version?: { id: number; version: number } | null;
  version_count: number;
  run_count: number;
  deleted_at?: string | null;
  can_edit: boolean;
  can_clone: boolean;
  can_delete: boolean;
  can_restore: boolean;
  can_purge: boolean;
  updated_at: string;
}

@Component({
  selector: 'app-workflow-library-page',
  imports: [CommonModule, FormsModule, BeijingTimePipe],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">工作流管理</p>
        <h1>我的分析流程</h1>
        <p class="lead">管理草稿、发布版本与历史运行。发布版本不可变，编辑会回到草稿。</p>
      </div>
      <button class="primary" (click)="create()">新建工作流</button>
    </header>
    <div class="toolbar">
      <div class="tabs">
        <button [class.active]="scope() === 'mine'" (click)="setScope('mine')">我的草稿</button>
        <button [class.active]="scope() === 'published'" (click)="setScope('published')">
          已发布流程
        </button>
        <button [class.active]="scope() === 'all'" (click)="setScope('all')">全部可见</button>
        <button [class.active]="deleted()" (click)="setDeleted(true)">回收站</button>
      </div>
      <input [(ngModel)]="query" (keyup.enter)="load()" placeholder="搜索流程名称" /><button
        class="secondary"
        (click)="load()"
      >
        刷新
      </button>
    </div>
    @if (message()) {
      <div class="message">{{ message() }}</div>
    }
    <section class="grid">
      @for (workflow of items(); track workflow.id) {
        <article class="card" [class.deleted]="!!workflow.deleted_at">
          <div class="card-head">
            <div>
              <span class="status">{{
                workflow.deleted_at
                  ? '回收站'
                  : workflow.draft_state === 'published'
                    ? '已发布'
                    : '草稿'
              }}</span>
              <h2>{{ workflow.workflow_name }}</h2>
              <code>{{ workflow.workflow_code }}</code>
            </div>
            <span class="revision">修订 {{ workflow.draft_revision }}</span>
          </div>
          <p class="description">{{ workflow.description || '暂无描述' }}</p>
          <div class="meta">
            <span>发布版本 {{ workflow.version_count }}</span
            ><span>运行 {{ workflow.run_count }} 次</span
            ><span>更新 {{ workflow.updated_at | beijingTime: 'yyyy-MM-dd HH:mm' }}</span>
          </div>
          <div class="actions">
            @if (workflow.can_edit) {
              <button class="secondary" (click)="edit(workflow)">
                {{ workflow.deleted_at ? '查看' : '编辑草稿' }}
              </button>
            }
            @if (!workflow.deleted_at && workflow.latest_published_version) {
              <button class="secondary" (click)="derive(workflow)">从最新版本派生</button>
            }
            @if (workflow.can_clone) {
              <button class="secondary" (click)="clone(workflow)">克隆</button>
            }
            @if (workflow.can_delete) {
              <button class="danger" (click)="archive(workflow)">移入回收站</button>
            }
            @if (workflow.can_restore) {
              <button class="secondary" (click)="restore(workflow)">恢复</button>
            }
            @if (workflow.can_purge) {
              <button class="danger" (click)="purge(workflow)">永久删除</button>
            }
          </div>
        </article>
      } @empty {
        <div class="empty">没有符合条件的工作流。可以新建一个 S01 流程开始。</div>
      }
    </section>
    @if (versionWorkflow(); as workflow) {
      <section class="version-panel">
        <div class="version-head">
          <h2>{{ workflow.workflow_name }} · 发布版本</h2>
          <button class="secondary" (click)="versionWorkflow.set(null)">关闭</button>
        </div>
        @for (version of versions(); track version.id) {
          <div class="version-row">
            <span>v{{ version.version }}</span
            ><small
              >{{ version.status }} ·
              {{ version.created_at | beijingTime: 'yyyy-MM-dd HH:mm' }}</small
            ><button class="secondary" (click)="deriveVersion(workflow, version)">派生草稿</button>
          </div>
        }
      </section>
    }
    <footer class="pager">
      <button class="secondary" [disabled]="page() <= 1" (click)="page.set(page() - 1); load()">
        上一页</button
      ><span>第 {{ page() }} 页，共 {{ total() }} 条</span
      ><button
        class="secondary"
        [disabled]="page() * pageSize >= total()"
        (click)="page.set(page() + 1); load()"
      >
        下一页
      </button>
    </footer>
  `,
  styles: `
    :host {
      display: block;
      color: #172033;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 20px;
      margin-bottom: 18px;
    }
    h1,
    h2,
    p {
      margin: 0;
    }
    h1 {
      font-size: 32px;
      margin-top: 4px;
    }
    h2 {
      font-size: 18px;
      margin: 8px 0 3px;
      overflow-wrap: anywhere;
    }
    .eyebrow {
      color: #2563eb;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .lead,
    .description {
      color: #667085;
      font-size: 13px;
      line-height: 1.5;
      margin-top: 7px;
    }
    button {
      border: 1px solid #d0d5dd;
      border-radius: 8px;
      background: #fff;
      color: #344054;
      padding: 9px 13px;
      cursor: pointer;
      font: inherit;
      font-size: 12px;
    }
    button:hover:not(:disabled) {
      border-color: #84adf7;
      background: #f8fbff;
    }
    button:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    button.primary {
      background: #1769d1;
      color: #fff;
      border-color: #1769d1;
    }
    button.secondary {
      background: #fff;
    }
    button.danger {
      color: #b42318;
      border-color: #f5c2c0;
    }
    .toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 15px;
    }
    .toolbar input {
      min-width: 220px;
      border: 1px solid #d0d5dd;
      border-radius: 8px;
      padding: 9px 11px;
      font: inherit;
      font-size: 12px;
    }
    .tabs {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      flex: 1;
    }
    .tabs button {
      border: 0;
      border-radius: 8px;
    }
    .tabs button.active {
      background: #eaf2ff;
      color: #175cd3;
      font-weight: 700;
    }
    .message {
      padding: 10px 13px;
      border-radius: 9px;
      background: #ecfdf3;
      color: #087443;
      font-size: 13px;
      margin-bottom: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
      gap: 14px;
    }
    .card {
      min-width: 0;
      background: #fff;
      border: 1px solid #e4e7ec;
      border-radius: 13px;
      padding: 16px;
      box-shadow: 0 3px 12px #1018280a;
    }
    .card.deleted {
      background: #fafafa;
      opacity: 0.85;
    }
    .card-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
    }
    .status {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 999px;
      background: #ecfdf3;
      color: #087443;
      font-size: 11px;
    }
    .deleted .status {
      background: #fff1f3;
      color: #b42318;
    }
    code {
      color: #98a2b3;
      font-size: 10px;
      overflow-wrap: anywhere;
    }
    .revision {
      color: #667085;
      font-size: 11px;
      white-space: nowrap;
    }
    .description {
      min-height: 40px;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      color: #667085;
      font-size: 11px;
      border-top: 1px solid #eaecf0;
      padding-top: 11px;
      margin-top: 12px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 7px;
      margin-top: 14px;
    }
    .empty {
      grid-column: 1/-1;
      min-height: 190px;
      display: grid;
      place-items: center;
      border: 1px dashed #d0d5dd;
      border-radius: 13px;
      color: #98a2b3;
      font-size: 13px;
    }
    .version-panel {
      margin: 18px 0;
      background: #fff;
      border: 1px solid #e4e7ec;
      border-radius: 13px;
      padding: 14px;
    }
    .version-head,
    .version-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .version-head h2 {
      margin: 0;
    }
    .version-row {
      padding: 10px 0;
      border-top: 1px solid #eaecf0;
      color: #475467;
    }
    .version-row small {
      flex: 1;
      color: #667085;
    }
    .pager {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 12px;
      margin: 18px 0;
      color: #667085;
      font-size: 12px;
    }
    @media (max-width: 700px) {
      .page-header {
        flex-direction: column;
        align-items: stretch;
      }
      .page-header .primary {
        width: 100%;
      }
      .toolbar input {
        flex: 1;
        min-width: 150px;
      }
    }
  `,
})
export class WorkflowLibraryPage {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly notice = inject(NotificationService);
  readonly items = signal<WorkflowItem[]>([]);
  readonly scope = signal<'mine' | 'published' | 'all'>('mine');
  readonly deleted = signal(false);
  readonly page = signal(1);
  readonly pageSize = 20;
  readonly total = signal(0);
  readonly message = signal('');
  readonly versions = signal<WorkflowVersion[]>([]);
  readonly versionWorkflow = signal<WorkflowItem | null>(null);
  query = '';

  constructor() {
    this.load();
  }

  setScope(scope: 'mine' | 'published' | 'all'): void {
    this.scope.set(scope);
    this.deleted.set(false);
    this.page.set(1);
    this.load();
  }
  setDeleted(value: boolean): void {
    this.deleted.set(value);
    this.page.set(1);
    this.load();
  }
  load(): void {
    this.api
      .get<{ items: WorkflowItem[]; total: number }>('/api/v1/workflows', {
        scope: this.scope(),
        status: this.deleted() ? 'deleted' : undefined,
        query: this.query || undefined,
        page: this.page(),
        page_size: this.pageSize,
      })
      .subscribe({
        next: (result) => {
          this.items.set(result.items || []);
          this.total.set(result.total || 0);
        },
        error: () => this.message.set('工作流列表加载失败，请稍后重试。'),
      });
  }
  create(): void {
    this.api
      .get<{ graph: Record<string, unknown> }>('/api/v1/workflows/templates/s01-leakage')
      .subscribe({
        next: (template) => {
          const name = window.prompt('工作流名称', 'S01 漏损评估流程');
          if (!name?.trim()) return;
          const code = `workflow_${Date.now()}`;
          this.api
            .post<WorkflowItem, object>('/api/v1/workflows', {
              workflow_code: code,
              workflow_name: name.trim(),
              description: 'S01 漏损评估流程',
              visibility: 'private',
              graph: template.graph,
            })
            .subscribe({
              next: (workflow) => void this.router.navigate(['/workflows', workflow.id, 'edit']),
              error: () => this.message.set('创建草稿失败。'),
            });
        },
        error: () => this.message.set('无法加载初始模板。'),
      });
  }
  edit(item: WorkflowItem): void {
    if (!item.deleted_at) void this.router.navigate(['/workflows', item.id, 'edit']);
  }
  clone(item: WorkflowItem): void {
    const name = window.prompt('新流程名称', `${item.workflow_name}（副本）`);
    if (!name?.trim()) return;
    this.api
      .post<WorkflowItem, object>(`/api/v1/workflows/${item.id}/clone`, {
        workflow_name: name.trim(),
        version_id: item.latest_published_version?.id ?? null,
      })
      .subscribe({
        next: (result) => void this.router.navigate(['/workflows', result.id, 'edit']),
        error: () => this.message.set('克隆失败，请确认该流程有已发布版本。'),
      });
  }
  viewVersions(item: WorkflowItem): void {
    this.api.get<WorkflowVersion[]>(`/api/v1/workflows/${item.id}/versions`).subscribe({
      next: (versions) => {
        this.versions.set(versions);
        this.versionWorkflow.set(item);
      },
      error: () => this.message.set('版本列表加载失败。'),
    });
  }
  deriveVersion(item: WorkflowItem, version: WorkflowVersion): void {
    if (!window.confirm(`用 v${version.version} 替换当前草稿？`)) return;
    this.api
      .post<WorkflowItem, object>(`/api/v1/workflows/${item.id}/draft/from-version`, {
        version_id: version.id,
        expected_revision: item.draft_revision,
      })
      .subscribe({
        next: () => {
          this.notice.success('已从历史版本派生草稿。');
          this.versionWorkflow.set(null);
          this.load();
        },
        error: () => this.message.set('派生失败，草稿可能已被其他标签页修改。'),
      });
  }
  derive(item: WorkflowItem): void {
    const versionId = item.latest_published_version?.id;
    if (!versionId || !window.confirm('用最新发布版本替换当前草稿？')) return;
    this.api
      .post<WorkflowItem, object>(`/api/v1/workflows/${item.id}/draft/from-version`, {
        version_id: versionId,
        expected_revision: item.draft_revision,
      })
      .subscribe({
        next: () => {
          this.notice.success('已从发布版本派生草稿。');
          this.load();
        },
        error: () => this.message.set('派生失败，草稿可能已被其他标签页修改。'),
      });
  }
  archive(item: WorkflowItem): void {
    if (!window.confirm(`将“${item.workflow_name}”移入回收站？`)) return;
    this.api.delete<WorkflowItem>(`/api/v1/workflows/${item.id}`).subscribe({
      next: () => {
        this.notice.success('已移入回收站。');
        this.load();
      },
      error: () => this.message.set('移入回收站失败。'),
    });
  }
  restore(item: WorkflowItem): void {
    this.api.post<WorkflowItem, object>(`/api/v1/workflows/${item.id}/restore`, {}).subscribe({
      next: () => {
        this.notice.success('工作流已恢复。');
        this.load();
      },
      error: () => this.message.set('恢复失败。'),
    });
  }
  purge(item: WorkflowItem): void {
    if (!window.confirm(`请输入确认后永久删除“${item.workflow_name}”？`)) return;
    this.api.delete<{ purged: boolean }>(`/api/v1/workflows/${item.id}/permanent`).subscribe({
      next: () => {
        this.notice.success('工作流已永久删除。');
        this.load();
      },
      error: () => this.message.set('永久删除被阻止：必须是从未发布且无运行记录的草稿。'),
    });
  }
}
