import { DecimalPipe, JsonPipe } from '@angular/common';
import { Component, Input, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

import { WorkflowArtifact } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { TimeSeriesChartComponent } from '../../shared/components/time-series-chart.component';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';
import {
  candidateMeanRisk,
  candidateRisk,
  leakageCandidates,
  leakageEvidenceTypes,
  leakageRiskLine,
  leakageRiskSummary,
  unwrapLeakageReport,
} from './s01-leakage-report';

@Component({
  selector: 'app-s01-leakage-report',
  imports: [BeijingTimePipe, DecimalPipe, JsonPipe, MatButtonModule, TimeSeriesChartComponent],
  template: `
    <section class="report-overview">
      <div class="metric-grid">
        <article>
          <span>候选事件</span><strong>{{ candidates().length }}</strong>
        </article>
        <article>
          <span>最高风险</span><strong>{{ summary().maximum | number: '1.2-3' }}</strong>
        </article>
        <article>
          <span>平均风险</span><strong>{{ summary().mean | number: '1.2-3' }}</strong>
        </article>
        <article>
          <span>质量门</span><strong>{{ qualityGateLabel() }}</strong>
        </article>
      </div>

      <div class="coverage">
        <span>风险覆盖时间</span>
        <strong
          >{{ summary().startTime | beijingTime }} 至 {{ summary().endTime | beijingTime }}</strong
        >
      </div>

      @if (riskLines().length) {
        <app-time-series-chart
          title="DMA 漏损风险时间线"
          yAxisName="风险分数"
          [lines]="riskLines()"
        />
      }

      <section class="evidence">
        <h3>证据类型</h3>
        <div>
          @for (item of evidenceTypes(); track item) {
            <span>{{ evidenceLabel(item) }}</span>
          } @empty {
            <span>暂无证据摘要</span>
          }
        </div>
      </section>

      <section>
        <h3>高风险候选</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>开始</th>
                <th>结束</th>
                <th>最高风险</th>
                <th>平均风险</th>
                <th>证据</th>
              </tr>
            </thead>
            <tbody>
              @for (candidate of candidates(); track $index) {
                <tr>
                  <td>{{ text(candidate['start_time']) | beijingTime }}</td>
                  <td>{{ text(candidate['end_time']) | beijingTime }}</td>
                  <td>{{ risk(candidate) | number: '1.2-3' }}</td>
                  <td>{{ meanRisk(candidate) | number: '1.2-3' }}</td>
                  <td>{{ candidateEvidence(candidate) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <aside class="verification">
        分析结果为 DMA 级漏损候选，仍需结合现场巡检和业务记录核验。
      </aside>

      <details>
        <summary>诊断数据</summary>
        <div class="diagnostic-actions">
          <button mat-stroked-button type="button" (click)="loadFull()" [disabled]="loading()">
            {{ loading() ? '正在加载…' : '加载完整数据' }}
          </button>
          <button mat-stroked-button type="button" (click)="downloadFull()">下载完整 JSON</button>
        </div>
        @if (loadError()) {
          <p class="error">{{ loadError() }}</p>
        }
        <pre>{{ diagnosticPayload() | json }}</pre>
      </details>
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .report-overview {
      display: grid;
      gap: 16px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
    }
    .metric-grid article {
      padding: 14px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-raised);
    }
    .metric-grid span,
    .coverage span {
      display: block;
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .metric-grid strong {
      display: block;
      margin-top: 5px;
      color: var(--sw-text-primary);
      font-size: 24px;
    }
    .coverage {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      padding: 12px 14px;
      border-radius: var(--sw-radius-md);
      background: var(--sw-color-info-soft);
    }
    h3 {
      margin: 0 0 8px;
      font-size: 14px;
    }
    .evidence > div {
      display: flex;
      gap: 7px;
      flex-wrap: wrap;
    }
    .evidence span {
      padding: 5px 9px;
      border-radius: 999px;
      background: var(--sw-surface-muted);
      color: var(--sw-text-secondary);
      font-size: 12px;
    }
    .table-wrap {
      overflow: auto;
      max-height: 360px;
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-md);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th,
    td {
      padding: 9px 10px;
      border-bottom: 1px solid var(--sw-border);
      text-align: left;
      white-space: nowrap;
    }
    th {
      position: sticky;
      top: 0;
      background: var(--sw-surface-muted);
      color: var(--sw-text-muted);
    }
    .verification {
      padding: 12px 14px;
      border-left: 4px solid var(--sw-color-warning);
      background: var(--sw-color-warning-soft);
      color: var(--sw-text-secondary);
    }
    details {
      border-top: 1px solid var(--sw-border);
      padding-top: 12px;
    }
    summary {
      cursor: pointer;
      font-weight: 700;
    }
    .diagnostic-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 10px 0;
    }
    pre {
      max-height: 360px;
      overflow: auto;
      padding: 12px;
      border-radius: var(--sw-radius-md);
      background: var(--sw-surface-muted);
      font-size: 12px;
    }
    .error {
      color: var(--sw-color-danger);
    }
    @media (max-width: 640px) {
      .coverage {
        flex-direction: column;
      }
    }
  `,
})
export class S01LeakageReportComponent {
  private readonly api = inject(ApiClient);
  private readonly fullArtifact = signal<WorkflowArtifact | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal('');
  @Input({ required: true }) artifact!: WorkflowArtifact;

  readonly report = computed(() => unwrapLeakageReport(this.fullArtifact() ?? this.artifact));
  readonly candidates = computed(() =>
    [...leakageCandidates(this.report())].sort(
      (left, right) => candidateRisk(right) - candidateRisk(left),
    ),
  );
  readonly summary = computed(() => leakageRiskSummary(this.report()));
  readonly riskLines = computed(() => leakageRiskLine(this.report()));
  readonly evidenceTypes = computed(() => leakageEvidenceTypes(this.report()));
  readonly diagnosticPayload = computed(
    () => this.fullArtifact()?.payload ?? this.artifact.preview,
  );

  risk = candidateRisk;
  meanRisk = candidateMeanRisk;

  text(value: unknown): string | null {
    return value === null || value === undefined ? null : String(value);
  }

  qualityGateLabel(): string {
    const gate = this.report()['quality_gate'];
    if (!gate || typeof gate !== 'object') return '未记录';
    const passed = (gate as Record<string, unknown>)['passed'];
    return passed === true ? '通过' : passed === false ? '未通过' : '未记录';
  }

  candidateEvidence(candidate: Record<string, unknown>): string {
    const evidence = candidate['evidence'];
    return Array.isArray(evidence)
      ? evidence.map((item) => this.evidenceLabel(String(item))).join('、')
      : '—';
  }

  evidenceLabel(value: string): string {
    return (
      {
        night_flow_score: '夜间流量',
        balance_score: '水量平衡',
        residual_score: '基线残差',
        persistence_score: '持续变化',
      }[value] ?? value
    );
  }

  loadFull(): void {
    if (this.fullArtifact() || this.loading()) return;
    this.loading.set(true);
    this.loadError.set('');
    this.api
      .get<WorkflowArtifact>(`/api/v1/workflow-artifacts/${this.artifact.id}`, { full: true })
      .subscribe({
        next: (artifact) => {
          this.fullArtifact.set(artifact);
          this.loading.set(false);
        },
        error: () => {
          this.loadError.set('完整诊断数据加载失败，请稍后重试。');
          this.loading.set(false);
        },
      });
  }

  downloadFull(): void {
    this.api.download(`/api/v1/workflow-artifacts/${this.artifact.id}/content`).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `workflow-artifact-${this.artifact.id}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.loadError.set('完整 JSON 下载失败，请稍后重试。'),
    });
  }
}
