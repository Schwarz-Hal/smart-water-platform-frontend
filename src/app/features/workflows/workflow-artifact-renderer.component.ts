import { DecimalPipe, JsonPipe } from '@angular/common';
import { Component, Input } from '@angular/core';

import { WorkflowArtifact } from '../../core/models/api.models';
import {
  TimeSeriesChartComponent,
  TimeSeriesLine,
} from '../../shared/components/time-series-chart.component';

@Component({
  selector: 'app-workflow-artifact-renderer',
  imports: [DecimalPipe, JsonPipe, TimeSeriesChartComponent],
  template: `
    @if (artifact; as item) {
      <section class="artifact-head">
        <div>
          <strong
            >{{ item.node_code || item.node_instance_id || '节点' }} · {{ item.port_key }}</strong
          >
          <small>{{ item.data_type }}{{ item.unit ? ' · ' + item.unit : '' }}</small>
        </div>
        <span class="storage"
          >{{ item.storage === 'minio' ? 'MinIO 对象' : 'MySQL 内联' }} ·
          {{ item.size_bytes | number }} B</span
        >
      </section>
      @if (item.data_type === 'timeseries') {
        <app-time-series-chart
          title="节点时序输出"
          [yAxisName]="item.unit || '数值'"
          [lines]="timeSeriesLines(item)"
        />
      } @else if (item.data_type === 'candidate_list') {
        <div class="candidate-summary">
          <strong>{{ candidateRows(item).length }}</strong
          ><span>个候选事件（预览）</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>开始</th>
                <th>结束</th>
                <th>风险分数</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              @for (row of candidateRows(item); track $index) {
                <tr>
                  <td>{{ text(row['start_time'] ?? row['start'] ?? '—') }}</td>
                  <td>{{ text(row['end_time'] ?? row['end'] ?? '—') }}</td>
                  <td>{{ number(row['risk_score'] ?? row['score']) | number: '1.2-3' }}</td>
                  <td>{{ text(row['status'] ?? 'pending') }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (item.data_type === 'table') {
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                @for (column of tableColumns(item); track column) {
                  <th>{{ column }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of tableRows(item); track $index) {
                <tr>
                  @for (column of tableColumns(item); track column) {
                    <td>{{ text(row[column]) }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (item.data_type === 'scalar' || item.data_type === 'boolean') {
        <div class="scalar">
          <strong>{{ scalarValue(item) }}</strong
          ><span>{{ item.semantic_type || item.data_type }}</span>
        </div>
      } @else if (item.data_type === 'report') {
        <div class="report">
          <h3>评估摘要</h3>
          <pre>{{ reportPayload(item) | json }}</pre>
        </div>
      } @else {
        <pre class="json">{{ payload(item) | json }}</pre>
      }
      @if (truncated(item)) {
        <p class="hint">当前显示的是预览，可使用下载接口获取完整结果。</p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .artifact-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 10px;
    }
    .artifact-head strong,
    .artifact-head small {
      display: block;
      overflow-wrap: anywhere;
    }
    .artifact-head small,
    .storage,
    .hint {
      color: #667085;
      font-size: 12px;
      margin-top: 4px;
    }
    .storage {
      text-align: right;
      white-space: nowrap;
    }
    .table-wrap {
      overflow: auto;
      max-height: 360px;
      border: 1px solid #eaecf0;
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    th,
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #f2f4f7;
      text-align: left;
      white-space: nowrap;
    }
    th {
      background: #f8fafc;
      color: #667085;
      position: sticky;
      top: 0;
    }
    .candidate-summary,
    .scalar {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 15px;
      border-radius: 10px;
      background: #eff6ff;
      color: #1e3a8a;
    }
    .candidate-summary strong,
    .scalar strong {
      font-size: 28px;
    }
    .report {
      background: #f8fafc;
      padding: 12px;
      border-radius: 8px;
    }
    .report h3 {
      margin: 0 0 8px;
      font-size: 14px;
    }
    .json {
      max-height: 360px;
      overflow: auto;
      background: #f8fafc;
      padding: 12px;
      border-radius: 8px;
      font-size: 12px;
    }
    .hint {
      margin: 10px 0 0;
    }
  `,
})
export class WorkflowArtifactRendererComponent {
  @Input() artifact: WorkflowArtifact | null = null;

  payload(item: WorkflowArtifact): unknown {
    return item.payload ?? item.preview;
  }
  reportPayload(item: WorkflowArtifact): unknown {
    return this.payload(item);
  }
  truncated(item: WorkflowArtifact): boolean {
    return item.storage === 'minio' || item.preview['truncated'] === true;
  }
  text(value: unknown): string {
    return value === null || value === undefined ? '—' : String(value);
  }
  number(value: unknown): number {
    return typeof value === 'number' ? value : Number(value) || 0;
  }
  scalarValue(item: WorkflowArtifact): string {
    return this.text(
      (item.payload ?? item.preview)['value'] ?? (item.payload ?? item.preview)['payload'],
    );
  }
  candidateRows(item: WorkflowArtifact): Array<Record<string, unknown>> {
    const value = (item.payload ?? item.preview)['payload'];
    return Array.isArray(value)
      ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      : [];
  }
  tableColumns(item: WorkflowArtifact): string[] {
    const value = (item.payload ?? item.preview)['columns'];
    if (Array.isArray(value)) return value.map(String);
    const first = this.tableRows(item)[0];
    return first ? Object.keys(first) : [];
  }
  tableRows(item: WorkflowArtifact): Array<Record<string, unknown>> {
    const value = (item.payload ?? item.preview)['rows'];
    return Array.isArray(value)
      ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
      : [];
  }
  timeSeriesLines(item: WorkflowArtifact): TimeSeriesLine[] {
    const rows = (item.payload ?? item.preview)['rows'];
    if (!Array.isArray(rows)) return [];
    const data: Array<[string, number | null]> = rows.flatMap((row) => {
      if (!row || typeof row !== 'object') return [];
      const value = (row as Record<string, unknown>)['value'];
      return typeof (row as Record<string, unknown>)['time'] === 'string'
        ? [
            [
              (row as Record<string, unknown>)['time'] as string,
              typeof value === 'number' ? value : null,
            ],
          ]
        : [];
    });
    return [{ name: item.semantic_type || '输出', data, color: '#2563eb', area: true }];
  }
}
