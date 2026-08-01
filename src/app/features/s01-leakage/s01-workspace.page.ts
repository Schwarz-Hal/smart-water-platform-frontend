import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { finalize, forkJoin } from 'rxjs';

import {
  DataAssetSelection,
  S01BindingCreateRequest,
  S01BindingRole,
  S01Candidate,
  S01DatasetChannel,
  S01Dma,
  S01DmaBinding,
  S01NodeRun,
  S01RunRequest,
  S01RunSummary,
  S01Template,
} from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { TaskTrackerService, TaskTrackingHandle } from '../../core/services/task-tracker.service';
import { DataAssetPickerComponent } from '../../shared/components/data-asset-picker.component';
import { StatusChipComponent } from '../../shared/components/status-chip.component';
import { S01NodeDefinition, S01_NODES } from './s01-definition';

interface MappingRole {
  role: S01BindingRole;
  label: string;
  description: string;
  required: boolean;
}

const mappingRoles: MappingRole[] = [
  {
    role: 'inlet_flow',
    label: 'DMA 入口流量',
    description: '必需 · 与 DMA 总表或入口表绑定',
    required: true,
  },
  {
    role: 'authorized_consumption',
    label: '授权用水',
    description: '必需 · 与流量相同统计周期',
    required: true,
  },
  {
    role: 'legitimate_night_use',
    label: '合法夜间用水',
    description: '必需 · 不能以未知值替代 0',
    required: true,
  },
  {
    role: 'pressure',
    label: '压力时序',
    description: '可选 · 绑定后启用压力修正',
    required: false,
  },
  {
    role: 'outlet_flow',
    label: '出口/转输流量',
    description: '可选 · 用于净入流计算',
    required: false,
  },
  {
    role: 'known_losses',
    label: '已知损失',
    description: '可选 · 已确认的非漏损损失',
    required: false,
  },
];
const terminalStatuses = new Set(['success', 'failed', 'cancelled']);

