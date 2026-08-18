import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

import {
  AlgorithmDocument,
  OperatorSummary,
  WorkflowTemplateSummary,
} from '../../core/models/api.models';
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
          @if (algorithmTags(operator); as tags) {
            <div class="tag-row">
              @for (tag of tags; track tag.code) {
                <span class="tag">{{ tag['name'] }}</span>
              }
            </div>
          }
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
            <nav class="tabs" aria-label="算子详情选项卡">
              <button type="button" [class.active]="activeTab() === 'overview'" (click)="setTab('overview')">简介</button>
              <button type="button" [class.active]="activeTab() === 'contract'" (click)="setTab('contract')">契约与参数</button>
              <button type="button" [class.active]="activeTab() === 'training'" (click)="setTab('training')">训练与模型</button>
              <button type="button" [class.active]="activeTab() === 'versions'" (click)="setTab('versions')">版本与评估</button>
              <button type="button" [class.active]="activeTab() === 'documents'" (click)="setTab('documents')">文档</button>
              <button type="button" [class.active]="activeTab() === 'usage'" (click)="setTab('usage')">使用情况</button>
            </nav>
            @if (activeTab() === 'overview') {
              <div class="tab-body">
                <p class="description">{{ operator.description }}</p>
                <h3>适用范围</h3>
                <p class="muted">{{ algorithmDescription(operator) || '用于已登记数据资产的可追溯分析。运行结果通过工作流统一保存。' }}</p>
                <div class="algorithm-ref">运行环境：{{ version.runtime_type }} · {{ version.runtime_ready ? '环境就绪' : '环境未就绪' }}</div>
              </div>
            }
            @if (activeTab() === 'contract') {
              <div class="tab-body">
                <div class="contract-grid">
                  <div>
                    <h3>输入端口</h3>
                    @for (port of version.input_ports; track port['key']) {
                      <div class="port"><b>{{ port['label'] || port['key'] }}</b><small>{{ port['data_type'] }} · {{ port['unit'] || '无单位' }}</small></div>
                    } @empty { <p class="muted">无输入端口</p> }
                  </div>
                  <div>
                    <h3>输出端口</h3>
                    @for (port of version.output_ports; track port['key']) {
                      <div class="port"><b>{{ port['label'] || port['key'] }}</b><small>{{ port['data_type'] }} · {{ port['unit'] || '无单位' }}</small></div>
                    } @empty { <p class="muted">无输出端口</p> }
                  </div>
                </div>
                <h3>默认推理参数</h3>
                <pre>{{ version.algorithm?.['default_params'] | json }}</pre>
                <details><summary>参数契约</summary><pre>{{ version.parameter_schema | json }}</pre></details>
              </div>
            }
            @if (activeTab() === 'training') {
              <div class="tab-body">
                @if (version.algorithm; as algorithm) {
                  <p><b>学习方式：</b>{{ algorithm['learning_paradigm'] || '规则方法' }}　<b>训练要求：</b>{{ algorithm['training_requirement'] || '无需训练' }}</p>
                  <p class="muted">模型策略：{{ algorithm['model_strategy'] || '无状态' }}</p>
                  @if (algorithm['training_requirement'] === 'required') {
                    <div class="training-card"><b>需要按数据集训练</b><p class="muted">训练任务通过独立 training_cpu 队列执行，生成的私有模型只能由创建者或管理员使用。</p><a class="secondary" routerLink="/tasks">查看训练任务</a></div>
                  } @else {
                    <div class="training-card">{{ operator.code === 'chronos2_flow_forecast' ? '预训练零样本，本版本不支持平台内训练。' : '此算子不需要平台训练。' }}</div>
                  }
                  <h3>训练默认参数</h3><pre>{{ algorithm['training_default_params'] | json }}</pre>
                }
              </div>
            }
            @if (activeTab() === 'versions') {
              <div class="tab-body">
                <h3>已登记算子版本</h3>
                @for (item of operator.versions || []; track item.id) {
                  <div class="version-row"><b>{{ item.version }}</b><span>{{ item.status }} · {{ item.maturity }}</span><span>{{ item.available ? '可用' : '不可用' }}</span></div>
                } @empty { <p class="muted">暂无版本记录。</p> }
                @if (activeRelease(operator); as release) { <div class="algorithm-ref">活动发布版本：{{ release.version }} · {{ release.status }}</div> }
              </div>
            }
            @if (activeTab() === 'documents') {
              <div class="tab-body">
                @if (documents().length === 0) { <p class="muted">该算子暂未发布文档。</p> }
                @for (doc of documents(); track doc.document_id) {
                  <h3>{{ doc.title }}</h3>
                  @for (docVersion of doc.versions; track docVersion.document_version_id) {
                    @if (docVersion.markdown) { <article class="markdown" [innerHTML]="renderMarkdown(docVersion.markdown)"></article> }
                  }
                }
              </div>
            }
            @if (activeTab() === 'usage') {
              <div class="tab-body usage-grid"><div><b>工作流引用</b><strong>—</strong></div><div><b>近 7 天运行</b><strong>—</strong></div><div><b>成功率</b><strong>—</strong></div><p class="muted">详细使用统计将在任务聚合接口接入后展示。</p></div>
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
    .tag-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 12px 0;
    }
    .tag {
      border-radius: 999px;
      background: #eef5ff;
      color: #205493;
      padding: 4px 9px;
      font-size: 12px;
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
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      border-bottom: 1px solid #e4e7ec;
      margin-bottom: 16px;
    }
    .tabs button {
      border-radius: 8px 8px 0 0;
      padding: 9px 12px;
      background: transparent;
      color: #667085;
      border-bottom: 2px solid transparent;
    }
    .tabs button.active {
      color: #0f67c9;
      border-bottom-color: #0f67c9;
      background: #f3f7ff;
    }
    .tab-body {
      min-height: 220px;
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
    .training-card {
      margin: 14px 0;
      padding: 14px;
      border: 1px solid #d8e6f7;
      border-radius: 10px;
      background: #f7fbff;
      display: grid;
      gap: 8px;
    }
    .version-row {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 12px;
      padding: 10px 0;
      border-bottom: 1px solid #eef1f5;
      color: #667085;
    }
    .version-row b {
      color: #172033;
    }
    .usage-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .usage-grid > div {
      display: grid;
      gap: 6px;
      padding: 14px;
      background: #f6f8fb;
      border-radius: 10px;
    }
    .usage-grid strong {
      font-size: 22px;
    }
    .markdown {
      line-height: 1.7;
      color: #344054;
    }
    .markdown pre {
      overflow: auto;
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
      .usage-grid,
      .version-row {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class OperatorCenterPage {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly notice = inject(NotificationService);
  private readonly sanitizer = inject(DomSanitizer);
  readonly operatorNames = inject(OperatorNameService);
  readonly operators = signal<OperatorSummary[]>([]);
  readonly templates = signal<WorkflowTemplateSummary[]>([]);
  readonly selected = signal<OperatorSummary | null>(null);
  readonly documents = signal<AlgorithmDocument[]>([]);
  readonly activeTab = signal<'overview' | 'contract' | 'training' | 'versions' | 'documents' | 'usage'>('overview');
  readonly message = signal('');
  query = '';
  kind = '';
  maturity = '';

  constructor() {
    this.kind = this.route.snapshot.queryParamMap.get('kind') || '';
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (['overview', 'contract', 'training', 'versions', 'documents', 'usage'].includes(tab || '')) {
      this.activeTab.set(tab as 'overview' | 'contract' | 'training' | 'versions' | 'documents' | 'usage');
    }
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
          if (this.selected()) this.loadDocuments(this.selected()!.code);
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
    this.documents.set([]);
    this.loadDocuments(operator.code);
    this.api
      .get<OperatorSummary>(`/api/v1/operators/${operator.code}`)
      .subscribe({ next: (detail) => { this.selected.set(detail); this.loadDocuments(detail.code); } });
  }
  setTab(tab: 'overview' | 'contract' | 'training' | 'versions' | 'documents' | 'usage'): void {
    this.activeTab.set(tab);
    if (tab === 'documents' && this.selected()) this.loadDocuments(this.selected()!.code);
  }
  algorithmTags(operator: OperatorSummary): Array<{ code: string; name: string }> {
    const tags = operator.active_version?.algorithm?.['tags'];
    return Array.isArray(tags)
      ? tags.map((tag) => ({ code: String((tag as Record<string, unknown>)['code'] || ''), name: String((tag as Record<string, unknown>)['name'] || '') }))
      : [];
  }
  algorithmDescription(operator: OperatorSummary): string {
    const manifest = operator.active_version?.algorithm?.['capability_manifest'];
    return manifest && typeof manifest === 'object' ? String((manifest as Record<string, unknown>)['description'] || '') : '';
  }
  activeRelease(operator: OperatorSummary): { version: string; status: string } | null {
    const release = operator.active_version?.algorithm?.['active_release'];
    if (!release || typeof release !== 'object') return null;
    const value = release as Record<string, unknown>;
    return { version: String(value['version'] || ''), status: String(value['status'] || '') };
  }
  loadDocuments(code: string): void {
    this.api.get<AlgorithmDocument[]>(`/api/v1/algorithms/${code}/documents`).subscribe({
      next: (documents) => this.documents.set(documents || []),
      error: () => this.documents.set([]),
    });
  }
  renderMarkdown(markdown: string): SafeHtml {
    const html = marked.parse(markdown, { async: false }) as string;
    return this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(html));
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
