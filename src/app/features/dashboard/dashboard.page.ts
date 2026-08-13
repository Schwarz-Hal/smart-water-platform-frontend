import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

import { PortalSummary, PortalWorkloadLevel } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';

export interface PortalStatCard {
  label: string;
  value: number;
  note: string;
}

export function portalStatCards(summary: PortalSummary): PortalStatCard[] {
  const cards: PortalStatCard[] = [];
  if (summary.stats.active_users !== null) {
    cards.push({ label: '有效用户', value: summary.stats.active_users, note: '当前平台' });
  }
  cards.push(
    { label: '数据资产', value: summary.stats.data_assets, note: '可用于分析' },
    { label: '工作流', value: summary.stats.workflows, note: '当前可见范围' },
    { label: '运行中任务', value: summary.stats.running_tasks, note: '正在执行' },
    { label: '近 7 日完成', value: summary.stats.completed_runs_7d, note: '工作流运行' },
    { label: '近 24 小时失败', value: summary.stats.failed_tasks_24h, note: '需要关注' },
  );
  return cards;
}

export function workloadLabel(level: PortalWorkloadLevel): string {
  return {
    idle: '空闲',
    normal: '正常',
    busy: '繁忙',
    strained: '高负载',
    degraded: '服务降级',
  }[level];
}

