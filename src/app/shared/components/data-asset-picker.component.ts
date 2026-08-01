import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import {
  DataAsset,
  DataAssetContext,
  DataAssetSelection,
  DatasetChannel,
  DatasetVersion,
} from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-data-asset-picker',
  imports: [MatFormFieldModule, MatSelectModule],
  template: `
    <section class="asset-picker" aria-label="数据资产选择">
      <mat-form-field appearance="outline">
        <mat-label>数据资产</mat-label>
        <mat-select
          [value]="assetId()"
          [disabled]="loadingAssets()"
          (selectionChange)="selectAsset($event.value)"
        >
          @for (asset of assets(); track asset.id) {
            <mat-option [value]="asset.id">{{ asset.name }}</mat-option>
          }
        </mat-select>
        @if (!assets().length && !loadingAssets()) {
          <mat-hint>暂无可用数据。请先上传 CSV 或导入只读 MySQL 数据。</mat-hint>
        }
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>数据版本</mat-label>
        <mat-select
          [value]="versionId()"
          [disabled]="!assetId() || loadingVersions()"
          (selectionChange)="selectVersion($event.value)"
        >
          @for (version of versions(); track version.id) {
            <mat-option [value]="version.id"
              >{{ version.status === 'ready' ? '可用版本' : version.status }} ·
              {{ version.record_count }} 条</mat-option
            >
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>点位</mat-label>
        <mat-select
          [value]="pointId()"
          [disabled]="!channels().length"
          (selectionChange)="selectPoint($event.value)"
        >
          @for (point of points(); track point.monitor_point_id) {
            <mat-option [value]="point.monitor_point_id">{{ point.point_name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>指标通道</mat-label>
        <mat-select
          [value]="metricCode()"
          [disabled]="!pointId()"
          (selectionChange)="selectMetric($event.value)"
        >
          @for (channel of pointChannels(); track channel.metric_code) {
            <mat-option [value]="channel.metric_code"
              >{{ channel.metric_name }}（{{ channel.unit || '无单位' }}）</mat-option
            >
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>值来源</mat-label>
        <mat-select
          [value]="valueSource()"
          [disabled]="!selectedChannel()"
          (selectionChange)="selectValueSource($event.value)"
        >
          <mat-option value="processed" [disabled]="!selectedChannel()?.processed_available"
            >处理/修复值</mat-option
          >
          <mat-option value="raw" [disabled]="!selectedChannel()?.raw_available">原始值</mat-option>
        </mat-select>
      </mat-form-field>
      @if (selectedChannel(); as channel) {
        <p class="range">
          {{ channel.record_count }} 条 · {{ channel.time_start || '—' }} 至
          {{ channel.time_end || '—' }}
        </p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      container-type: inline-size;
    }
    .asset-picker {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px 14px;
      min-width: 0;
    }
    mat-form-field {
      width: 100%;
      min-width: 0;
    }
    .range {
      grid-column: 1 / -1;
      margin: -2px 0 4px;
      color: #64748b;
      font-size: 12px;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
    /* The picker may be placed inside a narrow side panel, not only a narrow viewport. */
    @container (max-width: 760px) {
      .asset-picker {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @container (max-width: 430px) {
      .asset-picker {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class DataAssetPickerComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly notifications = inject(NotificationService);

  @Input() selection: DataAssetSelection | null = null;
  @Output() readonly contextChange = new EventEmitter<DataAssetContext | null>();
  @Output() readonly selectionChange = new EventEmitter<DataAssetSelection | null>();

  readonly assets = signal<DataAsset[]>([]);
  readonly versions = signal<DatasetVersion[]>([]);
  readonly channels = signal<DatasetChannel[]>([]);
  readonly assetId = signal<number | null>(null);
  readonly versionId = signal<number | null>(null);
  readonly pointId = signal<number | null>(null);
  readonly metricCode = signal<string | null>(null);
  readonly valueSource = signal<'raw' | 'processed'>('processed');
  readonly loadingAssets = signal(false);
  readonly loadingVersions = signal(false);
  readonly loadingChannels = signal(false);
  readonly points = computed(() => {
    const seen = new Set<number>();
    return this.channels().filter(
      (channel) => !seen.has(channel.monitor_point_id) && seen.add(channel.monitor_point_id),
    );
  });
  readonly pointChannels = computed(() =>
    this.channels().filter((channel) => channel.monitor_point_id === this.pointId()),
  );
  readonly selectedChannel = computed(
    () => this.pointChannels().find((channel) => channel.metric_code === this.metricCode()) ?? null,
  );

  ngOnInit(): void {
    this.loadAssets();
  }

  loadAssets(): void {
    this.loadingAssets.set(true);
    this.api.get<DataAsset[]>('/api/v1/datasets').subscribe({
      next: (assets) => {
        this.assets.set(assets);
        const preferredAssetId = this.selection?.asset.id ?? this.assetId();
        const selected = assets.find((asset) => asset.id === preferredAssetId) ?? assets[0] ?? null;
        if (selected) this.selectAsset(selected.id, this.selection);
        else this.clearSelection();
        this.loadingAssets.set(false);
      },
      error: (error: unknown) => {
        this.loadingAssets.set(false);
        this.clearSelection();
        this.notifications.error(error, '无法读取可用数据资产。');
      },
    });
  }

  selectAsset(value: unknown, preferred: DataAssetSelection | null = null): void {
    const id = this.asPositiveInteger(value);
    if (!id) return;
    this.assetId.set(id);
    this.versionId.set(null);
    this.channels.set([]);
    this.loadingVersions.set(true);
    this.api.get<DatasetVersion[]>(`/api/v1/datasets/${id}/versions`).subscribe({
      next: (versions) => {
        this.versions.set(versions);
        const selected =
          versions.find((version) => version.id === preferred?.version.id) ??
          versions.find((version) => version.status === 'ready') ??
          versions[0] ??
          null;
        if (selected) this.selectVersion(selected.id, preferred);
        else this.clearVersion();
        this.loadingVersions.set(false);
      },
      error: (error: unknown) => {
        this.loadingVersions.set(false);
        this.clearVersion();
        this.notifications.error(error, '无法读取数据版本。');
      },
    });
  }

  selectVersion(value: unknown, preferred: DataAssetSelection | null = null): void {
    const id = this.asPositiveInteger(value);
    if (!id) return;
    this.versionId.set(id);
    this.loadingChannels.set(true);
    this.api.get<DatasetChannel[]>(`/api/v1/dataset-versions/${id}/channels`).subscribe({
      next: (channels) => {
        this.channels.set(channels);
        const selected =
          channels.find(
            (channel) =>
              channel.monitor_point_id === preferred?.channel?.monitor_point_id &&
              channel.metric_code === preferred?.channel?.metric_code,
          ) ??
          channels[0] ??
          null;
        this.pointId.set(selected?.monitor_point_id ?? null);
        this.metricCode.set(selected?.metric_code ?? null);
        const preferredSource = preferred?.value_source;
        this.valueSource.set(
          preferredSource === 'processed' && selected?.processed_available
            ? 'processed'
            : preferredSource === 'raw' && selected?.raw_available
              ? 'raw'
              : selected?.processed_available
                ? 'processed'
                : 'raw',
        );
        this.loadingChannels.set(false);
        this.emitSelection();
      },
      error: (error: unknown) => {
        this.loadingChannels.set(false);
        this.clearVersion();
        this.notifications.error(error, '无法读取点位和指标通道。');
      },
    });
  }

  selectPoint(value: unknown): void {
    const id = this.asPositiveInteger(value);
    this.pointId.set(id);
    const channel = this.pointChannels()[0] ?? null;
    this.metricCode.set(channel?.metric_code ?? null);
    this.valueSource.set(channel?.processed_available ? 'processed' : 'raw');
    this.emitSelection();
  }
  selectMetric(value: unknown): void {
    const metric = typeof value === 'string' && value ? value : null;
    this.metricCode.set(metric);
    const channel = this.selectedChannel();
    if (channel && !channel.processed_available) this.valueSource.set('raw');
    this.emitSelection();
  }
  selectValueSource(value: unknown): void {
    if (value === 'raw' || value === 'processed') this.valueSource.set(value);
    this.emitSelection();
  }

  private emitSelection(): void {
    const asset = this.assets().find((item) => item.id === this.assetId()) ?? null;
    const version = this.versions().find((item) => item.id === this.versionId()) ?? null;
    if (!asset || !version) {
      this.contextChange.emit(null);
      this.selectionChange.emit(null);
      return;
    }
    const context = { asset, version, channels: this.channels() };
    this.contextChange.emit(context);
    this.selectionChange.emit({
      ...context,
      channel: this.selectedChannel(),
      value_source: this.valueSource(),
    });
  }
  private clearSelection(): void {
    this.assetId.set(null);
    this.versions.set([]);
    this.clearVersion();
  }
  private clearVersion(): void {
    this.versionId.set(null);
    this.channels.set([]);
    this.pointId.set(null);
    this.metricCode.set(null);
    this.contextChange.emit(null);
    this.selectionChange.emit(null);
  }
  private asPositiveInteger(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
  }
}
