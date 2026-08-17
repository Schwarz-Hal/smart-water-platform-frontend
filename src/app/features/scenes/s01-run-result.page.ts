import { CommonModule } from '@angular/common';
import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import {
  WorkflowArtifact,
  WorkflowNodeRun,
  WorkflowRunSummary,
} from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';

/** 从 artifact 中解析出的候选漏点 */
interface S01Candidate {
  id: string | number;
  start_time: string;
  end_time: string;
  risk_score: number;
  mean_risk_score?: number;
  evidence: { evidence?: string[]; point_count?: number; mean_risk_score?: number; scope?: string };
  status: string;
}

@Component({
  selector: 'app-s01-run-result-page',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  template: `
    <header class="page-head">
      <button class="back-btn" type="button" (click)="goBack()">← 返回场景中心</button>
      <div>
        <p class="eyebrow">S01 · 运行结果</p>
        <h1>DMA 分区漏损评估报告</h1>
        <p class="lead">运行 ID：{{ runId() }}</p>
      </div>
      <div class="header-actions">
        <button mat-stroked-button type="button" (click)="loadAll()">刷新</button>
      </div>
    </header>

    @if (loadError()) {
      <div class="alert error">{{ loadError() }}</div>
    }

    @if (run(); as detail) {
      <!-- 运行摘要 -->
      <section class="summary-grid">
        <div class="summary-card">
          <span class="label">运行状态</span>
          <span class="value" [class.success]="detail.status === 'success'" [class.failed]="detail.status === 'failed'">
            {{ statusLabel(detail.status) }}
          </span>
        </div>
        <div class="summary-card">
          <span class="label">数据质量分</span>
          <span class="value highlight">{{ qualityScore() != null ? qualityScore()!.toFixed(2) : '—' }}</span>
        </div>
        <div class="summary-card">
          <span class="label">候选漏点</span>
          <span class="value">{{ candidates().length }}</span>
        </div>
        <div class="summary-card">
          <span class="label">执行进度</span>
          <span class="value">{{ detail.progress }}%</span>
        </div>
      </section>

      <!-- 运行详情 -->
      <section class="card">
        <h2>运行详情</h2>
        <div class="detail-grid">
          <div class="detail-item"><span class="k">工作流</span><span class="v">{{ detail.workflow_name || '—' }}</span></div>
          <div class="detail-item"><span class="k">版本</span><span class="v">#{{ detail.workflow_version ?? '—' }}</span></div>
          <div class="detail-item"><span class="k">任务 ID</span><span class="v mono">{{ detail.task_id }}</span></div>
          <div class="detail-item"><span class="k">Trace ID</span><span class="v mono">{{ detail.trace_id }}</span></div>
          <div class="detail-item"><span class="k">创建时间</span><span class="v">{{ detail.created_at }}</span></div>
          <div class="detail-item"><span class="k">开始时间</span><span class="v">{{ detail.started_at || '—' }}</span></div>
          <div class="detail-item"><span class="k">结束时间</span><span class="v">{{ detail.finished_at || '—' }}</span></div>
          <div class="detail-item"><span class="k">节点</span><span class="v">{{ detail.node_success_count }}/{{ detail.node_count }} 成功</span></div>
        </div>
        @if (detail.error_message) {
          <div class="alert error" style="margin-top:16px">
            <strong>{{ detail.error_code }}：</strong>{{ detail.error_message }}
          </div>
        }
      </section>

      <!-- 节点执行 -->
      <section class="card">
        <h2>节点执行（{{ nodes().length }}）</h2>
        <div class="node-list">
          @for (node of nodes(); track node.id) {
            <div class="node-row" [class.failed]="node.status === 'failed'">
              <div class="node-main">
                <span class="node-order">{{ $index + 1 }}</span>
                <div class="node-info">
                  <div class="node-name">{{ nodeName(node) }}</div>
                  <div class="node-code">{{ node.node_code }}</div>
                </div>
                <span class="node-status" [class]="'st-' + node.status">{{ statusLabel(node.status) }}</span>
                <span class="node-progress">{{ node.progress }}%</span>
                <span class="node-time">
                  {{ node.started_at ? (node.finished_at ? duration(node.started_at, node.finished_at) : '运行中') : '—' }}
                </span>
              </div>
              @if (node.error_message) {
                <div class="node-error">{{ node.error_code }}：{{ node.error_message }}</div>
              }
            </div>
          } @empty {
            <p class="placeholder">暂无节点执行记录。</p>
          }
        </div>
      </section>

      <!-- 候选漏点 -->
      <section class="card">
        <h2>候选漏点（{{ candidates().length }}）</h2>
        @if (candidates().length) {
          <p class="hint">按风险分降序排列。候选仅用于人工核验，不代表漏点结论。</p>
          <div class="candidate-list">
            @for (c of sortedCandidates(); track c.id) {
              <div class="candidate-row">
                <div class="candidate-time">
                  <div class="time-range">{{ formatTime(c.start_time) }} — {{ formatTime(c.end_time) }}</div>
                  <div class="time-date">{{ formatDate(c.start_time) }}</div>
                </div>
                <div class="candidate-risk">
                  <div class="risk-bar">
                    <div class="risk-fill" [class.risk-high]="c.risk_score >= 0.8" [class.risk-mid]="c.risk_score >= 0.6 && c.risk_score < 0.8" [style.width.%]="c.risk_score * 100"></div>
                  </div>
                  <span class="risk-score" [class.risk-high]="c.risk_score >= 0.8" [class.risk-mid]="c.risk_score >= 0.6 && c.risk_score < 0.8">
                    {{ (c.risk_score * 100).toFixed(1) }}%
                  </span>
                </div>
                <div class="candidate-meta">
                  @if (c.evidence.point_count != null) {
                    <span>{{ c.evidence.point_count }} 个数据点</span>
                  }
                  <span class="cand-status" [class]="'cs-' + c.status">{{ candidateStatusLabel(c.status) }}</span>
                </div>
              </div>
            }
          </div>
        } @else {
          <p class="placeholder">未识别到候选漏点。</p>
        }
      </section>
    } @else if (!loadError()) {
      <div class="loading">
        <span class="spinner"></span>
        <span>正在读取运行结果…</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 960px;
      margin: 0 auto;
      color: var(--sw-text-primary);
    }
    .page-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 20px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .back-btn {
      background: none;
      border: none;
      color: var(--sw-color-primary);
      cursor: pointer;
      font-size: 13px;
      padding: 0 0 12px;
      font-weight: 600;
    }
    .back-btn:hover { text-decoration: underline; }
    .eyebrow {
      margin: 0;
      color: var(--sw-color-primary);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    h1 { margin: 4px 0 8px; font-size: clamp(24px, 3vw, 32px); }
    .lead { color: var(--sw-text-secondary); margin: 0; }
    .header-actions { display: flex; gap: 8px; }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .summary-card {
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .summary-card .label { font-size: 12px; color: var(--sw-text-muted); font-weight: 600; }
    .summary-card .value { font-size: 22px; font-weight: 700; }
    .summary-card .value.highlight { color: var(--sw-color-primary); }
    .summary-card .value.success { color: var(--sw-color-success); }
    .summary-card .value.failed { color: var(--sw-color-danger); }
    .card {
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      padding: 20px 24px;
      margin-bottom: 16px;
      box-shadow: var(--sw-shadow-sm);
    }
    .card h2 { margin: 0 0 16px; font-size: 17px; }
    .hint { margin: -8px 0 16px; color: var(--sw-text-muted); font-size: 13px; }
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px 24px;
    }
    .detail-item { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
    .detail-item .k { color: var(--sw-text-muted); }
    .detail-item .v { font-weight: 600; text-align: right; word-break: break-all; }
    .detail-item .v.mono { font-family: monospace; font-size: 12px; }
    .alert {
      padding: 12px 16px;
      border-radius: 10px;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .alert.error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
    .node-list { display: flex; flex-direction: column; gap: 8px; }
    .node-row {
      padding: 12px 16px;
      border: 1px solid var(--sw-border);
      border-radius: 10px;
      background: var(--sw-surface-raised);
    }
    .node-row.failed { border-color: var(--sw-color-danger); background: #fef2f2; }
    .node-main {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .node-order {
      width: 24px; height: 24px;
      display: grid; place-items: center;
      border-radius: 50%;
      background: var(--sw-surface-muted);
      font-size: 12px; font-weight: 700;
      color: var(--sw-text-secondary);
    }
    .node-info { flex: 1; min-width: 120px; }
    .node-name { font-size: 14px; font-weight: 600; }
    .node-code { font-size: 11px; color: var(--sw-text-muted); font-family: monospace; }
    .node-status {
      font-size: 11px; font-weight: 700;
      padding: 2px 8px; border-radius: 999px;
      background: var(--sw-surface-muted); color: var(--sw-text-muted);
    }
    .node-status.st-success { background: #dcfce7; color: #166534; }
    .node-status.st-failed { background: #fee2e2; color: #991b1b; }
    .node-status.st-running, .node-status.st-queued { background: #dbeafe; color: #1e40af; }
    .node-progress { font-size: 12px; color: var(--sw-text-secondary); min-width: 40px; }
    .node-time { font-size: 12px; color: var(--sw-text-muted); min-width: 60px; }
    .node-error { margin-top: 8px; font-size: 12px; color: #991b1b; }
    .placeholder { color: var(--sw-text-muted); font-size: 13px; text-align: center; padding: 20px; }
    .candidate-list { display: flex; flex-direction: column; gap: 10px; }
    .candidate-row {
      display: grid;
      grid-template-columns: 180px 1fr auto;
      gap: 16px;
      align-items: center;
      padding: 12px 16px;
      border: 1px solid var(--sw-border);
      border-radius: 10px;
      background: var(--sw-surface-raised);
    }
    .candidate-time .time-range { font-size: 13px; font-weight: 600; }
    .candidate-time .time-date { font-size: 11px; color: var(--sw-text-muted); }
    .candidate-risk { display: flex; align-items: center; gap: 10px; }
    .risk-bar { flex: 1; height: 8px; background: var(--sw-surface-muted); border-radius: 4px; overflow: hidden; }
    .risk-fill { height: 100%; background: var(--sw-color-success); transition: width 0.3s; }
    .risk-fill.risk-mid { background: #f59e0b; }
    .risk-fill.risk-high { background: var(--sw-color-danger); }
    .risk-score { font-size: 13px; font-weight: 700; min-width: 52px; text-align: right; }
    .risk-score.risk-mid { color: #b45309; }
    .risk-score.risk-high { color: var(--sw-color-danger); }
    .candidate-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; font-size: 12px; color: var(--sw-text-secondary); }
    .cand-status { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--sw-surface-muted); color: var(--sw-text-muted); }
    .cand-status.cs-confirmed { background: #fee2e2; color: #991b1b; }
    .cand-status.cs-excluded { background: #e5e7eb; color: #4b5563; }
    .loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 60px; color: var(--sw-text-secondary); }
    .spinner {
      width: 20px; height: 20px;
      border: 2px solid var(--sw-border);
      border-top-color: var(--sw-color-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 700px) {
      .summary-grid { grid-template-columns: repeat(2, 1fr); }
      .detail-grid { grid-template-columns: 1fr; }
      .candidate-row { grid-template-columns: 1fr; }
      .candidate-meta { align-items: flex-start; }
    }
  `,
})
export class S01RunResultPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ApiClient);
  private readonly notice = inject(NotificationService);

  readonly runId = signal('');
  readonly run = signal<WorkflowRunSummary | null>(null);
  readonly nodes = signal<WorkflowNodeRun[]>([]);
  readonly artifacts = signal<WorkflowArtifact[]>([]);
  readonly loadError = signal('');

  /** 从 artifacts 中解析出的质量分 */
  readonly qualityScore = computed<number | null>(() => {
    for (const artifact of this.artifacts()) {
      // scalar 类型且 semantic_type 含 quality
      if (artifact.data_type === 'scalar' && /quality/i.test(artifact.semantic_type || '')) {
        const value = Number((artifact.payload ?? artifact.preview)?.['value']);
        if (Number.isFinite(value)) return value;
      }
    }
    // 从 leakage_report 中提取
    const report = this.artifacts().find(
      (a) => a.data_type === 'report' && a.semantic_type === 'leakage_report',
    );
    if (report) {
      const root = report.payload ?? report.preview ?? {};
      const nested = root['payload'];
      const data = nested && typeof nested === 'object' ? nested : root;
      const qs = Number((data as Record<string, unknown>)['quality_score']);
      if (Number.isFinite(qs)) return qs;
    }
    return null;
  });

  /** 从 artifacts 中解析出的候选漏点列表 */
  readonly candidates = computed<S01Candidate[]>(() => {
    const result: S01Candidate[] = [];
    for (const artifact of this.artifacts()) {
      if (artifact.data_type !== 'candidate_list') continue;
      const payload = (artifact.payload ?? artifact.preview)?.['payload'];
      if (!Array.isArray(payload)) continue;
      for (let i = 0; i < payload.length; i++) {
        const row = payload[i] as Record<string, unknown>;
        if (!row || typeof row !== 'object') continue;
        const risk = Number(row['risk_score'] ?? row['max_risk_score'] ?? 0);
        result.push({
          id: String(row['id'] ?? `${artifact.id}-${i}`),
          start_time: String(row['start_time'] ?? row['start'] ?? ''),
          end_time: String(row['end_time'] ?? row['end'] ?? ''),
          risk_score: Number.isFinite(risk) ? risk : 0,
          mean_risk_score: Number(row['mean_risk_score']) || undefined,
          evidence: (row['evidence'] as S01Candidate['evidence']) || {},
          status: String(row['status'] ?? 'pending'),
        });
      }
    }
    // 如果没有 candidate_list，尝试从 leakage_report 中提取
    if (result.length === 0) {
      const report = this.artifacts().find(
        (a) => a.data_type === 'report' && a.semantic_type === 'leakage_report',
      );
      if (report) {
        const root = report.payload ?? report.preview ?? {};
        const nested = root['payload'];
        const data = (nested && typeof nested === 'object' ? nested : root) as Record<string, unknown>;
        const list = data['candidates'];
        if (Array.isArray(list)) {
          for (let i = 0; i < list.length; i++) {
            const row = list[i] as Record<string, unknown>;
            const risk = Number(row['risk_score'] ?? row['max_risk_score'] ?? 0);
            result.push({
              id: String(row['id'] ?? `report-${i}`),
              start_time: String(row['start_time'] ?? ''),
              end_time: String(row['end_time'] ?? ''),
              risk_score: Number.isFinite(risk) ? risk : 0,
              evidence: (row['evidence'] as S01Candidate['evidence']) || {},
              status: String(row['status'] ?? 'pending'),
            });
          }
        }
      }
    }
    return result;
  });

  readonly sortedCandidates = computed(() =>
    [...this.candidates()].sort((a, b) => b.risk_score - a.risk_score),
  );

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('runId') || '';
      this.runId.set(id);
      if (id) this.loadAll();
    });
  }

  loadAll(): void {
    const id = this.runId();
    if (!id) return;
    this.loadError.set('');
    forkJoin({
      run: this.api.get<WorkflowRunSummary>(`/api/v1/workflow-runs/${id}`),
      nodes: this.api.get<WorkflowNodeRun[]>(`/api/v1/workflow-runs/${id}/nodes`),
      artifacts: this.api.get<WorkflowArtifact[]>(`/api/v1/workflow-runs/${id}/artifacts`),
    }).subscribe({
      next: ({ run, nodes, artifacts }) => {
        this.run.set(run);
        this.nodes.set(nodes);
        this.artifacts.set(artifacts);
      },
      error: (err) => {
        const message = err?.error?.detail || err?.message || '读取运行结果失败';
        this.loadError.set(message);
        this.notice.error(message);
      },
    });
  }

  nodeName(node: WorkflowNodeRun): string {
    // 尝试从 params_snapshot 中获取 label，否则用 node_code
    const params = node.params_snapshot as Record<string, unknown> | undefined;
    const label = params?.['label'] ?? params?.['node_name'];
    if (typeof label === 'string' && label) return label;
    return node.node_code;
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      queued: '排队中',
      running: '运行中',
      success: '成功',
      failed: '失败',
      cancelled: '已取消',
      skipped: '已跳过',
    };
    return map[status] || status;
  }

  candidateStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: '待核验',
      confirmed: '已确认',
      excluded: '已排除',
      investigating: '核查中',
    };
    return map[status] || status;
  }

  duration(start: string, end: string): string {
    try {
      const ms = new Date(end).getTime() - new Date(start).getTime();
      if (ms < 1000) return `${ms}ms`;
      const sec = Math.floor(ms / 1000);
      if (sec < 60) return `${sec}s`;
      const min = Math.floor(sec / 60);
      return `${min}m${sec % 60}s`;
    } catch {
      return '—';
    }
  }

  formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    } catch {
      return iso;
    }
  }

  goBack(): void {
    void this.router.navigate(['/scenes']);
  }
}