@Component({
  selector: 'app-dashboard-page',
  imports: [BeijingTimePipe, MatButtonModule, RouterLink, StatusChipComponent],
  template: `
    <header class="hero">
      <div>
        <p class="eyebrow">智慧水务算法管理平台</p>
        <h1>欢迎回来，{{ auth.user()?.display_name || auth.user()?.username }}</h1>
        <p>从数据接入到算子编排、任务运行和结果分析，在一个平台完成水务分析流程。</p>
      </div>
      <nav class="hero-actions" aria-label="快捷操作">
        <a mat-flat-button routerLink="/data-sources">上传数据</a>
        <a mat-stroked-button routerLink="/workflows/new">创建工作流</a>
        <a mat-stroked-button routerLink="/operators">进入算子中心</a>
      </nav>
    </header>

    @if (loading()) {
      <section class="loading" aria-busy="true">正在读取平台概览…</section>
    } @else if (error()) {
      <section class="offline">
        <div>
          <strong>平台概览暂时不可用</strong>
          <p>业务服务可能正在启动，请稍后重试。</p>
        </div>
        <button mat-stroked-button type="button" (click)="reload()">重新加载</button>
      </section>
    } @else if (summary(); as portal) {
      <section class="stats" aria-label="平台统计">
        @for (card of statCards(); track card.label) {
          <article>
            <span>{{ card.label }}</span
            ><strong>{{ card.value }}</strong
            ><small>{{ card.note }}</small>
          </article>
        }
      </section>

      <section class="workload" [attr.data-level]="portal.workload.level">
        <div class="workload-title">
          <span class="pulse"></span>
          <div>
            <small>平台负载</small><strong>{{ workloadLabel(portal.workload.level) }}</strong>
          </div>
        </div>
        <dl>
          <div>
            <dt>排队</dt>
            <dd>{{ portal.workload.queued }}</dd>
          </div>
          <div>
            <dt>运行中</dt>
            <dd>{{ portal.workload.running }}</dd>
          </div>
          <div>
            <dt>恢复中</dt>
            <dd>{{ portal.workload.retrying }}</dd>
          </div>
          <div>
            <dt>最长等待</dt>
            <dd>{{ waitLabel(portal.workload.oldest_wait_seconds) }}</dd>
          </div>
        </dl>
        <p>{{ workloadMessage(portal.workload.level) }}</p>
      </section>

      <section class="quick-start section-card">
        <div class="section-heading">
          <div>
            <p class="eyebrow">快速开始</p>
            <h2>完成一次分析只需四步</h2>
          </div>
        </div>
        <ol>
          <li>
            <span>1</span>
            <div>
              <strong>上传数据</strong>
              <p>接入 CSV 或只读 MySQL 数据源。</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>选择流程</strong>
              <p>使用内置结构或新建自己的工作流。</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>发布运行</strong>
              <p>绑定数据、调整参数并异步执行。</p>
            </div>
          </li>
          <li>
            <span>4</span>
            <div>
              <strong>查看报告</strong>
              <p>查看节点结果、风险候选和分析报告。</p>
            </div>
          </li>
        </ol>
      </section>

      <section class="recent-grid">
        <article class="section-card">
          <div class="section-heading">
            <h2>最近数据资产</h2>
            <a routerLink="/data-sources">查看全部</a>
          </div>
          <div class="resource-list">
            @for (item of portal.recent_datasets; track item.id) {
              <a [routerLink]="['/datasets', item.id]">
                <span
                  ><strong>{{ item.name }}</strong
                  ><small
                    >{{ item.source_type || '时序数据' }} ·
                    {{ item.latest_version?.record_count || 0 }} 条</small
                  ></span
                >
                <time>{{ item.updated_at | beijingTime: 'MM-dd HH:mm' }}</time>
              </a>
            } @empty {
              <p class="empty">尚无数据资产，先上传一份数据开始分析。</p>
            }
          </div>
        </article>
        <article class="section-card">
          <div class="section-heading">
            <h2>最近工作流</h2>
            <a routerLink="/workflows">查看全部</a>
          </div>
          <div class="resource-list">
            @for (item of portal.recent_workflows; track item.id) {
              <a [routerLink]="['/workflows', item.id, 'edit']">
                <span
                  ><strong>{{ item.workflow_name }}</strong
                  ><small>{{ item.status }} · 草稿 #{{ item.draft_revision }}</small></span
                >
                <time>{{ item.updated_at | beijingTime: 'MM-dd HH:mm' }}</time>
              </a>
            } @empty {
              <p class="empty">尚无工作流，可从内置结构快速创建。</p>
            }
          </div>
        </article>
        <article class="section-card">
          <div class="section-heading">
            <h2>最近任务</h2>
            <a routerLink="/tasks">查看全部</a>
          </div>
          <div class="resource-list">
            @for (item of portal.recent_tasks; track item.task_id) {
              <a [routerLink]="['/tasks', item.task_id]">
                <span
                  ><strong>{{ taskLabel(item.task_type) }}</strong
                  ><small
                    >{{ item.progress }}% ·
                    {{ item.updated_at | beijingTime: 'MM-dd HH:mm' }}</small
                  ></span
                >
                <app-status-chip [status]="item.status" />
              </a>
            } @empty {
              <p class="empty">尚无任务记录。</p>
            }
          </div>
        </article>
      </section>

      <section class="capabilities">
        <article>
          <span>01</span>
          <h3>数据治理</h3>
          <p>质量分析、缺失修复、异常处理与可追溯派生版本。</p>
        </article>
        <article>
          <span>02</span>
          <h3>算子管理</h3>
          <p>统一管理输入输出契约、参数、运行时和算法版本。</p>
        </article>
        <article>
          <span>03</span>
          <h3>DAG 编排</h3>
          <p>通过可视化节点连接，将多个步骤组合成可复用流程。</p>
        </article>
        <article>
          <span>04</span>
          <h3>场景分析</h3>
          <p>以内置工作流支撑漏损评估等智慧水务业务场景。</p>
        </article>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      color: var(--sw-text-primary);
    }
    h1,
    h2,
    h3,
    p,
    dl,
    dd {
      margin: 0;
    }
    .hero {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 24px;
      padding: 26px;
      border-radius: var(--sw-radius-lg);
      background: linear-gradient(125deg, #073763, #0f6f8f 68%, #168aa2);
      color: white;
      box-shadow: var(--sw-shadow-md);
    }
    .hero h1 {
      margin: 4px 0 8px;
      font-size: clamp(26px, 3vw, 38px);
    }
    .hero p:not(.eyebrow) {
      max-width: 680px;
      color: #d9f2f7;
      line-height: 1.65;
    }
    .eyebrow {
      color: var(--sw-color-primary);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .hero .eyebrow {
      color: #9ee8f3;
    }
    .hero-actions {
      display: flex;
      gap: 9px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .hero-actions a:first-child {
      background: white;
      color: #075985;
    }
    .hero-actions a:not(:first-child) {
      border-color: #8bd8e5;
      color: white;
    }
    .loading,
    .offline {
      margin-top: 18px;
      padding: 28px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      background: var(--sw-surface);
    }
    .offline {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 18px;
    }
    .offline p {
      margin-top: 5px;
      color: var(--sw-text-muted);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin: 18px 0 12px;
    }
    .stats article {
      padding: 16px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
    }
    .stats span,
    .stats small {
      display: block;
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .stats strong {
      display: block;
      margin: 7px 0 5px;
      font-size: 28px;
    }
    .workload {
      display: grid;
      grid-template-columns: minmax(170px, auto) 1fr minmax(200px, auto);
      align-items: center;
      gap: 22px;
      padding: 16px 20px;
      border: 1px solid var(--sw-border);
      border-left: 5px solid var(--sw-color-success);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface);
    }
    .workload[data-level='busy'] {
      border-left-color: var(--sw-color-warning);
    }
    .workload[data-level='strained'],
    .workload[data-level='degraded'] {
      border-left-color: var(--sw-color-danger);
    }
    .workload-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .workload-title small,
    .workload-title strong {
      display: block;
    }
    .workload-title small {
      color: var(--sw-text-muted);
    }
    .workload-title strong {
      margin-top: 2px;
      font-size: 20px;
    }
    .pulse {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background: var(--sw-color-success);
      box-shadow: 0 0 0 5px var(--sw-color-success-soft);
    }
    .workload[data-level='busy'] .pulse {
      background: var(--sw-color-warning);
      box-shadow: 0 0 0 5px var(--sw-color-warning-soft);
    }
    .workload[data-level='strained'] .pulse,
    .workload[data-level='degraded'] .pulse {
      background: var(--sw-color-danger);
      box-shadow: 0 0 0 5px var(--sw-color-danger-soft);
    }
    .workload dl {
      display: grid;
      grid-template-columns: repeat(4, minmax(70px, 1fr));
      gap: 10px;
    }
    .workload dl div {
      padding-inline: 10px;
      border-left: 1px solid var(--sw-border);
    }
    .workload dt {
      color: var(--sw-text-muted);
      font-size: 11px;
    }
    .workload dd {
      margin-top: 3px;
      font-weight: 800;
    }
    .workload > p {
      color: var(--sw-text-secondary);
      font-size: 12px;
      text-align: right;
    }
    .section-card {
      margin-top: 16px;
      padding: 20px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      background: var(--sw-surface);
      box-shadow: var(--sw-shadow-sm);
    }
    .section-heading {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 14px;
    }
    .section-heading h2 {
      margin-top: 3px;
      font-size: 20px;
    }
    .section-heading a {
      color: var(--sw-color-primary);
      text-decoration: none;
      font-size: 13px;
    }
    .quick-start ol {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin: 18px 0 0;
      padding: 0;
      list-style: none;
    }
    .quick-start li {
      display: flex;
      gap: 11px;
      min-width: 0;
      padding: 14px;
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-muted);
    }
    .quick-start li > span {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--sw-color-primary);
      color: white;
      font-weight: 800;
    }
    .quick-start p {
      margin-top: 5px;
      color: var(--sw-text-muted);
      font-size: 12px;
      line-height: 1.5;
    }
    .recent-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }
    .resource-list {
      display: grid;
      gap: 7px;
      margin-top: 14px;
    }
    .resource-list > a {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      min-width: 0;
      padding: 11px;
      border: 1px solid transparent;
      border-radius: var(--sw-radius-md);
      color: inherit;
      text-decoration: none;
      background: var(--sw-surface-muted);
    }
    .resource-list > a:hover {
      border-color: var(--sw-color-primary);
    }
    .resource-list > a > span {
      min-width: 0;
    }
    .resource-list strong,
    .resource-list small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .resource-list small,
    .resource-list time {
      margin-top: 4px;
      color: var(--sw-text-muted);
      font-size: 11px;
    }
    .resource-list time {
      flex: 0 0 auto;
    }
    .empty {
      padding: 18px 8px;
      color: var(--sw-text-muted);
      font-size: 13px;
      text-align: center;
    }
    .capabilities {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .capabilities article {
      padding: 18px;
      border-radius: var(--sw-radius-md);
      background: linear-gradient(150deg, var(--sw-surface), var(--sw-surface-muted));
      border: 1px solid var(--sw-border);
    }
    .capabilities span {
      color: var(--sw-color-primary);
      font-weight: 900;
    }
    .capabilities h3 {
      margin: 8px 0 6px;
    }
    .capabilities p {
      color: var(--sw-text-muted);
      font-size: 12px;
      line-height: 1.6;
    }
    @media (max-width: 1100px) {
      .recent-grid {
        grid-template-columns: 1fr 1fr;
      }
      .recent-grid article:last-child {
        grid-column: 1 / -1;
      }
      .capabilities {
        grid-template-columns: 1fr 1fr;
      }
      .workload {
        grid-template-columns: 1fr;
      }
      .workload > p {
        text-align: left;
      }
    }
    @media (max-width: 720px) {
      .hero {
        align-items: stretch;
        flex-direction: column;
        padding: 20px;
      }
      .hero-actions {
        justify-content: stretch;
      }
      .hero-actions a {
        flex: 1 1 130px;
      }
      .quick-start ol,
      .recent-grid,
      .capabilities {
        grid-template-columns: 1fr;
      }
      .recent-grid article:last-child {
        grid-column: auto;
      }
      .workload dl {
        grid-template-columns: 1fr 1fr;
      }
    }
  `,
})
export class DashboardPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiClient);
  readonly summary = signal<PortalSummary | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly statCards = computed(() => (this.summary() ? portalStatCards(this.summary()!) : []));
  workloadLabel = workloadLabel;

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.get<PortalSummary>('/api/v1/portal/summary').subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: () => {
        this.summary.set(null);
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  waitLabel(seconds: number): string {
    if (seconds < 60) return `${seconds} 秒`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`;
    return `${Math.floor(seconds / 3600)} 小时`;
  }

  workloadMessage(level: PortalWorkloadLevel): string {
    return level === 'degraded'
      ? '部分平台能力暂不可用，请稍后重试。'
      : level === 'strained'
        ? '任务积压较多，新的运行可能需要等待。'
        : level === 'busy'
          ? '当前任务较多，平台仍可正常使用。'
          : '平台运行稳定，可以开始新的分析。';
  }

  taskLabel(type: string): string {
    return (
      (
        { workflow: '工作流运行', ingestion: '数据导入', dataset_purge: '数据清理' } as Record<
          string,
          string
        >
      )[type] ?? type
    );
  }
}
