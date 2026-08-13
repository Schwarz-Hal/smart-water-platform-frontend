import { DecimalPipe, JsonPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  DataAsset,
  DataQualityReport,
  DatasetLineageTree,
  DatasetChannel,
  DatasetLineage,
  DatasetVersion,
} from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';

@Component({
  selector: 'app-dataset-detail-page',
  imports: [
    BeijingTimePipe,
    DecimalPipe,
    JsonPipe,
    MatButtonModule,
    RouterLink,
    StatusChipComponent,
  ],
  template: `
    @if (asset(); as item) {
      <header class="head">
        <div>
          <p class="eyebrow">数据资产</p>
          <h1>{{ item.name }}</h1>
          <p>{{ item.description || '暂无说明' }}</p>
        </div>
        <div class="actions">
          <a mat-stroked-button routerLink="/data-sources">返回</a
          ><a
            mat-flat-button
            [routerLink]="['/workflows/new']"
            [queryParams]="{ template: 'timeseries_governance_basic', dataset_version_id: selectedVersion()?.id }"
            >创建治理工作流</a
          >
          @if (canDelete()) {
            <button mat-stroked-button type="button" (click)="deleteAsset()">删除资产</button>
          }
        </div>
      </header>
      <section class="summary">
        <div><small>状态</small><app-status-chip [status]="item.status || 'active'" /></div>
        <div>
          <small>版本</small><strong>{{ item.version_count || versions().length }}</strong>
        </div>
        <div>
          <small>通道</small><strong>{{ item.channel_count || channels().length }}</strong>
        </div>
        <div>
          <small>最新质量</small
          ><strong>{{
            item.latest_quality
              ? item.latest_quality.grade + ' · ' + item.latest_quality.score.toFixed(1)
              : '尚未评估'
          }}</strong>
        </div>
      </section>
      <section class="layout">
        <div class="panel grow">
          @if (selectedVersion(); as version) {
            <div class="title-row">
              <div>
                <small>当前可用版本</small>
                <h2>{{ versionLabel(version) }}</h2>
              </div>
              @if (versions().length > 1) {
                <button mat-stroked-button type="button" (click)="showHistory.set(!showHistory())">
                  {{ showHistory() ? '收起历史版本' : '历史版本 / 高级选项' }}
                </button>
              }
            </div>
            <p>{{ version.version_note || '无版本说明' }}</p>
            @if (showHistory()) {
              <div class="version-history">
                @for (candidate of versions(); track candidate.id) {
                  <button
                    class="version"
                    [class.active]="selectedVersion()?.id === candidate.id"
                    (click)="selectVersion(candidate)"
                  >
                    <b>{{ versionLabel(candidate) }}</b>
                    <span
                      >{{ candidate.record_count }} 条 ·
                      {{ candidate.storage_backend || 'mysql' }}</span
                    >
                    <small>{{ candidate.created_at | beijingTime: 'yyyy-MM-dd HH:mm' }}</small>
                  </button>
                }
              </div>
            }
            <h3>数据血缘</h3>
            @if (lineageTree(); as tree) {
              <div class="lineage-tree">
                @for (node of tree.nodes; track node.version_id) {
                  <div class="lineage-node" [class.current]="node.version_id === tree.current_version_id">
                    <strong>{{ node.operation_name }}</strong>
                    <span>{{ node.is_synthetic ? '模拟扩展' : node.version_kind === 'imported' ? '初始导入' : '派生版本' }} · {{ node.record_count }} 条</span>
                    @if (node.quality) { <small>质量 {{ node.quality.grade }} · {{ node.quality.score.toFixed(1) }}</small> }
                  </div>
                }
              </div>
            }
            @if (lineage(); as value) {
              <p>
                来源：{{ value.ancestors.length ? value.ancestors[0].version_code : '原始导入' }}
              </p>
              <p>创建任务：{{ value.created_by_task_id || '—' }}</p>
            }
            <h3>通道</h3>
            <div class="channels">
              @for (channel of channels(); track channel.monitor_point_id + channel.metric_code) {
                <div>
                  <b>{{ channel.point_name }} · {{ channel.metric_name }}</b
                  ><span>{{ channel.record_count }} 条 · {{ channel.unit || '无单位' }}</span>
                </div>
              }
            </div>
            <h3>质量报告</h3>
            @for (report of reports(); track report.report_id) {
              <article class="report">
                <strong class="grade">{{ report.grade }}</strong>
                <div>
                  <b>{{ report.score | number: '1.1-1' }} 分</b>
                  <p>{{ report.created_at | beijingTime: 'yyyy-MM-dd HH:mm' }}</p>
                </div>
                <pre>{{ report.dimensions | json }}</pre>
              </article>
            } @empty {
              <p class="muted">该版本尚无质量报告。</p>
            }
          }
        </div>
      </section>
    } @else {
      <div class="empty">正在读取数据资产…</div>
    }
  `,
  styles: `
    .head,
    .actions,
    .summary,
    .layout,
    .title-row,
    .report {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .head {
      justify-content: space-between;
    }
    .title-row {
      justify-content: space-between;
      align-items: flex-start;
    }
    .eyebrow {
      color: #0f4c81;
      font-weight: 800;
      margin-bottom: 4px;
    }
    h1 {
      margin: 0;
    }
    .summary {
      margin: 20px 0;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .summary > div,
    .panel {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 18px;
    }
    .summary small,
    .version span,
    .version small,
    .muted {
      display: block;
      color: #64748b;
    }
    .summary strong {
      display: block;
      font-size: 22px;
      margin-top: 8px;
    }
    .layout {
      align-items: flex-start;
    }
    .panel {
      width: 320px;
    }
    .grow {
      width: auto;
      flex: 1;
    }
    .version-history {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 10px;
      margin: 16px 0 24px;
    }
    .version {
      display: block;
      width: 100%;
      text-align: left;
      padding: 12px;
      margin: 8px 0;
      border: 1px solid #e2e8f0;
      background: #fff;
      border-radius: 10px;
    }
    .version.active {
      border-color: #0f4c81;
      background: #eff6ff;
    }
    .channels {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .lineage-tree { display: grid; gap: 8px; margin: 12px 0 20px; }
    .lineage-node { padding: 10px 12px; border-left: 4px solid #94a3b8; background: #f8fafc; border-radius: 8px; }
    .lineage-node.current { border-left-color: #0f67c9; background: #eff6ff; }
    .lineage-node span, .lineage-node small { display: block; color: #64748b; margin-top: 3px; }
    .channels div {
      padding: 12px;
      background: #f8fafc;
      border-radius: 10px;
    }
    .channels span {
      display: block;
      color: #64748b;
      margin-top: 4px;
    }
    .report {
      padding: 12px;
      border-top: 1px solid #e2e8f0;
    }
    .grade {
      font-size: 30px;
      color: #0f4c81;
    }
    .report pre {
      margin-left: auto;
      max-width: 45%;
      overflow: auto;
    }
    .empty {
      padding: 40px;
      text-align: center;
    }
    @media (max-width: 850px) {
      .head,
      .layout {
        align-items: flex-start;
        flex-direction: column;
      }
      .summary {
        grid-template-columns: 1fr 1fr;
      }
      .panel {
        width: auto;
        align-self: stretch;
      }
      .channels {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class DatasetDetailPage {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notifications = inject(NotificationService);
  readonly datasetId = Number(inject(ActivatedRoute).snapshot.paramMap.get('datasetId'));
  readonly asset = signal<DataAsset | null>(null);
  readonly versions = signal<DatasetVersion[]>([]);
  readonly selectedVersion = signal<DatasetVersion | null>(null);
  readonly channels = signal<DatasetChannel[]>([]);
  readonly reports = signal<DataQualityReport[]>([]);
  readonly lineage = signal<DatasetLineage | null>(null);
  readonly lineageTree = signal<DatasetLineageTree | null>(null);
  readonly showHistory = signal(false);
  constructor() {
    this.api.get<DataAsset>(`/api/v1/datasets/${this.datasetId}`).subscribe({
      next: (value) => this.asset.set(value),
      error: (error) => this.notifications.error(error, '无法读取数据资产。'),
    });
    this.api.get<DatasetVersion[]>(`/api/v1/datasets/${this.datasetId}/versions`).subscribe({
      next: (items) => {
        this.versions.set(items);
        if (items[0]) this.selectVersion(items[0]);
      },
      error: (error) => this.notifications.error(error, '无法读取数据版本。'),
    });
  }
  selectVersion(version: DatasetVersion): void {
    this.selectedVersion.set(version);
    this.api
      .get<DatasetChannel[]>(`/api/v1/dataset-versions/${version.id}/channels`)
      .subscribe((value) => this.channels.set(value));
    this.api
      .get<DataQualityReport[]>(`/api/v1/dataset-versions/${version.id}/quality-reports`)
      .subscribe((value) => this.reports.set(value));
    this.api
      .get<DatasetLineage>(`/api/v1/dataset-versions/${version.id}/lineage`)
      .subscribe((value) => this.lineage.set(value));
    this.api
      .get<DatasetLineageTree>(`/api/v1/datasets/${this.datasetId}/lineage`)
      .subscribe((value) => this.lineageTree.set(value));
  }

  versionLabel(version: DatasetVersion): string {
    if (version.version_kind === 'derived') {
      const chronological = this.versions()
        .filter((item) => item.version_kind === 'derived')
        .reverse();
      return `治理生成 V${Math.max(2, chronological.findIndex((item) => item.id === version.id) + 2)}`;
    }
    return '初始导入';
  }

  canDelete(): boolean {
    return this.auth.hasPermission('dataset:delete') && this.asset()?.source_type === 'csv';
  }

  deleteAsset(): void {
    const item = this.asset();
    if (!item || !window.confirm(`删除数据资产“${item.name}”？删除后将进入管理员回收站。`)) return;
    this.api.delete<DataAsset>(`/api/v1/datasets/${item.id}`).subscribe({
      next: () => {
        this.notifications.success('数据资产已移入回收站。');
        void this.router.navigate(['/data-sources']);
      },
      error: (error: unknown) => this.notifications.error(error, '删除数据资产失败。'),
    });
  }
}
