import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';

import { DataAssetSelection } from '../../core/models/api.models';
import { NotificationService } from '../../core/services/notification.service';
import { S01BindingRole, S01WorkflowService } from '../../core/services/s01-workflow.service';
import { DataAssetPickerComponent } from '../../shared/components/data-asset-picker.component';

type BindingRole = S01BindingRole;

interface S01BindingConfig {
  role: BindingRole;
  label: string;
  desc: string;
  selection: DataAssetSelection | null;
}

interface RecentRun {
  run_id: string;
  dma_name: string;
  quality_score: number | null;
  status: string;
  created_at: string;
  workflow_id?: number;
}

@Component({
  selector: 'app-s01-leakage-scene-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    DataAssetPickerComponent,
  ],
  template: `
    <header class="page-head">
      <button class="back-btn" type="button" (click)="goBack()">← 返回场景中心</button>
      <div>
        <p class="eyebrow">S01 · 供水业务</p>
        <h1>DMA 分区漏损评估（基础版）</h1>
        <p class="lead">
          基于水量平衡与夜间流量分析，智能识别漏损风险时段与候选区域。只需绑定四路数据、设置参数，一键运行。
        </p>
      </div>
    </header>

    @if (error()) {
      <div class="alert error">{{ error() }}</div>
    }

    <section class="card">
      <h2>1 · 基本信息</h2>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>DMA 分区名称</mat-label>
        <input matInput [(ngModel)]="dmaName" placeholder="例如：DMA 东区" />
      </mat-form-field>
    </section>

    <section class="card">
      <h2>2 · 数据绑定</h2>
      <p class="hint">S01 基础版需要四路时序数据，均为必填。</p>

      @for (cfg of bindingConfigs; track cfg.role) {
        <div class="binding-block">
          <div class="binding-label">
            <span class="role-tag required">必填</span>
            <strong>{{ cfg.label }}</strong>
            <span class="role-desc">{{ cfg.desc }}</span>
          </div>
          <app-data-asset-picker
            [selection]="cfg.selection"
            (selectionChange)="updateBinding(cfg.role, $event)"
          />
        </div>
      }
    </section>

    <section class="card">
      <h2>3 · 分析参数</h2>
      <div class="param-grid">
        <mat-form-field appearance="outline">
          <mat-label>质量门槛（quality_gate_min，0-100）</mat-label>
          <input matInput type="number" [(ngModel)]="qualityGateMin" min="0" max="100" step="1" />
          <mat-hint>数据质量低于此值将中止运行，默认 60</mat-hint>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>期望采样间隔（秒）</mat-label>
          <input matInput type="number" [(ngModel)]="expectedIntervalSeconds" min="60" step="60" />
          <mat-hint>数据重采样目标间隔，默认 900（15分钟）</mat-hint>
        </mat-form-field>
      </div>
    </section>

    <footer class="footer">
      <div class="progress">
        @if (busy()) {
          <span class="spinner"></span>
          <span>{{ currentStep() }}</span>
        }
      </div>
      <button
        class="primary"
        type="button"
        [disabled]="busy() || !canRun()"
        (click)="run()"
      >
        {{ busy() ? '分析中…' : '开始分析' }}
      </button>
    </footer>

    @if (recentRuns().length) {
      <section class="card recent-card">
        <h2>最近运行（{{ recentRuns().length }}）</h2>
        <div class="recent-list">
          @for (run of recentRuns(); track run.run_id) {
            <button class="recent-item" type="button" (click)="openRun(run.run_id)">
              <div class="recent-main">
                <span class="recent-name">{{ run.dma_name }}</span>
                <span class="recent-time">{{ formatRunTime(run.created_at) }}</span>
              </div>
              <div class="recent-meta">
                @if (run.quality_score != null) {
                  <span class="recent-score">质量分 {{ run.quality_score.toFixed(1) }}</span>
                }
                <span class="recent-status" [class]="'rs-' + run.status">{{ run.status }}</span>
              </div>
            </button>
          }
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 860px;
      margin: 0 auto;
      color: var(--sw-text-primary);
    }
    .page-head {
      margin-bottom: 24px;
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
    .back-btn:hover {
      text-decoration: underline;
    }
    .eyebrow {
      margin: 0;
      color: var(--sw-color-primary);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    h1 {
      margin: 4px 0 8px;
      font-size: clamp(24px, 3vw, 32px);
    }
    .lead {
      color: var(--sw-text-secondary);
      line-height: 1.6;
      margin: 0;
      max-width: 640px;
    }
    .card {
      background: var(--sw-surface);
      border: 1px solid var(--sw-border);
      border-radius: var(--sw-radius-lg);
      padding: 20px 24px;
      margin-bottom: 16px;
      box-shadow: var(--sw-shadow-sm);
    }
    .card h2 {
      margin: 0 0 16px;
      font-size: 17px;
    }
    .hint {
      margin: -8px 0 16px;
      color: var(--sw-text-muted);
      font-size: 13px;
    }
    .full-width {
      width: 100%;
    }
    .binding-block {
      padding: 16px 0;
      border-top: 1px solid var(--sw-border);
    }
    .binding-block:first-of-type {
      border-top: none;
      padding-top: 0;
    }
    .binding-label {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .binding-label strong {
      font-size: 14px;
    }
    .role-desc {
      color: var(--sw-text-muted);
      font-size: 12px;
    }
    .role-tag {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
    }
    .role-tag.required {
      background: var(--sw-color-danger-soft);
      color: var(--sw-color-danger);
    }
    .param-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .alert {
      padding: 12px 16px;
      border-radius: 10px;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .alert.error {
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 0;
      gap: 16px;
    }
    .progress {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--sw-text-secondary);
      font-size: 13px;
    }
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--sw-border);
      border-top-color: var(--sw-color-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    button.primary {
      border: 0;
      background: var(--sw-color-primary);
      color: #fff;
      border-radius: 10px;
      padding: 12px 28px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
    }
    button.primary:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .recent-card {
      margin-top: 8px;
    }
    .recent-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .recent-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border: 1px solid var(--sw-border);
      border-radius: 10px;
      background: var(--sw-surface);
      cursor: pointer;
      text-align: left;
      font: inherit;
      color: inherit;
      transition: border-color 0.15s;
    }
    .recent-item:hover {
      border-color: var(--sw-color-primary);
    }
    .recent-main {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .recent-name {
      font-size: 14px;
      font-weight: 600;
    }
    .recent-time {
      font-size: 12px;
      color: var(--sw-text-muted);
    }
    .recent-meta {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .recent-score {
      font-size: 13px;
      color: var(--sw-color-primary);
      font-weight: 600;
    }
    .recent-status {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--sw-surface-muted);
      color: var(--sw-text-muted);
    }
    .recent-status.rs-success {
      background: #dcfce7;
      color: #166534;
    }
    .recent-status.rs-failed {
      background: #fee2e2;
      color: #991b1b;
    }
    .recent-status.rs-queued,
    .recent-status.rs-running {
      background: #dbeafe;
      color: #1e40af;
    }
    @media (max-width: 600px) {
      .param-grid {
        grid-template-columns: 1fr;
      }
      .footer {
        flex-direction: column;
        align-items: stretch;
      }
    }
  `,
})
export class S01LeakageScenePage implements OnInit {
  private readonly workflow = inject(S01WorkflowService);
  private readonly router = inject(Router);
  private readonly notice = inject(NotificationService);

