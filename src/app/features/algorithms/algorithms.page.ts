import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import {
  AlgorithmRunRequest,
  AlgorithmVersion,
  DataAssetSelection,
  StartTaskResponse,
} from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { TaskTrackerService } from '../../core/services/task-tracker.service';
import { DataAssetPickerComponent } from '../../shared/components/data-asset-picker.component';
import { StatusChipComponent } from '../../shared/components/status-chip.component';

@Component({
  selector: 'app-algorithms-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    DataAssetPickerComponent,
    StatusChipComponent,
  ],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">算法中心</p>
        <h1>选择算法并创建运行任务</h1>
        <p>选择数据资产和实际通道后，平台会记录本次运行使用的版本与参数。</p>
      </div>
      <button mat-stroked-button type="button" (click)="load()">刷新算法</button>
    </header>

    <section class="layout">
      <aside class="algorithm-list">
        <h2>可用算法</h2>
        @for (algorithm of algorithms(); track algorithm.id) {
          <button
            type="button"
            [class.selected]="selected()?.id === algorithm.id"
            (click)="select(algorithm)"
          >
            <span class="algorithm-copy">
              <strong>{{ algorithm.name }}</strong>
              <small>{{ algorithm.task_type }} · {{ algorithm.version }}</small>
            </span>
            @if (algorithm.requires_gpu) {
              <app-status-chip status="gpu" label="GPU" />
            } @else {
              <app-status-chip [status]="algorithm.execution_status" />
            }
          </button>
        } @empty {
          <div class="empty">暂无可用算法。</div>
        }
      </aside>

      <mat-card class="run-card">
        @if (selected(); as algorithm) {
          <div class="title-row">
            <div>
              <h2>{{ algorithm.name }}</h2>
              <p>{{ algorithm.code }} · {{ algorithm.task_type }}</p>
            </div>
            <app-status-chip [status]="algorithm.execution_status" />
          </div>

          @if (algorithm.requires_gpu) {
            <div class="warning">该算法需要 GPU Worker；当前 GPU 运行环境尚未完成验收。</div>
          } @else if (algorithm.execution_status !== 'ready') {
            <div class="warning">算法运行环境未就绪：{{ algorithm.execution_status }}。</div>
          } @else {
            <form [formGroup]="form" (ngSubmit)="run()">
              <h3>输入数据</h3>
              <app-data-asset-picker (selectionChange)="dataSelection.set($event)" />
              @if (algorithm.code === 'qscore_v1') {
                <p class="info">质量评分始终基于原始值计算；其它算法将使用上方选择的值来源。</p>
              }

              <h3>运行参数</h3>
              <div class="form-grid">
                @if (algorithm.task_type === 'forecast') {
                  <mat-form-field appearance="outline">
                    <mat-label>预测步数</mat-label>
                    <input matInput type="number" formControlName="horizon" />
                    <mat-hint>每个采样间隔输出一个预测点。</mat-hint>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>历史窗口</mat-label>
                    <input matInput type="number" formControlName="contextLength" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>季节长度</mat-label>
                    <input matInput type="number" formControlName="seasonLength" />
                  </mat-form-field>
                }
                @if (algorithm.code === 'hampel') {
                  <mat-form-field appearance="outline">
                    <mat-label>窗口长度</mat-label>
                    <input matInput type="number" formControlName="hampelWindow" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>异常阈值</mat-label>
                    <input matInput type="number" step="0.1" formControlName="hampelThreshold" />
                  </mat-form-field>
                }
              </div>
              <div class="actions">
                <button
                  mat-flat-button
                  color="primary"
                  type="submit"
                  [disabled]="
                    form.invalid || running() || !dataSelection()?.channel || !canRun(algorithm)
                  "
                >
                  {{ running() ? '正在提交…' : '创建运行任务' }}
                </button>
                @if (!dataSelection()?.channel) {
                  <span>请先选择具有数据的点位与指标通道。</span>
                }
              </div>
            </form>
          }
        } @else {
          <div class="empty">请选择一个算法。</div>
        }
      </mat-card>
    </section>
  `,
  styles: `
    .page-head,
    .title-row,
    .actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .page-head {
      margin-bottom: 18px;
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
      margin: 22px 0 10px;
      font-size: 16px;
    }
    .page-head p:not(.eyebrow),
    .title-row p,
    .actions span,
    small {
      color: #64748b;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(250px, 0.8fr) minmax(0, 2fr);
      gap: 18px;
      min-width: 0;
    }
    .algorithm-list {
      min-width: 0;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 14px;
    }
    .algorithm-list h2 {
      padding: 6px 8px;
    }
    .algorithm-list button {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      min-width: 0;
      text-align: left;
      border: 0;
      background: transparent;
      padding: 13px 10px;
      border-radius: 8px;
      cursor: pointer;
    }
    .algorithm-list button:hover,
    .algorithm-list button.selected {
      background: #eef5ff;
    }
    .algorithm-copy {
      min-width: 0;
    }
    .algorithm-copy strong,
    .algorithm-list small {
      display: block;
      overflow-wrap: anywhere;
    }
    .algorithm-list small {
      margin-top: 4px;
      font-size: 11px;
    }
    .run-card {
      min-width: 0;
      padding: 22px;
    }
    .warning,
    .info {
      padding: 14px;
      border-radius: 8px;
      line-height: 1.55;
    }
    .warning {
      background: #fffbeb;
      color: #92400e;
    }
    .info {
      margin: 10px 0 0;
      background: #eff6ff;
      color: #1e40af;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px 14px;
    }
    mat-form-field {
      width: 100%;
      min-width: 0;
    }
    .actions {
      margin-top: 12px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .empty {
      padding: 28px;
      text-align: center;
      color: #64748b;
      background: #f8fafc;
      border-radius: 8px;
    }
    @media (max-width: 940px) {
      .layout {
        grid-template-columns: 1fr;
      }
      .form-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 620px) {
      .page-head,
      .title-row {
        align-items: flex-start;
        flex-direction: column;
      }
      .form-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class AlgorithmsPage {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly tracker = inject(TaskTrackerService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly algorithms = signal<AlgorithmVersion[]>([]);
  readonly selected = signal<AlgorithmVersion | null>(null);
  readonly dataSelection = signal<DataAssetSelection | null>(null);
  readonly running = signal(false);
  readonly form = this.fb.group({
    horizon: [96, [Validators.required, Validators.min(1), Validators.max(96)]],
    contextLength: [288, [Validators.required, Validators.min(96), Validators.max(4096)]],
    seasonLength: [96, [Validators.required, Validators.min(1)]],
    hampelWindow: [9, [Validators.required, Validators.min(3)]],
    hampelThreshold: [4.5, [Validators.required, Validators.min(0.1)]],
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.api.get<AlgorithmVersion[]>('/api/v1/algorithms').subscribe({
      next: (algorithms) => {
        this.algorithms.set(algorithms);
        const retained = algorithms.find((item) => item.id === this.selected()?.id);
        this.selected.set(
          retained ?? algorithms.find((item) => !item.requires_gpu) ?? algorithms[0] ?? null,
        );
      },
      error: (error: unknown) => this.notifications.error(error),
    });
  }

  select(algorithm: AlgorithmVersion): void {
    this.selected.set(algorithm);
  }

  canRun(algorithm: AlgorithmVersion): boolean {
    return (
      this.auth.hasPermission('algorithm:run') &&
      !algorithm.requires_gpu &&
      algorithm.execution_status === 'ready'
    );
  }

  run(): void {
    const algorithm = this.selected();
    const selection = this.dataSelection();
    if (!algorithm || !selection?.channel || this.form.invalid || !this.canRun(algorithm)) return;
    const value = this.form.getRawValue();
    const params: Record<string, unknown> =
      algorithm.code === 'seasonal_naive'
        ? { season_length: value.seasonLength }
        : algorithm.code === 'hampel'
          ? { window: value.hampelWindow, threshold: value.hampelThreshold }
          : { expected_interval_seconds: 900 };
    const body: AlgorithmRunRequest = {
      dataset_version_id: selection.version.id,
      algorithm_code: algorithm.code,
      monitor_point_id: selection.channel.monitor_point_id,
      metric_code: selection.channel.metric_code,
      horizon: value.horizon,
      context_length: value.contextLength,
      value_source: algorithm.code === 'qscore_v1' ? 'raw' : selection.value_source,
      algorithm_params: params,
    };
    this.running.set(true);
    this.api
      .post<StartTaskResponse, AlgorithmRunRequest>('/api/v1/algorithms/runs', body)
      .pipe(finalize(() => this.running.set(false)))
      .subscribe({
        next: ({ task_id }) => {
          this.tracker.track(task_id);
          this.notifications.success('任务已提交，正在打开实时追踪。');
          void this.router.navigate(['/tasks', task_id]);
        },
        error: (error: unknown) => this.notifications.error(error),
      });
  }
}
