import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { WorkflowTemplateSummary } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-workflow-starter-page',
  imports: [CommonModule, FormsModule],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">新建工作流</p>
        <h1>选择一个起始结构</h1>
        <p class="lead">先创建服务器草稿，再在编辑器中拖拽节点、绑定数据并发布。</p>
      </div>
      <button class="secondary" type="button" (click)="cancel()">返回工作流</button>
    </header>
    @if (message()) {
      <div class="message">{{ message() }}</div>
    }
    <section class="form-card">
      <label>流程名称<input [(ngModel)]="name" placeholder="例如：DMA 东区漏损分析" /></label
      ><label
        >说明<textarea
          [(ngModel)]="description"
          rows="2"
          placeholder="可选，说明用途和数据范围"
        ></textarea>
      </label>
    </section>
    <section class="template-grid">
      @for (item of templates(); track item.template_code) {
        <button
          type="button"
          class="template-card"
          [class.selected]="selected()?.template_code === item.template_code"
          (click)="selected.set(item)"
        >
          <div class="template-head">
            <span
              class="radio"
              [class.checked]="selected()?.template_code === item.template_code"
            ></span>
            <h2>{{ item.name }}</h2>
            <span class="count">{{ item.node_count }} 节点</span>
          </div>
          <p>{{ item.description }}</p>
          <div class="template-meta">
            <span>输入：{{ item.required_bindings.join('、') || '无' }}</span
            ><span>输出：{{ item.outputs.join('、') }}</span>
          </div>
        </button>
      } @empty {
        <div class="empty">暂无可用内置结构。</div>
      }
    </section>
    <footer class="footer">
      <span class="muted">{{ selected()?.description || '请选择结构' }}</span
      ><button
        class="primary"
        type="button"
        [disabled]="busy() || !name.trim() || !selected()"
        (click)="create()"
      >
        {{ busy() ? '正在创建…' : '创建草稿并进入编辑器' }}
      </button>
    </footer>
  `,
  styles: `
    :host {
      display: block;
      color: #172033;
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
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 20px;
      margin-bottom: 20px;
    }
    .eyebrow {
      color: #2563eb;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .lead,
    .muted {
      color: #667085;
    }
    .form-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 16px;
      background: #fff;
      border: 1px solid #e4e7ec;
      border-radius: 14px;
      padding: 20px;
      margin-bottom: 18px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 7px;
      color: #344054;
      font-size: 13px;
      font-weight: 700;
    }
    input,
    textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #d0d5dd;
      border-radius: 9px;
      padding: 11px 12px;
      font: inherit;
      color: #172033;
      resize: vertical;
    }
    .template-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }
    .template-card {
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 13px;
      min-width: 0;
      padding: 18px;
      border: 1px solid #dfe5ee;
      background: #fff;
      border-radius: 14px;
      color: #172033;
      cursor: pointer;
      box-shadow: 0 5px 15px rgba(16, 24, 40, 0.04);
    }
    .template-card:hover,
    .template-card.selected {
      border-color: #0f67c9;
      box-shadow: 0 0 0 3px #dcecff;
    }
    .template-head {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .radio {
      width: 16px;
      height: 16px;
      border: 2px solid #98a2b3;
      border-radius: 50%;
      flex: 0 0 16px;
      box-sizing: border-box;
    }
    .radio.checked {
      border: 5px solid #0f67c9;
    }
    .count {
      margin-left: auto;
      color: #667085;
      font-size: 12px;
      white-space: nowrap;
    }
    .template-card p {
      color: #667085;
      line-height: 1.6;
      min-height: 52px;
    }
    .template-meta {
      display: flex;
      flex-direction: column;
      gap: 5px;
      color: #667085;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .message {
      padding: 11px 14px;
      border-radius: 9px;
      background: #fff4d6;
      color: #8a5b00;
      margin-bottom: 16px;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding-top: 20px;
    }
    button.primary,
    button.secondary {
      border-radius: 9px;
      padding: 11px 16px;
      font: inherit;
      cursor: pointer;
    }
    button.primary {
      border: 0;
      background: #0f67c9;
      color: #fff;
    }
    button.secondary {
      border: 1px solid #b6c5d9;
      background: #fff;
      color: #0f67c9;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    @media (max-width: 900px) {
      .template-grid {
        grid-template-columns: 1fr;
      }
      .form-card {
        grid-template-columns: 1fr;
      }
      .footer {
        align-items: flex-start;
        flex-direction: column;
      }
    }
    @media (max-width: 600px) {
      .page-header {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  `,
})
export class WorkflowStarterPage {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notice = inject(NotificationService);
  readonly templates = signal<WorkflowTemplateSummary[]>([]);
  readonly selected = signal<WorkflowTemplateSummary | null>(null);
  readonly message = signal('');
  readonly busy = signal(false);
  name = '';
  description = '';

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const requested = params.get('template');
      const found = this.templates().find((item) => item.template_code === requested);
      if (found) this.selected.set(found);
    });
    this.api.get<WorkflowTemplateSummary[]>('/api/v1/workflow-templates').subscribe({
      next: (items) => {
        this.templates.set(items || []);
        const requested = this.route.snapshot.queryParamMap.get('template');
        this.selected.set(
          this.templates().find((item) => item.template_code === requested) ||
            this.templates()[0] ||
            null,
        );
      },
      error: () => this.message.set('无法加载内置工作流结构。'),
    });
  }

  create(): void {
    const starter = this.selected();
    if (!starter || !this.name.trim()) return;
    this.busy.set(true);
    this.api
      .post<{ id: number }, object>('/api/v1/workflows/from-template', {
        workflow_name: this.name.trim(),
        description: this.description.trim() || null,
        starter: {
          kind: 'builtin',
          template_code: starter.template_code,
          version: starter.version,
        },
      })
      .subscribe({
        next: (workflow) => {
          this.notice.success('草稿已创建。');
          void this.router.navigate(['/workflows', workflow.id, 'edit']);
        },
        error: () => {
          this.busy.set(false);
          this.message.set('创建草稿失败，请检查工作流权限和服务状态。');
        },
      });
  }
  cancel(): void {
    void this.router.navigate(['/workflows']);
  }
}
