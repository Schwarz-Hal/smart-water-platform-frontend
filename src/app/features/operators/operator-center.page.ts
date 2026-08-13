import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { OperatorSummary, WorkflowTemplateSummary } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import { OperatorNameService } from '../../core/services/operator-name.service';

@Component({
  selector: 'app-operator-center-page',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">算子中心</p>
        <h1>可组合的分析算子</h1>
        <p class="lead">查看已审核的输入输出契约、参数和运行状态。运行统一从工作流开始。</p>
      </div>
      <div class="header-actions">
        <a class="secondary" routerLink="/operators/import">导入外部算法</a>
        <a class="primary" routerLink="/workflows/new">新建工作流</a>
      </div>
    </header>

    <section class="toolbar">
      <input
        [(ngModel)]="query"
        (keyup.enter)="load()"
        placeholder="搜索名称或编码"
        aria-label="搜索算子"
      />
      <select [(ngModel)]="kind" (change)="load()" aria-label="算子分类">
        <option value="">全部分类</option>
        <option value="data_source">数据源</option>
        <option value="transform">数据转换</option>
        <option value="algorithm">算法</option>
        <option value="control">控制</option>
        <option value="output">输出</option>
        <option value="composite">复合算子</option>
      </select>
      <select [(ngModel)]="maturity" (change)="load()" aria-label="成熟度">
        <option value="">全部成熟度</option>
        <option value="production">生产</option>
        <option value="candidate">候选</option>
        <option value="experimental">实验</option>
        <option value="deprecated">已弃用</option>
      </select>
      <button class="secondary" type="button" (click)="load()">刷新</button>
    </section>

    @if (message()) {
      <div class="message">{{ message() }}</div>
    }
    <div class="content-grid">
      <section class="operator-list" aria-label="算子列表">
        @for (operator of operators(); track operator.code) {
          <button
            class="operator-row"
            type="button"
            [class.selected]="selected()?.code === operator.code"
            (click)="select(operator)"
          >
            <span class="status-dot" [class.offline]="!operator.available"></span
            ><span class="row-copy"
              ><strong>{{ operatorNames.displayName(operator.code, operator.name) }}</strong
              ><small>{{ operator.code }} · {{ operator.kind }}</small></span
            ><span class="badge">{{ operator.active_version?.version || '—' }}</span>
          </button>
        } @empty {
          <div class="empty">暂无符合条件的算子。</div>
        }
      </section>

      <section class="detail-card" aria-live="polite">
        @if (selected(); as operator) {
          <div class="detail-head">
            <div>
              <p class="eyebrow">{{ operator.kind }}</p>
              <h2>{{ operatorNames.displayName(operator.code, operator.name) }}</h2>
              <code>{{ operator.code }}</code>
            </div>
            <span class="state" [class.ready]="operator.available">{{
              operator.available ? '可用' : '不可运行'
            }}</span>
          </div>
          <p class="description">{{ operator.description }}</p>
          @if (!operator.available) {
            <div class="warning">
              {{ operator.unavailable_reason || operator.disabled_reason || '当前版本不可运行。' }}
            </div>
          }
          @if (operator.active_version; as version) {
            <div class="meta-line">
              <span>版本 {{ version.version }}</span
              ><span>{{ version.executor_type }}</span
              ><span>{{ version.runtime_type }}</span
              ><span>成熟度 {{ version.maturity }}</span>
            </div>
            <div class="contract-grid">
              <div>
                <h3>输入端口</h3>
                @for (port of version.input_ports; track port['key']) {
                  <div class="port">
                    <b>{{ port['label'] || port['key'] }}</b
                    ><small>{{ port['data_type'] }} · {{ port['unit'] || '无单位' }}</small>
                  </div>
                } @empty {
                  <p class="muted">无输入端口</p>
                }
              </div>
              <div>
                <h3>输出端口</h3>
                @for (port of version.output_ports; track port['key']) {
                  <div class="port">
                    <b>{{ port['label'] || port['key'] }}</b
                    ><small>{{ port['data_type'] }} · {{ port['unit'] || '无单位' }}</small>
                  </div>
                } @empty {
                  <p class="muted">无输出端口</p>
                }
              </div>
            </div>
            <details>
              <summary>参数契约</summary>
              <pre>{{ version.parameter_schema | json }}</pre>
            </details>
            @if (version.algorithm; as algorithm) {
              <div class="algorithm-ref">
                关联算法：{{ algorithm['code'] }} · {{ algorithm['version'] }} ·
                {{ algorithm['execution_status'] }}
              </div>
            }
          }
          @if (operator.can_manage) {
            <div class="manage-actions">
              <button class="secondary" type="button" (click)="toggle(operator)">
                {{ operator.status === 'active' ? '停用算子' : '启用算子' }}
              </button>
            </div>
          }
        } @else {
          <div class="empty">选择一个算子查看契约。</div>
        }
      </section>
    </div>

    <section class="starter-section">
      <div>
        <p class="eyebrow">流程结构</p>
        <h2>从内置结构开始</h2>
        <p class="muted">结构会复制为你的私有草稿，载入后仍可自由拖拽、连线和调参。</p>
      </div>
      <div class="starter-grid">
        @for (template of templates(); track template.template_code) {
          <article class="starter-card">
            <div class="starter-title">
              <h3>{{ template.name }}</h3>
              <span>{{ template.node_count }} 节点</span>
            </div>
            <p>{{ template.description }}</p>
            <small>需要：{{ template.required_bindings.join('、') || '无' }}</small
            ><a
              class="secondary"
              [routerLink]="['/workflows/new']"
              [queryParams]="{ template: template.template_code }"
              >使用此结构</a
            >
          </article>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      color: #172033;
    }
    h1,
    h2,
    h3,
    p {
      margin: 0;
    }
    h1 {
      font-size: 32px;
      margin-top: 4px;
    }
    h2 {
      font-size: 22px;
    }
    h3 {
      font-size: 15px;
    }
    .page-header,
    .detail-head,
    .starter-title,
    .meta-line,
    .toolbar,
    .header-actions {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .page-header {
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 20px;
    }
    .header-actions {
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .eyebrow {
      color: #2563eb;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .lead,
    .description,
    .muted {
      color: #667085;
    }
    .toolbar {
      flex-wrap: wrap;
      margin-bottom: 18px;
    }
    input,
    select {
      min-height: 40px;
      border: 1px solid #d0d5dd;
      border-radius: 9px;
      padding: 0 12px;
      background: #fff;
      color: #172033;
    }
    input {
      min-width: 240px;
      flex: 1;
    }
    button,
    .primary,
    .secondary {
      border: 0;
      border-radius: 9px;
      padding: 10px 15px;
      cursor: pointer;
      font: inherit;
      text-decoration: none;
      display: inline-flex;
      justify-content: center;
      align-items: center;
    }
    .primary {
      background: #0f67c9;
      color: #fff;
    }
    .secondary {
      background: #fff;
      color: #0f67c9;
      border: 1px solid #b6c5d9;
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .message,
    .warning {
      border-radius: 10px;
      padding: 11px 14px;
      margin-bottom: 16px;
      background: #fff4d6;
      color: #8a5b00;
    }
    .content-grid {
      display: grid;
      grid-template-columns: minmax(280px, 0.8fr) minmax(0, 1.6fr);
      gap: 18px;
      align-items: start;
    }
    .operator-list,
    .detail-card,
    .starter-section {
      background: #fff;
      border: 1px solid #e4e7ec;
      border-radius: 14px;
      box-shadow: 0 6px 20px rgba(16, 24, 40, 0.05);
    }
    .operator-list {
      padding: 10px;
      max-height: 680px;
      overflow: auto;
    }
    .operator-row {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 10px;
      text-align: left;
      padding: 13px 12px;
      background: #fff;
      color: #172033;
      border-bottom: 1px solid #eef1f5;
    }
    .operator-row:hover,
    .operator-row.selected {
      background: #eef5ff;
    }
    .status-dot {
      flex: 0 0 9px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #1aa260;
    }
    .status-dot.offline {
      background: #b8c0cc;
    }
    .row-copy {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .row-copy strong {
      overflow-wrap: anywhere;
    }
    .row-copy small,
    .badge,
    .port small {
      color: #7b8798;
      font-size: 11px;
    }
    .badge {
      white-space: nowrap;
    }
    .detail-card {
      padding: 22px;
      min-height: 420px;
    }
    .detail-head {
      justify-content: space-between;
      align-items: flex-start;
    }
    code {
      color: #64748b;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .state {
      white-space: nowrap;
      border-radius: 999px;
      padding: 5px 10px;
      background: #f1f3f5;
      color: #667085;
      font-size: 12px;
    }
    .state.ready {
      background: #e8f8ef;
      color: #087443;
    }
    .meta-line {
      flex-wrap: wrap;
      color: #667085;
      font-size: 12px;
      border-top: 1px solid #eef1f5;
      border-bottom: 1px solid #eef1f5;
      padding: 12px 0;
      margin: 16px 0;
    }
    .contract-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .port {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 9px 0;
      border-bottom: 1px solid #eef1f5;
    }
    details {
      margin-top: 16px;
    }
    pre {
      white-space: pre-wrap;
      overflow: auto;
      background: #f6f8fb;
      padding: 12px;
      border-radius: 8px;
      font-size: 12px;
      max-height: 180px;
    }
    .algorithm-ref {
      margin-top: 12px;
      padding: 10px;
      background: #f1f7ff;
      color: #28527a;
      border-radius: 8px;
      font-size: 13px;
    }
    .manage-actions {
      margin-top: 18px;
      display: flex;
      justify-content: flex-end;
    }
    .starter-section {
      margin-top: 20px;
      padding: 20px;
    }
    .starter-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      margin-top: 16px;
    }
    .starter-card {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      border: 1px solid #e4e7ec;
      border-radius: 10px;
    }
    .starter-title {
      justify-content: space-between;
      align-items: flex-start;
    }
    .starter-title span {
      color: #667085;
      font-size: 12px;
      white-space: nowrap;
    }
    .starter-card p {
      color: #667085;
      min-height: 48px;
    }
    .starter-card small {
      color: #667085;
      overflow-wrap: anywhere;
    }
    .starter-card a {
      margin-top: auto;
    }
    @media (max-width: 900px) {
      .content-grid {
        grid-template-columns: 1fr;
      }
      .operator-list {
        max-height: 360px;
      }
      .starter-grid {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 600px) {
      .page-header {
        align-items: flex-start;
        flex-direction: column;
      }
      .contract-grid {
        grid-template-columns: 1fr;
      }
      input {
        min-width: 100%;
      }
    }
  `,
})
export class OperatorCenterPage {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly notice = inject(NotificationService);
  readonly operatorNames = inject(OperatorNameService);
  readonly operators = signal<OperatorSummary[]>([]);
  readonly templates = signal<WorkflowTemplateSummary[]>([]);
  readonly selected = signal<OperatorSummary | null>(null);
  readonly message = signal('');
  query = '';
  kind = '';
  maturity = '';

  constructor() {
    this.kind = this.route.snapshot.queryParamMap.get('kind') || '';
    this.load();
    this.loadTemplates();
  }
  load(): void {
    this.api
      .get<{ items: OperatorSummary[] }>('/api/v1/operators', {
        kind: this.kind || undefined,
        maturity: this.maturity || undefined,
        query: this.query || undefined,
        page: 1,
        page_size: 100,
      })
      .subscribe({
        next: (result) => {
          this.operators.set(result.items || []);
          const current = this.selected();
          this.selected.set(
            this.operators().find((item) => item.code === current?.code) ||
              this.operators()[0] ||
              null,
          );
        },
        error: () => this.message.set('算子目录加载失败，请检查权限或服务状态。'),
      });
  }
  loadTemplates(): void {
    this.api
      .get<WorkflowTemplateSummary[]>('/api/v1/workflow-templates')
      .subscribe({ next: (items) => this.templates.set(items || []) });
  }
  select(operator: OperatorSummary): void {
    this.selected.set(operator);
    this.api
      .get<OperatorSummary>(`/api/v1/operators/${operator.code}`)
      .subscribe({ next: (detail) => this.selected.set(detail) });
  }
  toggle(operator: OperatorSummary): void {
    const nextStatus = operator.status === 'active' ? 'disabled' : 'active';
    this.api
      .patch<OperatorSummary, { status: string; disabled_reason?: string }>(
        `/api/v1/operators/${operator.code}`,
        {
          status: nextStatus,
          disabled_reason: nextStatus === 'disabled' ? '由管理员在算子中心停用' : undefined,
        },
      )
      .subscribe({
        next: (detail) => {
          this.selected.set(detail);
          this.load();
          this.notice.success(nextStatus === 'active' ? '算子已启用。' : '算子已停用。');
        },
        error: () => this.message.set('算子状态更新失败。'),
      });
  }
}