  dmaName = '';
  qualityGateMin = 60;
  expectedIntervalSeconds = 900;

  readonly bindingConfigs: S01BindingConfig[] = [
    { role: 'inlet_flow', label: '进水流量（inlet_flow）', desc: 'DMA 区域入口流量计数据', selection: null },
    { role: 'authorized_consumption', label: '授权用水量（authorized_consumption）', desc: '用户水表汇总或营收系统抄表数据', selection: null },
    { role: 'legitimate_night_use', label: '合法夜间用水量（legitimate_night_use）', desc: '夜间最小流量中的合法用水部分估算', selection: null },
    { role: 'pressure', label: '管网压力（pressure）', desc: 'DMA 区域压力监测点数据，单位须为米(m)，不可与其他角色复用同一通道', selection: null },
  ];

  readonly busy = signal(false);
  readonly currentStep = signal('');
  readonly error = signal('');
  readonly recentRuns = signal<RecentRun[]>([]);

  private static readonly RECENT_KEY = 's01_recent_runs';
  private static readonly RECENT_MAX = 20;

  ngOnInit(): void {
    this.loadRecentRuns();
  }

  private loadRecentRuns(): void {
    try {
      const list = JSON.parse(localStorage.getItem(S01LeakageScenePage.RECENT_KEY) || '[]');
      this.recentRuns.set(Array.isArray(list) ? list : []);
    } catch {
      this.recentRuns.set([]);
    }
  }