@Component({
  selector: 'app-s01-workspace-page',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    DataAssetPickerComponent,
    StatusChipComponent,
  ],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">S01 · 固定流程工作区</p>
        <h1>DMA 漏损评估</h1>
        <p>在受审核 built-in 节点、已绑定 DMA 和授权数据集上创建真实 assessment run。</p>
      </div>
      <div class="status" [class.status-failed]="!!workspaceError()">
        <i></i><strong>{{ workspaceError() ? '接口读取失败' : 'assessment API 已接入' }}</strong>
        <small>{{
          workspaceError() || assessmentTemplate()?.template_code || '正在读取流程契约'
        }}</small>
      </div>
    </header>

    <section class="notice">
      <strong>固定 S01 流程可执行。</strong
      ><span>完成数据资产、DMA 和必需端口映射后，由后端异步运行质量门与漏损筛查节点。</span>
    </section>

    <section class="workspace">
      <aside class="flow-panel">
        <div class="heading">
          <div>
            <p class="kicker">固定 DAG</p>
            <h2>流程节点</h2>
          </div>
          <small>{{ nodes().length }} 个 block</small>
        </div>
        <div class="node-stack">
          @for (node of nodes(); track node.code; let index = $index) {
            <button
              type="button"
              class="node"
              [class.selected]="selectedCode() === node.code"
              (click)="select(node.code)"
            >
              <span class="node-index">{{ index + 1 }}</span>
              <span class="node-name"
                ><strong>{{ node.shortTitle }}</strong
                ><small>{{ node.code }}</small></span
              >
              <em [class.waiting]="nodeRunLabel(node) !== '可运行'">{{ nodeRunLabel(node) }}</em>
            </button>
            @if (!$last) {
              <div class="connector">↓</div>
            }
          }
        </div>
      </aside>

      <main class="node-inspector">
        @if (selectedNode(); as node) {
          <mat-card class="card node-card">
            <div class="heading">
              <div>
                <p class="kicker">当前节点</p>
                <h2>{{ node.title }}</h2>
                <code>{{ node.code }}</code>
              </div>
              <span class="badge">{{ nodeRunLabel(node) }}</span>
            </div>
            <p class="description">{{ node.description }}</p>
            <div class="ports">
              <section>
                <h3>输入端口</h3>
                @for (port of node.inputs; track port.name) {
                  <div class="port">
                    <i></i
                    ><span
                      ><strong>{{ port.label }}</strong
                      ><small>{{ port.name }} · {{ port.unit || '—' }}</small></span
                    >
                    @if (port.optional) {
                      <em>可选</em>
                    }
                  </div>
                }
              </section>
              <span class="port-arrow">→</span>
              <section>
                <h3>输出端口</h3>
                @for (port of node.outputs; track port.name) {
                  <div class="port output">
                    <span
                      ><strong>{{ port.label }}</strong
                      ><small>{{ port.name }} · {{ port.unit || '—' }}</small></span
                    ><i></i>
                  </div>
                }
              </section>
            </div>
          </mat-card>
          <mat-card class="card">
            <div class="heading">
              <div>
                <p class="kicker">可调参数</p>
                <h2>节点参数</h2>
              </div>
              <button mat-stroked-button type="button" (click)="reset(node.code)">恢复默认</button>
            </div>
            <div class="parameter-grid">
              @for (parameter of node.parameters; track parameter.key) {
                <label
                  ><strong>{{ parameter.label }}</strong
                  ><input
                    type="number"
                    [(ngModel)]="parameter.value"
                    [min]="parameter.min ?? null"
                    [max]="parameter.max ?? null"
                    [step]="parameter.step || 1"
                  /><small>{{ parameter.description }}</small></label
                >
              }
            </div>
          </mat-card>
          <mat-card class="card result-contract"
            ><div class="heading">
              <div>
                <p class="kicker">结果契约</p>
                <h2>{{ node.visualization.label }}</h2>
              </div>
              <span class="viz-kind">{{ visualizationLabel(node.visualization.kind) }}</span>
            </div>
            <div class="preview"><i></i><i></i><i></i><i></i><i></i></div>
            <p>
              真实运行后会按规范字段渲染：{{ node.visualization.series.join('、') }}。
            </p></mat-card
          >
        }
      </main>

      <aside class="data-panel">
        <div class="heading">
          <div>
            <p class="kicker">真实数据通道</p>
            <h2>DMA 输入映射</h2>
          </div>
          <small>{{ dmas().length }} 个 DMA</small>
        </div>
        <p class="hint">
          选择数据资产后，系统只列出该版本真实存在的监测通道；映射不会暴露源库连接信息。
        </p>
        <app-data-asset-picker (selectionChange)="applyDataSelection($event)" />
        <div class="mapping-form">
          <label
            ><strong>DMA</strong
            ><select [ngModel]="selectedDmaId()" (ngModelChange)="changeDma($event)">
              <option [ngValue]="null">请选择 DMA</option>
              @for (dma of dmas(); track dma.id) {
                <option [ngValue]="dma.id">{{ dma.name }} · {{ dma.code }}</option>
              }
            </select></label
          >
          <p class="loaded-summary">
            默认值来源：{{ valueSource === 'processed' ? '处理/修复值' : '原始值' }}
          </p>
        </div>
        @if (datasetLoadedId() !== null) {
          <p class="loaded-summary">当前版本包含 {{ channels().length }} 个可映射通道。</p>
        }
        <div class="channel-list">
          @for (role of mappingRoles; track role.role) {
            <div class="channel" [class.channel-mapped]="activeBinding(role.role)">
              <i></i
              ><span
                ><strong
                  >{{ role.label }}
                  @if (role.required) {
                    <b>必需</b>
                  }</strong
                ><small>{{
                  activeBinding(role.role)
                    ? bindingDescription(activeBinding(role.role)!)
                    : role.description
                }}</small></span
              >
              @if (activeBinding(role.role)) {
                <em class="mapped">已映射</em>
              } @else {
                <div class="mapping-action">
                  <select
                    [ngModel]="mappingChoice(role.role)"
                    (ngModelChange)="setMappingChoice(role.role, $event)"
                  >
                    <option value="">选择通道</option>
                    @for (channel of channels(); track channelKey(channel)) {
                      <option [value]="channelKey(channel)">
                        {{ channel.point_name }} · {{ channel.metric_code }}
                      </option>
                    }</select
                  ><button
                    mat-stroked-button
                    type="button"
                    [disabled]="!canCreateBinding(role.role)"
                    (click)="createBinding(role.role)"
                  >
                    {{ bindingSaving() === role.role ? '提交中…' : '映射' }}
                  </button>
                </div>
              }
            </div>
          }
        </div>
        <div class="run-boundary">
          <strong>创建真实 assessment run</strong>
          <p>数据集、DMA 和三类必需端口均由后端校验；节点参数会随运行快照保存。</p>
          @if (!canRun()) {
            <p class="run-reason">{{ runBlockReason() }}</p>
          }
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="!canRun() || runSubmitting()"
            (click)="runAssessment()"
          >
            {{ runSubmitting() ? '正在创建任务…' : '运行 S01 评估' }}
          </button>
        </div>
      </aside>
    </section>

    @if (currentRun(); as run) {
      <section class="execution-panel">
        <div class="heading">
          <div>
            <p class="kicker">真实运行</p>
            <h2>Assessment run {{ run.run_id }}</h2>
            <p>
              trace_id：<code>{{ run.trace_id }}</code>
            </p>
          </div>
          <app-status-chip [status]="trackedTask()?.status ?? run.status" />
        </div>
        <div class="run-summary">
          <div>
            <small>任务状态</small><strong>{{ trackedTask()?.status ?? run.task_status }}</strong>
          </div>
          <div>
            <small>进度</small><strong>{{ trackedTask()?.progress ?? run.progress }}%</strong>
          </div>
          <div>
            <small>质量评分</small><strong>{{ run.quality_score ?? '待完成' }}</strong>
          </div>
          <div>
            <small>事件通道</small><strong>{{ tracking()?.connection() ?? '未连接' }}</strong>
          </div>
        </div>
        @if (trackedTask()?.error_message || run.error_message) {
          <p class="run-error">{{ trackedTask()?.error_message ?? run.error_message }}</p>
        }
        <div class="execution-actions">
          <button mat-stroked-button type="button" (click)="loadRunDetails()">
            读取节点与候选结果
          </button>
          @if (canCancelRun()) {
            <button mat-stroked-button type="button" (click)="cancelRun()">取消此运行</button>
          }
        </div>
        @if (nodeRuns().length) {
          <div class="result-columns">
            <section>
              <h3>节点执行</h3>
              @for (nodeRun of nodeRuns(); track nodeRun.id) {
                <div class="result-row">
                  <span
                    ><strong>{{ nodeRun.node_name }}</strong
                    ><small>{{ nodeRun.node_code }} · {{ nodeRun.progress }}%</small></span
                  ><app-status-chip [status]="nodeRun.status" />
                </div>
              }
            </section>
            <section>
              <h3>DMA 风险候选</h3>
              @for (candidate of candidates(); track candidate.id) {
                <div class="result-row">
                  <span
                    ><strong>风险 {{ candidate.risk_score }}</strong
                    ><small
                      >{{ candidate.start_time || '—' }} 至 {{ candidate.end_time || '—' }}</small
                    ></span
                  ><app-status-chip [status]="candidate.status" />
                </div>
              } @empty {
                <p class="hint">后端尚未产生候选；这不等同于“确认无漏损”。</p>
              }
            </section>
          </div>
        }
      </section>
    }
    <section class="boundary">
      <div>
        <p class="kicker">业务边界</p>
        <h2>候选不等于漏点结论</h2>
      </div>
      <ul>
        <li>第一版只输出 DMA 级、可解释且需要人工核验的风险候选。</li>
        <li>未知的出口、授权用水或合法夜间用水不能被当作零。</li>
        <li>管段定位仍依赖 GIS、管网拓扑、压力传感器映射及 EPANET。</li>
      </ul>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    h1,
    h2,
    h3,
    p {
      margin-top: 0;
    }
    h1 {
      margin-bottom: 7px;
      font-size: 28px;
    }
    h2 {
      margin-bottom: 5px;
      font-size: 18px;
    }
    h3 {
      margin: 0 0 8px;
      color: #5b6880;
      font-size: 12px;
      letter-spacing: 0.05em;
    }
    .page-header,
    .heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
    }
    .page-header > div:first-child > p:not(.eyebrow) {
      max-width: 700px;
      margin-bottom: 0;
      color: #64748b;
      line-height: 1.55;
    }
    .eyebrow,
    .kicker {
      margin: 0 0 6px;
      color: #0f4c81;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.09em;
      text-transform: uppercase;
    }
    .status {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 2px 8px;
      min-width: 185px;
      padding: 10px 12px;
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      background: #eff6ff;
      color: #1e3a5f;
      font-size: 12px;
    }
    .status i {
      grid-row: span 2;
      width: 8px;
      height: 8px;
      margin-top: 4px;
      border-radius: 50%;
      background: #16a34a;
    }
    .status small {
      color: #5d7490;
      overflow-wrap: anywhere;
    }
    .status-failed {
      border-color: #fecaca;
      background: #fef2f2;
      color: #991b1b;
    }
    .status-failed i {
      background: #dc2626;
    }
    .notice {
      display: flex;
      gap: 10px;
      align-items: center;
      margin: 18px 0;
      padding: 13px 15px;
      border: 1px solid #fde68a;
      border-radius: 10px;
      background: #fffbeb;
      color: #92400e;
      font-size: 13px;
    }
    .notice span {
      color: #a16207;
    }
    .workspace {
      display: grid;
      grid-template-columns: minmax(230px, 0.8fr) minmax(430px, 1.6fr) minmax(320px, 1fr);
      gap: 16px;
      align-items: start;
      min-width: 0;
    }
    .flow-panel,
    .data-panel {
      min-width: 0;
      padding: 15px;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      background: #fff;
    }
    .data-panel {
      position: sticky;
      top: 16px;
      container-type: inline-size;
    }
    .heading > small,
    .viz-kind {
      color: #64748b;
      font-size: 12px;
    }
    .node-stack {
      margin-top: 15px;
    }
    .node {
      display: flex;
      align-items: center;
      width: 100%;
      gap: 9px;
      padding: 10px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #fff;
      text-align: left;
      cursor: pointer;
    }
    .node:hover,
    .node.selected {
      border-color: #60a5fa;
      background: #eff6ff;
    }
    .node-index {
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #e2e8f0;
      color: #475569;
      font-size: 11px;
      font-weight: 800;
    }
    .selected .node-index {
      background: #0f4c81;
      color: #fff;
    }
    .node-name {
      min-width: 0;
      flex: 1;
    }
    .node-name strong,
    .node-name small,
    .port strong,
    .port small,
    .channel strong,
    .channel small {
      display: block;
    }
    .node-name strong {
      font-size: 13px;
      color: #1e293b;
    }
    .node-name small {
      overflow: hidden;
      color: #64748b;
      font-family: ui-monospace, monospace;
      font-size: 10px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .node em,
    .badge {
      flex: none;
      padding: 3px 6px;
      border-radius: 999px;
      background: #dcfce7;
      color: #166534;
      font-size: 10px;
      font-style: normal;
      font-weight: 700;
    }
    .node em.waiting {
      background: #fef3c7;
      color: #92400e;
    }
    .connector {
      height: 17px;
      color: #94a3b8;
      text-align: center;
      font-size: 13px;
      line-height: 17px;
    }
    .node-inspector {
      display: grid;
      gap: 14px;
      min-width: 0;
    }
    .card {
      min-width: 0;
      padding: 18px;
    }
    .node-card code,
    .execution-panel code {
      color: #64748b;
      font-size: 11px;
    }
    .description,
    .hint {
      color: #64748b;
      line-height: 1.55;
    }
    .ports {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      margin-top: 16px;
      padding-top: 15px;
      border-top: 1px solid #eef2f7;
    }
    .port {
      display: flex;
      align-items: center;
      gap: 7px;
      min-height: 40px;
      margin: 6px 0;
      padding: 7px 8px;
      border-radius: 8px;
      background: #f8fafc;
      font-size: 12px;
    }
    .port.output {
      justify-content: space-between;
      background: #f0fdf4;
      text-align: right;
    }
    .port i,
    .channel > i {
      width: 8px;
      height: 8px;
      flex: none;
      border-radius: 50%;
      background: #2563eb;
    }
    .port.output i {
      background: #16a34a;
    }
    .port small {
      color: #64748b;
      font-family: ui-monospace, monospace;
      font-size: 10px;
    }
    .port em {
      margin-left: auto;
      color: #a16207;
      font-size: 10px;
      font-style: normal;
    }
    .port-arrow {
      color: #94a3b8;
      font-size: 20px;
    }
    .parameter-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .parameter-grid label {
      display: grid;
      gap: 5px;
      color: #334155;
      font-size: 12px;
    }
    .parameter-grid input,
    .mapping-form select,
    .mapping-action select {
      width: 100%;
      min-width: 0;
      padding: 8px;
      border: 1px solid #cbd5e1;
      border-radius: 7px;
      background: #fff;
      color: #334155;
      font: inherit;
    }
    .parameter-grid small {
      min-height: 30px;
      color: #64748b;
      font-size: 11px;
      line-height: 1.35;
    }
    .result-contract > p {
      margin-bottom: 0;
      color: #64748b;
      font-size: 12px;
    }
    .preview {
      display: flex;
      align-items: end;
      gap: 10px;
      min-height: 120px;
      margin: 14px 0 10px;
      padding: 14px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: linear-gradient(#fff, #f8fafc);
    }
    .preview i {
      flex: 1;
      border-radius: 5px 5px 2px 2px;
      background: linear-gradient(#60a5fa, #0f4c81);
    }
    .preview i:nth-child(1) {
      height: 28%;
    }
    .preview i:nth-child(2) {
      height: 55%;
    }
    .preview i:nth-child(3) {
      height: 82%;
    }
    .preview i:nth-child(4) {
      height: 45%;
    }
    .preview i:nth-child(5) {
      height: 68%;
    }
    .hint {
      font-size: 12px;
    }
    .mapping-form {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      margin: 12px 0;
    }
    .mapping-form label {
      display: grid;
      gap: 4px;
      color: #475569;
      font-size: 11px;
      font-weight: 700;
    }
    .loaded-summary,
    .run-reason {
      margin: 8px 0;
      color: #475569;
      font-size: 11px;
      line-height: 1.45;
    }
    .channel-list {
      display: grid;
    }
    .channel {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px;
      align-items: start;
      padding: 11px 0;
      border-bottom: 1px solid #f1f5f9;
    }
    .channel > i {
      grid-row: span 2;
      margin-top: 4px;
      border-radius: 2px;
      background: #cbd5e1;
    }
    .channel strong {
      font-size: 12px;
      color: #334155;
    }
    .channel small {
      color: #64748b;
      font-size: 10px;
      line-height: 1.4;
      overflow-wrap: anywhere;
    }
    .channel b {
      margin-left: 4px;
      color: #b45309;
      font-size: 10px;
    }
    .channel em {
      grid-column: 2;
      justify-self: start;
      padding: 3px 5px;
      border-radius: 999px;
      background: #fef3c7;
      color: #92400e;
      font-size: 10px;
      font-style: normal;
    }
    .channel-mapped > i {
      background: #16a34a;
    }
    .channel em.mapped {
      background: #dcfce7;
      color: #166534;
    }
    .mapping-action {
      display: grid;
      grid-column: 2;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 7px;
      min-width: 0;
    }
    .mapping-action button {
      min-width: 0;
      padding: 0 10px;
      font-size: 11px;
    }
    .run-boundary {
      margin-top: 15px;
      padding: 12px;
      border-radius: 10px;
      background: #f8fafc;
    }
    .run-boundary strong {
      font-size: 12px;
      color: #334155;
    }
    .run-boundary p {
      margin: 8px 0 12px;
      color: #64748b;
      font-size: 11px;
      line-height: 1.55;
    }
    .run-boundary .run-reason {
      color: #a16207;
    }
    .run-boundary button {
      width: 100%;
      font-size: 12px;
    }
    .execution-panel {
      margin-top: 16px;
      padding: 18px;
      border: 1px solid #bfdbfe;
      border-radius: 14px;
      background: #fff;
    }
    .run-summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin: 15px 0;
    }
    .run-summary div,
    .result-row {
      padding: 10px;
      border-radius: 8px;
      background: #f8fafc;
    }
    .run-summary small,
    .result-row small {
      display: block;
      color: #64748b;
      font-size: 11px;
    }
    .run-summary strong {
      display: block;
      margin-top: 3px;
      color: #1e3a5f;
      font-size: 14px;
    }
    .execution-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .run-error {
      margin: 10px 0;
      padding: 10px;
      border-radius: 8px;
      background: #fef2f2;
      color: #b91c1c;
      font-size: 12px;
    }
    .result-columns {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 16px;
      margin-top: 15px;
    }
    .result-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
    }
    .result-row strong {
      font-size: 12px;
    }
    .boundary {
      display: grid;
      grid-template-columns: 250px minmax(0, 1fr);
      gap: 20px;
      margin-top: 16px;
      padding: 18px;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      background: #fff;
    }
    .boundary ul {
      margin: 0;
      padding-left: 18px;
      color: #475569;
      line-height: 1.6;
    }
    .boundary li + li {
      margin-top: 5px;
    }
    @container (max-width: 390px) {
      .mapping-action {
        grid-template-columns: minmax(0, 1fr);
      }
      .mapping-action button {
        justify-self: start;
      }
    }
    @media (max-width: 1180px) {
      .workspace {
        grid-template-columns: minmax(230px, 0.7fr) minmax(0, 1.4fr);
      }
      .data-panel {
        position: static;
        grid-column: 1 / -1;
      }
      .channel-list {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 18px;
      }
      .run-boundary {
        max-width: 500px;
      }
    }
    @media (max-width: 760px) {
      .page-header,
      .notice {
        align-items: flex-start;
        flex-direction: column;
      }
      .workspace {
        grid-template-columns: minmax(0, 1fr);
      }
      .data-panel {
        grid-column: auto;
      }
      .channel-list {
        grid-template-columns: minmax(0, 1fr);
      }
      .ports,
      .result-columns,
      .boundary {
        grid-template-columns: minmax(0, 1fr);
      }
      .port-arrow {
        transform: rotate(90deg);
        text-align: center;
      }
      .port.output {
        text-align: left;
      }
      .status {
        width: 100%;
      }
      .run-summary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
})
export class S01WorkspacePage {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly tracker = inject(TaskTrackerService);
  readonly nodes = signal(S01_NODES.map((node) => this.cloneNode(node)));
  readonly selectedCode = signal(S01_NODES[0].code);
  readonly selectedNode = computed(
    () => this.nodes().find((node) => node.code === this.selectedCode()) ?? null,
  );
  readonly assessmentTemplate = signal<S01Template | null>(null);
  readonly dmas = signal<S01Dma[]>([]);
  readonly selectedDmaId = signal<number | null>(null);
  readonly channels = signal<S01DatasetChannel[]>([]);
  readonly datasetLoadedId = signal<number | null>(null);
  readonly bindings = signal<S01DmaBinding[]>([]);
  readonly bindingSaving = signal<S01BindingRole | null>(null);
  readonly runSubmitting = signal(false);
  readonly workspaceError = signal<string | null>(null);
  readonly mappingChoices = signal<Partial<Record<S01BindingRole, string>>>({});
  readonly currentRun = signal<S01RunSummary | null>(null);
  readonly nodeRuns = signal<S01NodeRun[]>([]);
  readonly candidates = signal<S01Candidate[]>([]);
  readonly tracking = signal<TaskTrackingHandle | null>(null);
  readonly trackedTask = computed(() => this.tracking()?.task() ?? null);
  readonly mappingRoles = mappingRoles;
  valueSource: 'raw' | 'processed' = 'raw';
  qualityGateMin = 60;
  constructor() {
    this.loadWorkspace();
  }
  loadWorkspace(): void {
    this.workspaceError.set(null);
    forkJoin({
      template: this.api.get<S01Template>('/api/v1/s01/template'),
      dmas: this.api.get<S01Dma[]>('/api/v1/s01/dmas'),
    }).subscribe({
      next: ({ template, dmas }) => {
        this.assessmentTemplate.set(template);
        this.dmas.set(dmas);
        const selected = dmas.find((dma) => dma.id === this.selectedDmaId()) ?? dmas[0] ?? null;
        this.selectedDmaId.set(selected?.id ?? null);
        if (selected) this.loadBindings();
      },
      error: (error: unknown) => {
        this.workspaceError.set('无法读取 S01 流程或 DMA，请确认 API、登录权限和端口转发。');
        this.notifications.error(error, '无法读取 S01 工作区。');
      },
    });
  }
  applyDataSelection(selection: DataAssetSelection | null): void {
    if (!selection) {
      this.channels.set([]);
      this.datasetLoadedId.set(null);
      return;
    }
    this.channels.set(selection.channels);
    this.datasetLoadedId.set(selection.version.id);
    this.valueSource = selection.value_source;
  }
  changeDma(value: unknown): void {
    const id = this.positiveInteger(value);
    this.selectedDmaId.set(id);
    this.bindings.set([]);
    this.mappingChoices.set({});
    if (id) this.loadBindings();
  }
  loadBindings(): void {
    const dmaId = this.selectedDmaId();
    if (!dmaId) {
      this.bindings.set([]);
      return;
    }
    this.api.get<S01DmaBinding[]>(`/api/v1/s01/dmas/${dmaId}/bindings`).subscribe({
      next: (bindings) => this.bindings.set(bindings.filter((binding) => binding.is_active)),
      error: (error: unknown) => this.notifications.error(error, '无法读取 DMA 输入映射。'),
    });
  }
  mappingChoice(role: S01BindingRole): string {
    return this.mappingChoices()[role] ?? '';
  }
  setMappingChoice(role: S01BindingRole, value: string): void {
    this.mappingChoices.update((choices) => ({ ...choices, [role]: value }));
  }
  createBinding(role: S01BindingRole): void {
    const dmaId = this.selectedDmaId();
    const channel = this.selectedChannel(role);
    if (!dmaId || !channel) {
      this.notifications.error(new Error('请先选择 DMA 和数据通道。'));
      return;
    }
    const definition = mappingRoles.find((item) => item.role === role);
    const body: S01BindingCreateRequest = {
      binding_role: role,
      monitor_point_id: channel.monitor_point_id,
      metric_code: channel.metric_code,
      value_source: this.valueSource,
      multiplier: 1,
      is_required: definition?.required ?? false,
      metadata_json: { source_key: channel.source_key, created_from: 's01-workspace' },
    };
    this.bindingSaving.set(role);
    this.api
      .post<S01DmaBinding, S01BindingCreateRequest>(`/api/v1/s01/dmas/${dmaId}/bindings`, body)
      .pipe(finalize(() => this.bindingSaving.set(null)))
      .subscribe({
        next: () => {
          this.notifications.success(`${definition?.label ?? role} 已映射。`);
          this.setMappingChoice(role, '');
          this.loadBindings();
        },
        error: (error: unknown) => this.notifications.error(error, '创建 DMA 映射失败。'),
      });
  }
  activeBinding(role: S01BindingRole): S01DmaBinding | undefined {
    return this.bindings().find(
      (binding) =>
        binding.role === role &&
        binding.is_active &&
        this.channels().some(
          (channel) =>
            channel.monitor_point_id === binding.monitor_point_id &&
            channel.metric_code === binding.metric_code,
        ),
    );
  }
  bindingDescription(binding: S01DmaBinding): string {
    const channel = this.channels().find(
      (item) =>
        item.monitor_point_id === binding.monitor_point_id &&
        item.metric_code === binding.metric_code,
    );
    return `${channel?.point_name ?? `点位 #${binding.monitor_point_id}`} · ${binding.metric_code} · ${binding.value_source}`;
  }
  channelKey(channel: S01DatasetChannel): string {
    return `${channel.monitor_point_id}:${channel.metric_code}`;
  }
  canCreateBinding(role: S01BindingRole): boolean {
    return !!this.selectedDmaId() && !!this.selectedChannel(role) && !this.bindingSaving();
  }
  requiredMappingsReady(): boolean {
    return this.requiredRoles().every((role) => !!this.activeBinding(role));
  }
  canRun(): boolean {
    return (
      this.auth.hasPermission('assessment:run') &&
      !!this.assessmentTemplate() &&
      !!this.selectedDmaId() &&
      this.datasetLoadedId() !== null &&
      this.requiredMappingsReady()
    );
  }
  runBlockReason(): string {
    if (!this.auth.hasPermission('assessment:run')) return '当前账户缺少 assessment:run 权限。';
    if (!this.assessmentTemplate()) return '尚未读取 S01 流程契约。';
    if (!this.selectedDmaId()) return '请选择一个 DMA。';
    if (this.datasetLoadedId() === null) return '请选择一个可用数据版本。';
    return this.requiredMappingsReady()
      ? '正在检查执行条件。'
      : '请完成入口流量、授权用水和合法夜间用水的映射。';
  }
  runAssessment(): void {
    const dmaId = this.selectedDmaId();
    const datasetVersionId = this.datasetLoadedId();
    if (!this.canRun() || !dmaId || !datasetVersionId) return;
    const body: S01RunRequest = {
      dma_id: dmaId,
      dataset_version_id: datasetVersionId,
      quality_gate_min: this.qualityGateMin,
      expected_interval_seconds: this.parameterValue('qscore_v1', 'expected_interval_seconds', 900),
      node_params: this.nodeParameters(),
    };
    this.runSubmitting.set(true);
    this.api
      .post<S01RunSummary, S01RunRequest>('/api/v1/s01/runs', body)
      .pipe(finalize(() => this.runSubmitting.set(false)))
      .subscribe({
        next: (run) => {
          this.currentRun.set(run);
          this.nodeRuns.set([]);
          this.candidates.set([]);
          this.tracking.set(this.tracker.track(run.task_id));
          this.notifications.success('S01 assessment run 已创建，正在追踪真实任务状态。');
        },
        error: (error: unknown) => this.notifications.error(error, '无法创建 S01 assessment run。'),
      });
  }
  loadRunDetails(): void {
    const run = this.currentRun();
    if (!run) return;
    forkJoin({
      run: this.api.get<S01RunSummary>(`/api/v1/s01/runs/${run.run_id}`),
      nodes: this.api.get<S01NodeRun[]>(`/api/v1/s01/runs/${run.run_id}/nodes`),
      candidates: this.api.get<S01Candidate[]>(`/api/v1/s01/runs/${run.run_id}/candidates`),
    }).subscribe({
      next: ({ run: refreshedRun, nodes, candidates }) => {
        this.currentRun.set(refreshedRun);
        this.nodeRuns.set(nodes);
        this.candidates.set(candidates);
      },
      error: (error: unknown) => this.notifications.error(error, '无法读取 S01 运行结果。'),
    });
  }
  canCancelRun(): boolean {
    const run = this.currentRun();
    return !!run && this.auth.hasPermission('assessment:run') && !terminalStatuses.has(run.status);
  }
  cancelRun(): void {
    const run = this.currentRun();
    if (!run || !this.canCancelRun()) return;
    this.api
      .post<S01RunSummary, Record<string, never>>(`/api/v1/s01/runs/${run.run_id}/cancel`, {})
      .subscribe({
        next: (updated) => {
          this.currentRun.set(updated);
          this.notifications.success('已请求取消 S01 assessment run。');
        },
        error: (error: unknown) =>
          this.notifications.error(error, '取消 S01 assessment run 失败。'),
      });
  }
  select(code: string): void {
    this.selectedCode.set(code);
  }
  reset(code: string): void {
    this.nodes.update((nodes) =>
      nodes.map((node) =>
        node.code === code
          ? this.cloneNode(S01_NODES.find((item) => item.code === code) ?? node)
          : node,
      ),
    );
  }
  nodeRunLabel(node: S01NodeDefinition): string {
    if (!this.assessmentTemplate()) return '读取中';
    if (this.requiredMappingsReady()) return '可运行';
    return node.status === 'builtin_ready' ? 'built-in' : '待映射';
  }
  visualizationLabel(kind: string): string {
    return (
      {
        line: '折线图',
        bar: '柱状图',
        line_with_flags: '折线 + 标记',
        risk_timeline: '风险时间线',
      }[kind] ?? '图表'
    );
  }
  private selectedChannel(role: S01BindingRole): S01DatasetChannel | undefined {
    const key = this.mappingChoice(role);
    return this.channels().find((channel) => this.channelKey(channel) === key);
  }
  private requiredRoles(): S01BindingRole[] {
    const roles = this.assessmentTemplate()?.required_binding_roles;
    return roles?.length
      ? roles
      : mappingRoles.filter((role) => role.required).map((role) => role.role);
  }
  private nodeParameters(): Record<string, Record<string, number>> {
    return Object.fromEntries(
      this.nodes().map((node) => [
        node.code,
        Object.fromEntries(
          node.parameters.map((parameter) => [parameter.key, Number(parameter.value)]),
        ),
      ]),
    );
  }
  private parameterValue(nodeCode: string, key: string, fallback: number): number {
    const value = this.nodes()
      .find((node) => node.code === nodeCode)
      ?.parameters.find((parameter) => parameter.key === key)?.value;
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }
  private positiveInteger(value: unknown): number | null {
    const numeric = Number(value);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
  }
  private cloneNode(node: S01NodeDefinition): S01NodeDefinition {
    return {
      ...node,
      inputs: [...node.inputs],
      outputs: [...node.outputs],
      parameters: node.parameters.map((parameter) => ({ ...parameter })),
    };
  }
}
