import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';

import {
  CsvImportMapping,
  CsvMappingSuggestion,
  CsvUploadDraft,
  DataAsset,
  DataSourceCreateRequest,
  DataSourceSummary,
  StartTaskResponse,
} from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { TaskTrackerService } from '../../core/services/task-tracker.service';
import { StatusChipComponent } from '../../shared/components/status-chip.component';

@Component({
  selector: 'app-data-sources-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    RouterLink,
    StatusChipComponent,
  ],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">数据资产</p>
        <h1>管理用于分析的数据</h1>
        <p>上传的 CSV 原件由平台安全保存；已接入的 MySQL 数据源始终以只读方式访问。</p>
      </div>
      <div class="header-actions">
        <button mat-stroked-button type="button" (click)="load()">刷新</button>
        @if (canWrite()) {
          <button mat-stroked-button type="button" (click)="showMysql.set(!showMysql())">
            接入只读 MySQL
          </button>
          <button
            mat-flat-button
            color="primary"
            type="button"
            (click)="showUpload.set(!showUpload())"
          >
            上传 CSV
          </button>
        }
      </div>
    </header>

    @if (showUpload() && canWrite()) {
      <mat-card class="workflow-card">
        <div class="title-row">
          <div>
            <h2>上传 CSV</h2>
            <p>支持 UTF-8、UTF-8 BOM 和 GB18030，单个文件最大 200 MB。</p>
          </div>
          <app-status-chip status="uploaded" label="第 1 步" />
        </div>
        @if (!draft()) {
          <form [formGroup]="uploadForm" (ngSubmit)="uploadCsv()" class="upload-form">
            <mat-form-field appearance="outline"
              ><mat-label>数据资产名称</mat-label
              ><input matInput formControlName="sourceName" /><mat-hint
                >例如：DMA-01 2026 年 7 月流量</mat-hint
              ></mat-form-field
            >
            <label class="file-field">
              <span>选择 CSV 文件</span>
              <input type="file" accept=".csv,text/csv" (change)="chooseFile($event)" />
              <strong>{{ selectedFile()?.name || '尚未选择文件' }}</strong>
            </label>
            <div class="actions">
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="uploadForm.invalid || !selectedFile() || uploading()"
              >
                {{ uploading() ? '正在上传…' : '上传并预览' }}
              </button>
            </div>
          </form>
        } @else {
          <div class="mapping-head">
            <div>
              <h3>字段预览与映射</h3>
              <p>
                {{ draft()?.encoding }} · {{ formatBytes(draft()?.size_bytes || 0) }} ·
                {{ draft()?.headers?.length }} 个字段
              </p>
            </div>
            <button mat-button type="button" (click)="discardDraft()">重新选择文件</button>
          </div>
          @if (draft()?.duplicate?.detected) {
            <div class="duplicate-warning">
              该文件内容与您已有的 {{ draft()?.duplicate?.matching_asset_count }} 个数据资产相同，仍会创建独立副本，不会覆盖原资产。
            </div>
          }
          @if (draft()?.mapping_suggestion; as suggestion) {
            <div class="mapping-suggestion">
              <div><strong>智能映射建议</strong><span>{{ suggestion.requires_confirmation ? '请确认低置信度字段。' : '可直接应用后再检查。' }}</span></div>
              <button mat-stroked-button type="button" (click)="applySuggestion(suggestion)">应用建议</button>
            </div>
          }
          <div class="preview-wrap">
            <table>
              <thead>
                <tr>
                  @for (header of draft()?.headers || []; track header) {
                    <th>{{ header }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of draft()?.sample_rows || []; track $index) {
                  <tr>
                    @for (header of draft()?.headers || []; track header) {
                      <td>{{ row[header] }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <form [formGroup]="mappingForm" (ngSubmit)="submitMapping()">
            <div class="mapping-grid">
              <mat-form-field appearance="outline"
                ><mat-label>点位列</mat-label
                ><mat-select formControlName="pointColumn">
                  @for (header of draft()?.headers || []; track header) {
                    <mat-option [value]="header">{{ header }}</mat-option>
                  }
                </mat-select></mat-form-field
              >
              <mat-form-field appearance="outline"
                ><mat-label>时间列</mat-label
                ><mat-select formControlName="timeColumn">
                  @for (header of draft()?.headers || []; track header) {
                    <mat-option [value]="header">{{ header }}</mat-option>
                  }
                </mat-select></mat-form-field
              >
              <mat-form-field appearance="outline"
                ><mat-label>记录 ID 列（可选）</mat-label
                ><mat-select formControlName="recordIdColumn"
                  ><mat-option value="">由文件与行号生成</mat-option>
                  @for (header of draft()?.headers || []; track header) {
                    <mat-option [value]="header">{{ header }}</mat-option>
                  }
                </mat-select></mat-form-field
              >
            </div>
            <div formArrayName="metrics" class="metric-list">
              <div class="metric-heading">
                <h3>指标通道</h3>
                <button mat-button type="button" (click)="addMetric()">添加指标</button>
              </div>
              @for (metric of metrics.controls; track $index; let index = $index) {
                <div [formGroupName]="index" class="metric-grid">
                  <mat-form-field appearance="outline"
                    ><mat-label>指标代码</mat-label
                    ><input matInput formControlName="code" placeholder="flow"
                  /></mat-form-field>
                  <mat-form-field appearance="outline"
                    ><mat-label>显示名称</mat-label
                    ><input matInput formControlName="name" placeholder="流量"
                  /></mat-form-field>
                  <mat-form-field appearance="outline"
                    ><mat-label>单位</mat-label
                    ><input matInput formControlName="unit" placeholder="m³/h"
                  /></mat-form-field>
                  <mat-form-field appearance="outline"
                    ><mat-label>原始值列</mat-label
                    ><mat-select formControlName="rawColumn">
                      @for (header of draft()?.headers || []; track header) {
                        <mat-option [value]="header">{{ header }}</mat-option>
                      }
                    </mat-select></mat-form-field
                  >
                  <mat-form-field appearance="outline"
                    ><mat-label>修复值列（可选）</mat-label
                    ><mat-select formControlName="processedColumn"
                      ><mat-option value="">不映射</mat-option>
                      @for (header of draft()?.headers || []; track header) {
                        <mat-option [value]="header">{{ header }}</mat-option>
                      }
                    </mat-select></mat-form-field
                  >
                  <mat-form-field appearance="outline"
                    ><mat-label>状态列（可选）</mat-label
                    ><mat-select formControlName="statusColumn"
                      ><mat-option value="">不映射</mat-option>
                      @for (header of draft()?.headers || []; track header) {
                        <mat-option [value]="header">{{ header }}</mat-option>
                      }
                    </mat-select></mat-form-field
                  >
                  @if (metrics.length > 1) {
                    <button mat-button color="warn" type="button" (click)="removeMetric(index)">
                      移除
                    </button>
                  }
                </div>
              }
            </div>
            <div class="actions">
              <label class="quality-toggle"><input type="checkbox" formControlName="autoQualityProfile" />导入完成后自动质量评分</label>
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="mappingForm.invalid || mappingSubmitting()"
              >
                {{ mappingSubmitting() ? '正在创建导入任务…' : '确认映射并导入' }}</button
              ><span>提交后将创建不可变数据版本。</span>
            </div>
          </form>
        }
      </mat-card>
    }

    @if (showMysql() && canWrite()) {
      <mat-card class="workflow-card">
        <div class="title-row">
          <div>
            <h2>接入只读 MySQL</h2>
            <p>连接串仅在提交时发送，之后不会在页面回显。</p>
          </div>
        </div>
        <form [formGroup]="mysqlForm" (ngSubmit)="createMysql()">
          <div class="mapping-grid">
            <mat-form-field appearance="outline"
              ><mat-label>数据源编码</mat-label><input matInput formControlName="sourceCode"
            /></mat-form-field>
            <mat-form-field appearance="outline"
              ><mat-label>数据源名称</mat-label><input matInput formControlName="sourceName"
            /></mat-form-field>
            <mat-form-field appearance="outline" class="wide"
              ><mat-label>只读 MySQL URI</mat-label
              ><input matInput type="password" formControlName="connectionUri" autocomplete="off"
            /></mat-form-field>
            <mat-form-field appearance="outline"
              ><mat-label>表名</mat-label><input matInput formControlName="tableName"
            /></mat-form-field>
            <mat-form-field appearance="outline"
              ><mat-label>主键/水位字段</mat-label><input matInput formControlName="idColumn"
            /></mat-form-field>
            <mat-form-field appearance="outline"
              ><mat-label>点位字段</mat-label><input matInput formControlName="pointColumn"
            /></mat-form-field>
            <mat-form-field appearance="outline"
              ><mat-label>时间字段</mat-label><input matInput formControlName="timeColumn"
            /></mat-form-field>
            <mat-form-field appearance="outline"
              ><mat-label>流量字段</mat-label><input matInput formControlName="flowColumn"
            /></mat-form-field>
          </div>
          <div class="actions">
            <button mat-flat-button color="primary" type="submit" [disabled]="mysqlForm.invalid">
              保存只读数据源
            </button>
          </div>
        </form>
      </mat-card>
    }

    <section class="asset-section">
      <div class="section-title">
        <div>
          <h2>可用数据资产</h2>
          <p>仅显示当前账户有权访问的数据。</p>
        </div>
      </div>
      <div class="asset-grid">
        @for (asset of assets(); track asset.id) {
          <mat-card
            ><div class="title-row">
              <h3>{{ asset.name }}</h3>
              <app-status-chip
                [status]="asset.source_type || 'unknown'"
                [label]="asset.source_type === 'csv' ? 'CSV' : 'MySQL'"
              />
            </div>
            @if (asset.latest_version; as version) {
              <p>
                {{ version.record_count }} 条记录 · {{ version.time_start || '—' }} 至
                {{ version.time_end || '—' }}
              </p>
              <app-status-chip
                [status]="version.status"
                [label]="version.status === 'ready' ? '可用' : version.status"
              />
              <div class="actions asset-actions">
                <a mat-stroked-button [routerLink]="['/datasets', asset.id]">详情与治理</a>
                @if (canDeleteDataset(asset)) {
                  <button mat-stroked-button type="button" (click)="deleteDataset(asset)">
                    删除
                  </button>
                }
              </div>
            } @else {
              <p>等待导入完成后生成版本。</p>
            }
          </mat-card>
        } @empty {
          <div class="empty">尚无可用数据资产。</div>
        }
      </div>
    </section>

    <section class="asset-section">
      <div class="section-title">
        <div>
          <h2>数据接入记录</h2>
          <p>CSV 和只读 MySQL 数据源均在此处管理。</p>
        </div>
      </div>
      <div class="source-list">
        @for (source of sources(); track source.id) {
          <mat-card
            ><div class="title-row">
              <div>
                <h3>{{ source.source_name }}</h3>
                <p>
                  {{ source.source_type === 'csv' ? 'CSV 上传' : '只读 MySQL' }} ·
                  {{
                    source.source_type === 'csv'
                      ? csvStatusLabel(source)
                      : source.watermark_value || '尚未导入'
                  }}
                </p>
              </div>
              <app-status-chip
                [status]="source.is_enabled ? 'active' : 'retired'"
                [label]="source.is_enabled ? '已启用' : '已停用'"
              />
            </div>
            @if (canWrite() && source.source_type === 'mysql') {
              <div class="actions">
                <button mat-stroked-button type="button" (click)="test(source)">测试连接</button
                ><button mat-flat-button color="primary" type="button" (click)="ingest(source)">
                  开始增量导入
                </button>
              </div>
            }
            @if (canWrite() && source.source_type === 'csv' && source.csv_upload_batch_code) {
              <div class="actions">
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  (click)="resumeCsv(source)"
                  [disabled]="draftLoading()"
                >
                  {{ draftLoading() ? '正在打开上传草稿…' : '继续字段映射并导入' }}
                </button>
                <button
                  mat-stroked-button
                  color="warn"
                  type="button"
                  (click)="deleteCsvDraft(source)"
                >
                  删除上传草稿
                </button>
              </div>
            }
          </mat-card>
        } @empty {
          <div class="empty">暂无数据接入记录。</div>
        }
      </div>
    </section>
  `,
  styles: `
    .page-head,
    .header-actions,
    .title-row,
    .actions,
    .mapping-head,
    .metric-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-width: 0;
    }
    .page-head {
      margin-bottom: 18px;
    }
    .header-actions,
    .actions {
      flex-wrap: wrap;
      justify-content: flex-end;
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
    h3,
    p {
      margin-top: 0;
    }
    h3 {
      margin-bottom: 6px;
    }
    .page-head p:not(.eyebrow),
    .title-row p,
    .mapping-head p,
    .section-title p,
    .actions span,
    .asset-grid p {
      color: #64748b;
      overflow-wrap: anywhere;
    }
    .workflow-card,
    .source-list mat-card,
    .asset-grid mat-card {
      padding: 20px;
      min-width: 0;
    }
    .workflow-card {
      margin-bottom: 18px;
    }
    .duplicate-warning,
    .mapping-suggestion {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 14px;
      margin: 12px 0;
      border-radius: 10px;
      overflow-wrap: anywhere;
    }
    .duplicate-warning { background: #fff7ed; color: #9a3412; }
    .mapping-suggestion { background: #eff6ff; color: #1e3a8a; }
    .mapping-suggestion span { display: block; margin-top: 4px; font-size: 12px; }
    .quality-toggle { display: inline-flex; align-items: center; gap: 8px; color: #475569; }
    .upload-form {
      display: grid;
      gap: 12px;
      max-width: 720px;
    }
    .file-field {
      display: grid;
      gap: 6px;
      border: 1px dashed #94a3b8;
      border-radius: 8px;
      padding: 14px;
      color: #475569;
      cursor: pointer;
    }
    .file-field strong {
      overflow-wrap: anywhere;
      color: #0f172a;
    }
    .preview-wrap {
      overflow: auto;
      margin: 14px 0;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    table {
      width: max-content;
      min-width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th,
    td {
      max-width: 220px;
      padding: 9px 12px;
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
      border-bottom: 1px solid #e2e8f0;
    }
    th {
      background: #f8fafc;
      white-space: nowrap;
    }
    .mapping-grid,
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px 14px;
    }
    .metric-list {
      margin: 20px 0;
    }
    .metric-grid {
      padding: 14px;
      margin-top: 8px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      align-items: center;
    }
    .wide {
      grid-column: span 3;
    }
    mat-form-field {
      width: 100%;
      min-width: 0;
    }
    .asset-section {
      margin-top: 26px;
    }
    .asset-grid,
    .source-list {
      display: grid;
      gap: 12px;
    }
    .asset-grid {
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }
    .section-title {
      margin-bottom: 12px;
    }
    .empty {
      padding: 32px;
      text-align: center;
      color: #64748b;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
    }
    @media (max-width: 800px) {
      .page-head,
      .title-row,
      .mapping-head,
      .metric-heading {
        align-items: flex-start;
        flex-direction: column;
      }
      .header-actions,
      .actions {
        justify-content: flex-start;
      }
      .mapping-grid,
      .metric-grid {
        grid-template-columns: minmax(0, 1fr);
      }
      .wide {
        grid-column: auto;
      }
    }
  `,
})
export class DataSourcesPage {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly tracker = inject(TaskTrackerService);
  private readonly notifications = inject(NotificationService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly sources = signal<DataSourceSummary[]>([]);
  readonly assets = signal<DataAsset[]>([]);
  readonly showMysql = signal(false);
  readonly showUpload = signal(false);
  readonly uploading = signal(false);
  readonly draftLoading = signal(false);
  readonly mappingSubmitting = signal(false);
  readonly selectedFile = signal<File | null>(null);
  readonly draft = signal<CsvUploadDraft | null>(null);
  readonly uploadForm = this.fb.group({ sourceName: ['', Validators.required] });
  readonly mappingForm = this.fb.group({
    pointColumn: ['', Validators.required],
    timeColumn: ['', Validators.required],
    recordIdColumn: [''],
    autoQualityProfile: [true],
    metrics: this.fb.array([this.newMetric()]),
  });
  readonly mysqlForm = this.fb.group({
    sourceCode: ['', [Validators.required, Validators.pattern(/^[a-z][a-z0-9_-]{2,63}$/)]],
    sourceName: ['', Validators.required],
    connectionUri: ['', Validators.required],
    tableName: ['device_data', Validators.required],
    idColumn: ['id', Validators.required],
    pointColumn: ['device_name', Validators.required],
    timeColumn: ['record_time', Validators.required],
    flowColumn: ['flow', Validators.required],
  });
  readonly metrics = this.mappingForm.controls.metrics;
  readonly csvReady = computed(() => !!this.draft() && !this.mappingSubmitting());

  constructor() {
    this.load();
  }

  canWrite(): boolean {
    return this.auth.hasPermission('data_source:write');
  }

  load(): void {
    this.api.get<DataSourceSummary[]>('/api/v1/data-sources').subscribe({
      next: (items) => this.sources.set(items),
      error: (error: unknown) => this.notifications.error(error),
    });
    this.api.get<DataAsset[]>('/api/v1/datasets').subscribe({
      next: (items) => this.assets.set(items),
      error: (error: unknown) => this.notifications.error(error),
    });
  }

  chooseFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
  }

  uploadCsv(): void {
    const file = this.selectedFile();
    if (!file || this.uploadForm.invalid) return;
    const form = new FormData();
    form.append('source_name', this.uploadForm.controls.sourceName.value.trim());
    form.append('csv_file', file, file.name);
    this.uploading.set(true);
    this.api.post<CsvUploadDraft, FormData>('/api/v1/data-sources/csv-uploads', form).subscribe({
      next: (draft) => {
        this.draft.set(draft);
        this.seedMapping(draft.headers, draft.mapping_suggestion);
        this.uploading.set(false);
      },
      error: (error: unknown) => {
        this.uploading.set(false);
        this.notifications.error(error, 'CSV 上传失败。');
      },
    });
  }

  resumeCsv(source: DataSourceSummary): void {
    this.draftLoading.set(true);
    this.api.get<CsvUploadDraft>(`/api/v1/data-sources/${source.id}/csv-upload-draft`).subscribe({
      next: (draft) => {
        this.draft.set(draft);
        this.uploadForm.controls.sourceName.setValue(source.source_name);
        this.seedMapping(draft.headers, draft.mapping_suggestion);
        this.showMysql.set(false);
        this.showUpload.set(true);
        this.draftLoading.set(false);
      },
      error: (error: unknown) => {
        this.draftLoading.set(false);
        this.notifications.error(error, '上传草稿已不可用，请刷新数据源状态。');
        this.load();
      },
    });
  }

  submitMapping(): void {
    const draft = this.draft();
    if (!draft || this.mappingForm.invalid) return;
    const value = this.mappingForm.getRawValue();
    const body: CsvImportMapping = {
      point_column: value.pointColumn,
      time_column: value.timeColumn,
      record_id_column: value.recordIdColumn || null,
      auto_quality_profile: value.autoQualityProfile,
      metrics: value.metrics.map((metric) => ({
        code: metric.code.trim(),
        name: metric.name.trim(),
        unit: metric.unit.trim() || null,
        raw_column: metric.rawColumn,
        processed_column: metric.processedColumn || null,
        status_column: metric.statusColumn || null,
      })),
    };
    this.mappingSubmitting.set(true);
    this.api
      .post<StartTaskResponse, CsvImportMapping>(
        `/api/v1/csv-uploads/${draft.batch_code}/imports`,
        body,
      )
      .subscribe({
        next: ({ task_id }) => {
          this.mappingSubmitting.set(false);
          this.tracker.track(task_id);
          this.notifications.success('CSV 导入任务已创建。');
          this.discardDraft();
          this.showUpload.set(false);
          this.load();
        },
        error: (error: unknown) => {
          this.mappingSubmitting.set(false);
          this.notifications.error(error, '字段映射或导入任务创建失败。');
        },
      });
  }

  addMetric(): void {
    this.metrics.push(this.newMetric());
  }
  removeMetric(index: number): void {
    if (this.metrics.length > 1) this.metrics.removeAt(index);
  }

  discardDraft(): void {
    this.draft.set(null);
    this.selectedFile.set(null);
    this.uploadForm.reset({ sourceName: '' });
    while (this.metrics.length > 1) this.metrics.removeAt(this.metrics.length - 1);
    this.mappingForm.reset({
      pointColumn: '',
      timeColumn: '',
      recordIdColumn: '',
      autoQualityProfile: true,
      metrics: [
        {
          code: 'flow',
          name: '流量',
          unit: 'm³/h',
          rawColumn: '',
          processedColumn: '',
          statusColumn: '',
        },
      ],
    });
  }

  canDeleteDataset(asset: DataAsset): boolean {
    return this.auth.hasPermission('dataset:delete') && asset.source_type === 'csv';
  }

  deleteCsvDraft(source: DataSourceSummary): void {
    if (!window.confirm(`删除“${source.source_name}”的未导入 CSV 草稿？`)) return;
    this.api
      .delete<{ deleted: boolean }>(`/api/v1/data-sources/${source.id}/csv-upload-draft`)
      .subscribe({
        next: () => {
          this.notifications.success('上传草稿已删除。');
          this.load();
        },
        error: (error: unknown) =>
          this.notifications.error(error, '删除失败；正在导入的批次不能删除。'),
      });
  }

  deleteDataset(asset: DataAsset): void {
    if (!window.confirm(`删除数据资产“${asset.name}”？删除后将进入管理员回收站。`)) return;
    this.api.delete<DataAsset>(`/api/v1/datasets/${asset.id}`).subscribe({
      next: () => {
        this.notifications.success('数据资产已移入回收站。');
        this.load();
      },
      error: (error: unknown) => this.notifications.error(error, '删除失败。'),
    });
  }
  csvStatusLabel(source: DataSourceSummary): string {
    if (source.csv_upload_batch_code) return '待字段映射';
    switch (source.csv_import_status) {
      case 'pending':
        return '等待导入';
      case 'success':
        return '已生成数据版本';
      case 'failed':
        return '导入失败';
      case 'queued':
      case 'running':
      case 'validating':
      case 'importing':
        return '正在导入';
      default:
        return '尚未导入';
    }
  }

  test(source: DataSourceSummary): void {
    this.api
      .post<{ connected: boolean }, Record<string, never>>(
        `/api/v1/data-sources/${source.id}/test`,
        {},
      )
      .subscribe({
        next: () => this.notifications.success(`${source.source_name} 连接正常且要求只读。`),
        error: (error: unknown) => this.notifications.error(error),
      });
  }
  ingest(source: DataSourceSummary): void {
    this.api
      .post<StartTaskResponse, { source_code: string; limit: number }>('/api/v1/ingestions', {
        source_code: source.source_code,
        limit: 10000,
      })
      .subscribe({
        next: ({ task_id }) => {
          this.tracker.track(task_id);
          this.notifications.success('导入任务已提交。');
        },
        error: (error: unknown) => this.notifications.error(error),
      });
  }

  createMysql(): void {
    if (this.mysqlForm.invalid) return;
    const value = this.mysqlForm.getRawValue();
    const body: DataSourceCreateRequest = {
      source_code: value.sourceCode,
      source_name: value.sourceName,
      source_type: 'mysql',
      is_read_only: true,
      connection_config: { connection_uri: value.connectionUri, table: value.tableName },
      field_mapping: {
        source_record_id: value.idColumn,
        point_key: value.pointColumn,
        time: value.timeColumn,
        watermark_column: value.idColumn,
        metrics: [{ code: 'flow', name: 'Flow', unit: 'm3/h', raw_column: value.flowColumn }],
      },
    };
    this.api
      .post<DataSourceSummary, DataSourceCreateRequest>('/api/v1/data-sources', body)
      .subscribe({
        next: () => {
          this.notifications.success('只读数据源已创建。');
          this.showMysql.set(false);
          this.load();
        },
        error: (error: unknown) => this.notifications.error(error),
      });
  }

  formatBytes(size: number): string {
    return size >= 1024 * 1024
      ? `${(size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.ceil(size / 1024)} KB`;
  }

  private newMetric() {
    return this.fb.group({
      code: ['flow', [Validators.required, Validators.pattern(/^[a-z][a-z0-9_]{0,63}$/)]],
      name: ['流量', Validators.required],
      unit: ['m³/h'],
      rawColumn: ['', Validators.required],
      processedColumn: [''],
      statusColumn: [''],
    });
  }
  applySuggestion(suggestion: CsvMappingSuggestion): void {
    if (suggestion.point_column?.column) this.mappingForm.controls.pointColumn.setValue(suggestion.point_column.column);
    if (suggestion.time_column?.column) this.mappingForm.controls.timeColumn.setValue(suggestion.time_column.column);
    this.mappingForm.controls.recordIdColumn.setValue(suggestion.record_id_column?.column || '');
    this.metrics.clear();
    const rows = suggestion.metrics.length ? suggestion.metrics : [{ code: 'flow', name: '流量', unit: 'm³/h', raw_column: '' }];
    for (const metric of rows) {
      const group = this.newMetric();
      group.patchValue({ code: metric.code, name: metric.name, unit: metric.unit || '', rawColumn: metric.raw_column });
      this.metrics.push(group);
    }
  }

  private seedMapping(headers: string[], suggestion?: CsvMappingSuggestion): void {
    if (suggestion) {
      this.applySuggestion(suggestion);
      return;
    }
    const pick = (patterns: string[]) =>
      headers.find((header) =>
        patterns.some((pattern) => header.toLowerCase().includes(pattern)),
      ) ||
      headers[0] ||
      '';
    this.mappingForm.controls.pointColumn.setValue(pick(['point', 'device', '点位', '设备']));
    this.mappingForm.controls.timeColumn.setValue(pick(['time', 'date', '时间']));
    this.metrics.at(0).controls.rawColumn.setValue(pick(['flow', '流量']));
  }
}
