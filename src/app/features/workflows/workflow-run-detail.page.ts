import { JsonPipe } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import {
  WorkflowArtifact,
  WorkflowNodeRun,
  WorkflowResult,
  WorkflowRunSummary,
} from '../../core/models/api.models';
import { ApiClient } from '../../core/services/api-client.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { TaskTrackingHandle, TaskTrackerService } from '../../core/services/task-tracker.service';
import { OperatorNameService } from '../../core/services/operator-name.service';
import { BeijingTimePipe } from '../../shared/pipes/beijing-time.pipe';
import { WorkflowArtifactRendererComponent } from './workflow-artifact-renderer.component';

interface GraphNode {
  id: string;
  node_code: string;
  node_version?: string;
  ui?: { position?: { x: number; y: number } };
}

@Component({
  selector: 'app-workflow-run-detail-page',
  imports: [
    BeijingTimePipe,
    JsonPipe,
    MatButtonModule,
    MatCardModule,
    MatProgressBarModule,
    RouterLink,
    WorkflowArtifactRendererComponent,
  ],
  template: `
    @if (run(); as current) {
      <header class="page-header">
        <div>
          <p class="eyebrow">工作流运行</p>
          <h1>{{ current.workflow_name || '工作流运行' }}</h1>
          <p class="subline">v{{ current.workflow_version || '—' }} · {{ current.run_id }}</p>
        </div>
        <div class="actions">
          <a mat-stroked-button [routerLink]="['/workflow-runs']">运行记录</a
          ><button mat-stroked-button (click)="refresh()">刷新</button>
          @if (canCancel()) {
            <button mat-flat-button color="warn" (click)="cancel()">取消运行</button>
          }
        </div>
      </header>
      <section class="summary-grid">
        <mat-card
          ><span>状态</span
          ><strong class="status" [attr.data-status]="current.status">{{
            statusLabel(current.status)
          }}</strong></mat-card
        ><mat-card
          ><span>进度</span><strong>{{ current.progress }}%</strong
          ><mat-progress-bar mode="determinate" [value]="current.progress" /></mat-card
        ><mat-card
          ><span>节点</span
          ><strong>{{ current.node_success_count }}/{{ current.node_count }}</strong
          ><small>成功节点 / 总节点</small></mat-card
        ><mat-card
          ><span>trace_id</span><strong class="mono">{{ current.trace_id }}</strong></mat-card
        >
      </section>
      @if (current.error_message) {
        <div class="error-banner">{{ current.error_code }} · {{ current.error_message }}</div>
      }
      <section class="layout">
        <div class="main-column">
          <mat-card class="panel"
            ><div class="section-title">
              <h2>节点执行</h2>
              <span>{{ connectionLabel() }}</span>
            </div>
            <div class="node-list">
              @for (node of graphNodes(); track node.id) {
                @let state = nodeState(node.id);
                <button
                  class="node-row"
                  [class.selected]="selectedNodeId() === node.id"
                  (click)="selectNode(node.id)"
                >
                  <span class="node-state" [attr.data-status]="state?.status || 'waiting'"></span
                  ><span class="node-copy"
                    ><strong>{{ nodeLabel(node) }}</strong
                    ><small>{{ node.node_code }} · {{ state?.status || 'waiting' }}</small></span
                  ><span>{{ state?.progress || 0 }}%</span>
                </button>
              }
            </div></mat-card
          ><mat-card class="panel"
            ><div class="section-title">
              <h2>最终结果</h2>
              <span>{{ finalOutputs().length }} 个输出</span>
            </div>
            @if (!finalOutputs().length) {
              <div class="empty">任务完成后，工作流声明的最终输出会显示在这里。</div>
            } @else {
              @for (item of finalOutputs(); track item.id) {
                <div class="artifact-card">
                  <app-workflow-artifact-renderer [artifact]="item" />
                </div>
              }
            }
          </mat-card>
        </div>
        <aside class="side-column">
          <mat-card class="panel"
            ><h2>节点详情</h2>
            @if (selectedNodeRun(); as node) {
              <h3>{{ operatorNames.displayName(node.node_code, node.node_code) }}</h3>
              <p class="muted">{{ node.node_instance_id }} · {{ node.node_version }}</p>
              <dl>
                <dt>状态</dt>
                <dd>{{ statusLabel(node.status) }}</dd>
                <dt>开始</dt>
                <dd>{{ node.started_at | beijingTime }}</dd>
                <dt>结束</dt>
                <dd>{{ node.finished_at | beijingTime }}</dd>
              </dl>
              @if (node.error_message) {
                <div class="error-text">{{ node.error_code }} · {{ node.error_message }}</div>
              }
              <h3>节点输出</h3>
              @if (!selectedArtifacts().length) {
                <p class="muted">暂无输出。</p>
              } @else {
                @for (item of selectedArtifacts(); track item.id) {
                  <div class="artifact-card">
                    <app-workflow-artifact-renderer [artifact]="item" />
                  </div>
                }
              }
              <h3>参数快照</h3>
              <pre>{{ node.params_snapshot | json }}</pre>
            } @else {
              <div class="empty">点击左侧节点查看输入、参数和输出。</div>
            }</mat-card
          ><mat-card class="panel"
            ><h2>任务日志</h2>
            <div class="logs">
              @for (log of logs(); track $index) {
                <div>
                  <time>{{ log.created_at | beijingTime: 'HH:mm:ss' }}</time
                  ><span>{{ log.message }}</span>
                </div>
              } @empty {
                <p class="muted">暂无日志。</p>
              }
            </div></mat-card
          >
        </aside>
      </section>
    } @else {
      <div class="empty page-empty">正在读取工作流运行…</div>
    }
  `,
  styles: `
    :host {
      display: block;
      color: #172033;
      min-width: 0;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 20px;
      margin-bottom: 16px;
    }
    h1,
    h2,
    h3,
    p {
      margin: 0;
    }
    h1 {
      margin-top: 4px;
      font-size: 30px;
    }
    h2 {
      font-size: 16px;
    }
    h3 {
      font-size: 14px;
      margin: 16px 0 7px;
    }
    .eyebrow {
      color: #2563eb;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .subline,
    .muted {
      color: #667085;
      font-size: 12px;
      margin-top: 6px;
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }
    mat-card,
    .panel {
      min-width: 0;
    }
    .summary-grid mat-card {
      padding: 14px;
    }
    .summary-grid span,
    .summary-grid small {
      display: block;
      color: #667085;
      font-size: 12px;
    }
    .summary-grid strong {
      display: block;
      margin-top: 6px;
      font-size: 20px;
      overflow-wrap: anywhere;
    }
    .summary-grid strong.mono {
      font:
        12px ui-monospace,
        monospace;
    }
    .summary-grid mat-progress-bar {
      margin-top: 8px;
    }
    .status {
      width: max-content;
      padding: 4px 8px;
      border-radius: 999px;
      background: #f2f4f7;
    }
    .status[data-status='success'] {
      background: #ecfdf3;
      color: #087443;
    }
    .status[data-status='failed'] {
      background: #fef3f2;
      color: #b42318;
    }
    .status[data-status='running'] {
      background: #eff8ff;
      color: #175cd3;
    }
    .status[data-status='queued'] {
      background: #fff6ed;
      color: #9c2d00;
    }
    .error-banner,
    .error-text {
      padding: 10px 12px;
      border-radius: 8px;
      background: #fef3f2;
      color: #b42318;
      font-size: 12px;
      overflow-wrap: anywhere;
      margin-bottom: 14px;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
      gap: 14px;
      align-items: start;
    }
    .main-column,
    .side-column {
      display: grid;
      gap: 14px;
      min-width: 0;
    }
    .panel {
      padding: 15px;
    }
    .section-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }
    .section-title span {
      color: #667085;
      font-size: 12px;
    }
    .node-list {
      display: grid;
      gap: 7px;
    }
    .node-row {
      display: grid;
      grid-template-columns: 10px minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      width: 100%;
      text-align: left;
      border: 1px solid #eaecf0;
      background: #fff;
      border-radius: 9px;
      padding: 10px;
      cursor: pointer;
    }
    .node-row:hover,
    .node-row.selected {
      border-color: #84adf7;
      background: #f8fbff;
    }
    .node-state {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #98a2b3;
    }
    .node-state[data-status='running'] {
      background: #2563eb;
    }
    .node-state[data-status='success'] {
      background: #16a34a;
    }
    .node-state[data-status='failed'] {
      background: #dc2626;
    }
    .node-state[data-status='cancelled'] {
      background: #d97706;
    }
    .node-copy strong,
    .node-copy small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .node-copy small {
      color: #667085;
      font-size: 11px;
      margin-top: 3px;
    }
    .node-row > span:last-child {
      color: #667085;
      font-size: 12px;
    }
    .artifact-card {
      border-top: 1px solid #f2f4f7;
      padding: 14px 0;
    }
    .artifact-card:first-of-type {
      border-top: 0;
    }
    dl {
      display: grid;
      grid-template-columns: 70px minmax(0, 1fr);
      gap: 6px;
      font-size: 12px;
    }
    dt {
      color: #667085;
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    pre {
      max-height: 180px;
      overflow: auto;
      background: #f8fafc;
      padding: 10px;
      border-radius: 7px;
      font-size: 11px;
    }
    .logs {
      display: grid;
      gap: 8px;
      max-height: 300px;
      overflow: auto;
    }
    .logs div {
      display: grid;
      grid-template-columns: 58px minmax(0, 1fr);
      gap: 8px;
      font-size: 12px;
    }
    .logs time {
      color: #98a2b3;
      font-family: ui-monospace, monospace;
    }
    .empty {
      color: #98a2b3;
      text-align: center;
      padding: 24px 10px;
      font-size: 13px;
    }
    .page-empty {
      background: #fff;
      border: 1px solid #eaecf0;
      border-radius: 12px;
    }
    @media (max-width: 900px) {
      .summary-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .layout {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 560px) {
      .page-header {
        align-items: flex-start;
        flex-direction: column;
      }
      .summary-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class WorkflowRunDetailPage implements OnDestroy {
  readonly operatorNames = inject(OperatorNameService);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly trackerService = inject(TaskTrackerService);
  private readonly notifications = inject(NotificationService);
  readonly runId = this.route.snapshot.paramMap.get('runId') ?? '';
  readonly run = signal<WorkflowRunSummary | null>(null);
  readonly nodes = signal<WorkflowNodeRun[]>([]);
  readonly artifacts = signal<WorkflowArtifact[]>([]);
  readonly finalOutputs = signal<WorkflowArtifact[]>([]);
  readonly graphNodes = signal<GraphNode[]>([]);
  readonly selectedNodeId = signal<string | null>(null);
  readonly tracking = signal<TaskTrackingHandle | null>(null);
  private readonly lastStatus = signal<string | null>(null);
  readonly logs = computed(() => this.tracking()?.logs() ?? []);
  readonly selectedNodeRun = computed(
    () => this.nodes().find((node) => node.node_instance_id === this.selectedNodeId()) ?? null,
  );
  readonly selectedArtifacts = computed(() =>
    this.artifacts().filter((item) => item.node_instance_id === this.selectedNodeId()),
  );

  constructor() {
    effect(() => {
      const task = this.tracking()?.task();
      if (!task || task.status === this.lastStatus()) return;
      this.lastStatus.set(task.status);
      this.refresh();
    });
    this.load();
  }

  load(): void {
    if (!this.runId) return;
    this.api.get<WorkflowRunSummary>(`/api/v1/workflow-runs/${this.runId}`).subscribe({
      next: (run) => {
        this.run.set(run);
        this.setGraphNodes(run);
        this.beginTracking(run.task_id);
        this.refreshDetails();
      },
      error: (error: unknown) => this.notifications.error(error, '读取工作流运行失败。'),
    });
  }
  refresh(): void {
    this.refreshDetails();
  }
  private refreshDetails(): void {
    if (!this.runId) return;
    forkJoin({
      run: this.api.get<WorkflowRunSummary>(`/api/v1/workflow-runs/${this.runId}`),
      nodes: this.api.get<WorkflowNodeRun[]>(`/api/v1/workflow-runs/${this.runId}/nodes`),
      artifacts: this.api.get<WorkflowArtifact[]>(`/api/v1/workflow-runs/${this.runId}/artifacts`),
      result: this.api.get<WorkflowResult>(`/api/v1/workflow-runs/${this.runId}/result`),
    }).subscribe({
      next: ({ run, nodes, artifacts, result }) => {
        this.run.set(run);
        this.nodes.set(nodes);
        this.artifacts.set(artifacts);
        this.finalOutputs.set(result.outputs);
        this.setGraphNodes(run);
      },
      error: () => undefined,
    });
  }
  private beginTracking(taskId: string): void {
    if (!this.tracking() || this.tracking()?.task()?.task_id !== taskId)
      this.tracking.set(this.trackerService.track(taskId));
  }
  private setGraphNodes(run: WorkflowRunSummary): void {
    const graph = run.graph_snapshot as { nodes?: unknown[] };
    const nodes = Array.isArray(graph.nodes)
      ? graph.nodes
          .filter((node): node is Record<string, unknown> => !!node && typeof node === 'object')
          .map((node) => ({
            id: String(node['id']),
            node_code: String(node['node_code']),
            node_version:
              typeof node['node_version'] === 'string' ? node['node_version'] : undefined,
          }))
      : [];
    this.graphNodes.set(nodes);
    if (!this.selectedNodeId() && nodes.length) this.selectedNodeId.set(nodes[0].id);
  }
  nodeState(id: string): WorkflowNodeRun | null {
    return this.nodes().find((node) => node.node_instance_id === id) ?? null;
  }
  nodeLabel(node: GraphNode): string {
    return this.operatorNames.displayName(node.node_code, node.node_code);
  }
  selectNode(id: string): void {
    this.selectedNodeId.set(id);
  }
  statusLabel(status: string): string {
    return (
      (
        {
          waiting: '等待',
          queued: '排队中',
          running: '运行中',
          success: '成功',
          failed: '失败',
          cancelled: '已取消',
        } as Record<string, string>
      )[status] || status
    );
  }
  connectionLabel(): string {
    return this.tracking()?.connection() === 'polling'
      ? '轮询回退'
      : this.tracking()?.connection() === 'connected'
        ? '实时更新'
        : '读取中';
  }
  canCancel(): boolean {
    const status = this.run()?.status;
    return this.auth.hasPermission('workflow:run') && (status === 'queued' || status === 'running');
  }
  cancel(): void {
    this.api
      .post<WorkflowRunSummary, object>(`/api/v1/workflow-runs/${this.runId}/cancel`, {})
      .subscribe({
        next: (run) => {
          this.run.set(run);
          this.refreshDetails();
        },
        error: (error: unknown) => this.notifications.error(error, '取消工作流失败。'),
      });
  }
  ngOnDestroy(): void {
    const taskId = this.run()?.task_id;
    if (taskId) this.trackerService.stop(taskId);
  }
}