  private saveRecentRun(run: RecentRun): void {
    try {
      const list = this.recentRuns().filter((r) => r.run_id !== run.run_id);
      list.unshift(run);
      const trimmed = list.slice(0, S01LeakageScenePage.RECENT_MAX);
      localStorage.setItem(S01LeakageScenePage.RECENT_KEY, JSON.stringify(trimmed));
      this.recentRuns.set(trimmed);
    } catch {
      // ignore
    }
  }

  openRun(runId: string): void {
    void this.router.navigate(['/s01/runs', runId]);
  }

  formatRunTime(iso: string): string {
    try {
      return new Date(iso).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  updateBinding(role: BindingRole, selection: DataAssetSelection | null): void {
    const cfg = this.bindingConfigs.find((c) => c.role === role);
    if (cfg) cfg.selection = selection;
  }

  private getBinding(role: BindingRole): DataAssetSelection | null {
    return this.bindingConfigs.find((c) => c.role === role)?.selection ?? null;
  }

  canRun(): boolean {
    return (
      this.dmaName.trim().length > 0 &&
      this.bindingConfigs.every((c) => !!c.selection?.channel)
    );
  }

  goBack(): void {
    void this.router.navigate(['/scenes']);
  }

  async run(): Promise<void> {
    if (!this.canRun() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');

    try {
      // 构建角色 → 数据选择映射
      const bindings: Record<BindingRole, DataAssetSelection | null> = {
        inlet_flow: this.getBinding('inlet_flow'),
        authorized_consumption: this.getBinding('authorized_consumption'),
        legitimate_night_use: this.getBinding('legitimate_night_use'),
        pressure: this.getBinding('pressure'),
      };

      // 前置校验：4 路通道不可重复
      const channelKeys = new Set<string>();
      for (const cfg of this.bindingConfigs) {
        const ch = cfg.selection?.channel;
        if (!ch) continue;
        const key = `${ch.monitor_point_id}:${ch.metric_code}`;
        if (channelKeys.has(key)) {
          throw new Error(`数据通道重复：「${cfg.label}」与其他角色使用了同一个监测点/指标，请分别选择不同的通道。`);
        }
        channelKeys.add(key);
      }

      // 前置校验：pressure 单位必须为米
      const pressureCh = bindings.pressure?.channel;
      if (pressureCh && pressureCh.unit && !/m|米|metre/i.test(pressureCh.unit)) {
        throw new Error(`压力通道单位不匹配：当前单位为「${pressureCh.unit}」，后端要求压力数据单位须为米（m / metres）。请选择单位为米的压力通道。`);
      }

      // 统一走 workflow 接口：模板 → 创建草稿 → 绑定数据 → 发布 → 运行
      const submission = await this.workflow.runScene(
        this.dmaName.trim(),
        bindings,
        {
          quality_gate_min: this.qualityGateMin,
          expected_interval_seconds: this.expectedIntervalSeconds,
        },
        (step) => this.currentStep.set(step),
      );

      const { run_id: runId, task_id: taskId, workflow_id: workflowId } = submission;

      // 存 task_id → run_id 映射，供任务详情页跳转使用
      if (runId && taskId) {
        try {
          const map = JSON.parse(localStorage.getItem('s01_task_run_map') || '{}');
          map[taskId] = runId;
          localStorage.setItem('s01_task_run_map', JSON.stringify(map));
        } catch {
          // localStorage 不可用时忽略
        }
      }

      this.notice.success('分析任务已提交。');

      // 保存到最近运行列表
      if (runId) {
        this.saveRecentRun({
          run_id: runId,
          dma_name: this.dmaName.trim(),
          quality_score: null,
          status: 'queued',
          created_at: new Date().toISOString(),
          workflow_id: workflowId,
        });
      }

      // 跳转到 S01 结果页（内部已改用 workflow-runs 接口）
      if (runId) {
        void this.router.navigate(['/s01/runs', runId]);
      } else {
        void this.router.navigate(['/scenes']);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '运行失败，请稍后重试。';
      this.error.set(message);
      this.notice.error(err, message);
    } finally {
      this.busy.set(false);
      this.currentStep.set('');
    }
  }
}
