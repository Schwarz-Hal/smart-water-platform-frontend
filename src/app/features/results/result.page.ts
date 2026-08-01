import { DecimalPipe, JsonPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { AlgorithmResult, TaskDetail, TimeSeriesPoint } from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  TimeSeriesChartComponent,
  TimeSeriesLine,
} from '../../shared/components/time-series-chart.component';

@Component({
  selector: 'app-result-page',
  imports: [
    DecimalPipe,
    JsonPipe,
    MatButtonModule,
    MatCardModule,
    RouterLink,
    TimeSeriesChartComponent,
  ],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">算法结果</p>
        <h1>{{ result()?.result_type || '正在读取结果' }}</h1>
        <p>任务 {{ taskId }}</p>
      </div>
      <a mat-stroked-button [routerLink]="['/tasks', taskId]">返回任务</a>
    </header>
    @if (result(); as current) {
      <section class="meta">
        <mat-card
          ><p>指标</p>
          <strong>{{ current.metric_code || '—' }}</strong></mat-card
        ><mat-card
          ><p>输入范围</p>
          <strong
            >{{ current.input_time_start || '—' }} 至 {{ current.input_time_end || '—' }}</strong
          ></mat-card
        ><mat-card
          ><p>trace_id</p>
          <strong class="mono">{{ current.trace_id }}</strong></mat-card
        >
      </section>
      @if (current.result_type === 'quality') {
        <section class="quality-grid">
          @for (item of qualityItems(); track item.key) {
            <mat-card
              ><p>{{ item.label }}</p>
              <strong
                >{{ item.value | number: '1.1-3' }}{{ item.key === 'qscore' ? '' : '%' }}</strong
              ></mat-card
            >
          }
        </section>
      }
      @if (current.result_type === 'forecast') {
        <section class="panel">
          <app-time-series-chart
            title="实际流量与预测区间"
            yAxisName="流量"
            [lines]="chartLines()"
          />
        </section>
      }
      @if (current.result_type === 'anomaly') {
        <section class="panel">
          <app-time-series-chart title="Hampel 异常检测" yAxisName="流量" [lines]="chartLines()" />
          <p class="hint">
            红色散点表示算法标签为异常的观测点；阈值 {{ payloadNumber('threshold') ?? '—' }}。
          </p>
        </section>
      }
      <section class="panel">
        <h2>结果元数据</h2>
        <pre>{{ current.payload['metadata'] | json }}</pre>
      </section>
    } @else {
      <div class="empty">结果尚未生成或任务未成功。请先回到任务页确认终态。</div>
    }
  `,
  styles: `
    .page-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
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
    .page-head p:not(.eyebrow) {
      color: #64748b;
      font-family: ui-monospace, monospace;
    }
    .meta,
    .quality-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 14px;
      margin-bottom: 16px;
    }
    mat-card,
    .panel {
      padding: 18px;
    }
    .meta p,
    .quality-grid p,
    .hint {
      color: #64748b;
    }
    .meta strong {
      word-break: break-word;
    }
    .mono {
      font-family: ui-monospace, monospace;
      font-size: 12px;
    }
    .quality-grid strong {
      font-size: 28px;
      color: #0f4c81;
    }
    .panel {
      margin-top: 16px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
    }
    pre {
      overflow: auto;
      background: #f8fafc;
      padding: 12px;
      border-radius: 8px;
      font-size: 12px;
    }
    .empty {
      padding: 36px;
      text-align: center;
      color: #64748b;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
    }
    @media (max-width: 700px) {
      .page-head {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  `,
})
export class ResultPage {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiClient);
  private readonly notifications = inject(NotificationService);
  readonly taskId = this.route.snapshot.paramMap.get('taskId') ?? '';
  readonly result = signal<AlgorithmResult | null>(null);
  readonly timeSeries = signal<TimeSeriesPoint[]>([]);
  readonly chartLines = signal<TimeSeriesLine[]>([]);

  constructor() {
    this.load();
  }

  payloadNumber(key: string): number | null {
    const value = this.result()?.payload[key];
    return typeof value === 'number' ? value : null;
  }
  qualityItems(): Array<{ key: string; label: string; value: number }> {
    const labels: Record<string, string> = {
      qscore: 'Qscore',
      completeness: '完整性',
      timeliness: '及时性',
      uniqueness: '唯一性',
      validity: '有效性',
      stability: '稳定性',
    };
    return Object.entries(labels).flatMap(([key, label]) => {
      const value = this.payloadNumber(key);
      return value === null ? [] : [{ key, label, value: key === 'qscore' ? value : value * 100 }];
    });
  }

  private load(): void {
    if (!this.taskId) return;
    this.api.get<TaskDetail>(`/api/v1/tasks/${this.taskId}`).subscribe({
      next: (task) => this.loadResult(task),
      error: (error: unknown) => this.notifications.error(error, '读取任务失败。'),
    });
  }

  private loadResult(task: TaskDetail): void {
    this.api.get<AlgorithmResult[]>(`/api/v1/results/tasks/${this.taskId}`).subscribe({
      next: (results) => {
        const result = results[0] ?? null;
        this.result.set(result);
        if (result && task.dataset_version_id) {
          this.api
            .get<TimeSeriesPoint[]>('/api/v1/timeseries', {
              dataset_version_id: task.dataset_version_id,
              metric_code: result.metric_code ?? 'flow',
              monitor_point_id: result.monitor_point_id,
              limit: 1000,
            })
            .subscribe({
              next: (points) => {
                this.timeSeries.set(points);
                this.buildChart(result, points);
              },
              error: () => this.buildChart(result, []),
            });
        } else if (result) this.buildChart(result, []);
      },
      error: (error: unknown) => this.notifications.error(error, '结果尚未生成。'),
    });
  }

  private buildChart(result: AlgorithmResult, points: TimeSeriesPoint[]): void {
    const actual: TimeSeriesLine = {
      name: '处理后流量',
      color: '#2563eb',
      data: points.map((point) => [point.time, point.processed_value ?? point.raw_value]),
    };
    if (result.result_type === 'forecast') {
      const values = this.numberArray(result.payload['values']);
      const lower = this.numberArray(result.payload['lower']);
      const upper = this.numberArray(result.payload['upper']);
      const last = points.length ? Date.parse(points[points.length - 1].time) : Date.now();
      const times = values.map((_, index) =>
        new Date(last + (index + 1) * 15 * 60 * 1000).toISOString(),
      );
      this.chartLines.set([
        actual,
        {
          name: '预测值',
          color: '#0f4c81',
          data: values.map((value, index) => [times[index], value]),
        },
        {
          name: '下界',
          color: '#93c5fd',
          dashed: true,
          data: lower.map((value, index) => [times[index], value]),
        },
        {
          name: '上界',
          color: '#93c5fd',
          dashed: true,
          data: upper.map((value, index) => [times[index], value]),
        },
      ]);
      return;
    }
    if (result.result_type === 'anomaly') {
      const labels = this.numberArray(result.payload['labels']);
      const anomalies: TimeSeriesLine = {
        name: '异常点',
        color: '#dc2626',
        type: 'scatter',
        data: points.flatMap((point, index) =>
          labels[index]
            ? [[point.time, point.processed_value ?? point.raw_value] as [string, number | null]]
            : [],
        ),
      };
      this.chartLines.set([actual, anomalies]);
      return;
    }
    this.chartLines.set([actual]);
  }

  private numberArray(value: unknown): number[] {
    return Array.isArray(value)
      ? value.filter((item): item is number => typeof item === 'number')
      : [];
  }
}
