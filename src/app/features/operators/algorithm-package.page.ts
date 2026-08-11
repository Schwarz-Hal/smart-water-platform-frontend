import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  AlgorithmOperatorDraft,
  ExternalAlgorithmPackage,
  RuntimeProfile,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { ApiClient } from '../../core/services/api-client.service';
import { NotificationService } from '../../core/services/notification.service';

export function algorithmOnboardingStageDone(item: ExternalAlgorithmPackage, key: string): boolean {
  if (key === 'validated') return !['uploaded', 'validating'].includes(item.status);
  if (key === 'provisioning') return item.environment?.status === 'ready';
  if (key === 'contract')
    return (
      item.operator_drafts.length > 0 &&
      item.operator_drafts.every((draft) => ['valid', 'published'].includes(draft.status))
    );
  if (key === 'smoke') return item.smoke_tests.some((test) => test.status === 'success');
  return item.status === 'active';
}

@Component({
  selector: 'app-algorithm-package-page',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <header class="page-header">
      <div>
        <p class="eyebrow">算子中心 / 外部算法包</p>
        <h1>导入并审核外部算法</h1>
        <p class="lead">依赖在发布前制备，运行时只调用已审核的不可变环境。</p>
      </div>
      <a class="secondary" routerLink="/operators">返回算子目录</a>
    </header>

    @if (message()) {
      <div class="message" [class.error]="isError()">{{ message() }}</div>
    }

    <section class="upload-card">
      <div class="section-title">
        <div>
          <span class="step">1</span>
          <h2>上传算法包</h2>
        </div>
        <small>ZIP v2</small>
      </div>
      <div class="form-grid">
        <label
          >算法编码<input [(ngModel)]="upload.code" placeholder="rolling_zscore_anomaly"
        /></label>
        <label
          >算法名称<input [(ngModel)]="upload.name" placeholder="滚动 Z-score 异常检测"
        /></label>
        <label>版本<input [(ngModel)]="upload.version" placeholder="1.0.0" /></label>
        <label
          >运行时配置<select [(ngModel)]="upload.profile">
            <option value="">请选择</option>
            @for (profile of profiles(); track profile.profile_code) {
              <option [value]="profile.profile_code" [disabled]="!profile.available">
                {{ profile.display_name }} · Python {{ profile.python_version
                }}{{ profile.available ? '' : '（不可用）' }}
              </option>
            }
          </select></label
        >
      </div>
      <label>说明<textarea [(ngModel)]="upload.description" rows="2"></textarea></label>
      <div class="file-row">
        <input
          #packageInput
          type="file"
          accept=".zip,application/zip"
          (change)="selectPackage($event)"
        /><span>{{ packageFile()?.name || '尚未选择 ZIP' }}</span
        ><button
          class="primary"
          type="button"
          [disabled]="uploading() || !canUpload()"
          (click)="uploadPackage()"
        >
          {{ uploading() ? '上传中…' : '上传并静态检查' }}
        </button>
      </div>
    </section>

    <div class="workspace">
      <aside class="package-list">
        <div class="section-title">
          <div><h2>算法版本</h2></div>
          <button class="text-button" type="button" (click)="loadPackages()">刷新</button>
        </div>
        @for (item of packages(); track item.id) {
          <button
            class="package-row"
            type="button"
            [class.selected]="selected()?.id === item.id"
            (click)="select(item)"
          >
            <strong>{{ item.algorithm_name }}</strong
            ><small>{{ item.algorithm_code }} · {{ item.version }}</small
            ><span class="status">{{ statusLabel(item.status) }}</span>
          </button>
        } @empty {
          <p class="empty">还没有外部算法包。</p>
        }
      </aside>

      <main class="package-detail">
        @if (selected(); as item) {
          <div class="detail-head">
            <div>
              <p class="eyebrow">{{ item.algorithm_code }}</p>
              <h2>{{ item.algorithm_name }} {{ item.version }}</h2>
            </div>
            <span class="status large">{{ statusLabel(item.status) }}</span>
          </div>
          <ol class="progress">
            @for (stage of stages; track stage.key) {
              <li
                [class.done]="stageDone(item, stage.key)"
                [class.current]="stageCurrent(item, stage.key)"
              >
                <span></span>{{ stage.label }}
              </li>
            }
          </ol>

          <section class="sub-card">
            <div class="section-title">
              <div>
                <span class="step">2</span>
                <h3>静态检查与运行环境</h3>
              </div>
              <code>{{ item.package_sha256 || '检查中' }}</code>
            </div>
            <dl>
              <div>
                <dt>静态状态</dt>
                <dd>{{ statusLabel(item.status) }}</dd>
              </div>
              <div>
                <dt>运行环境</dt>
                <dd>{{ item.environment?.status || 'pending' }}</dd>
              </div>
              <div>
                <dt>执行后端</dt>
                <dd>可信子进程 / CPU</dd>
              </div>
            </dl>
            @if (item.environment?.error_message) {
              <div class="inline-error">
                {{ item.environment?.error_code }} · {{ item.environment?.error_message }}
              </div>
            }
            <button
              class="primary"
              type="button"
              [disabled]="!canProvision(item)"
              (click)="provision(item)"
            >
              制备独立环境
            </button>
            @if (item.environment?.provision_task_id) {
              <a class="task-link" [routerLink]="['/tasks', item.environment?.provision_task_id]"
                >查看制备任务日志</a
              >
            }
          </section>

          <section class="sub-card">
            <div class="section-title">
              <div>
                <span class="step">3</span>
                <h3>算子契约</h3>
              </div>
              <small>{{ item.operator_drafts.length }} 个算子</small>
            </div>
            <div class="draft-tabs">
              @for (draft of item.operator_drafts; track draft.id) {
                <button
                  type="button"
                  [class.active]="draftId() === draft.id"
                  (click)="openDraft(draft)"
                >
                  {{ draft.operator_code }} · {{ draft.status }}
                </button>
              }
            </div>
            @if (activeDraft(); as draft) {
              <div class="form-grid">
                <label>显示名称<input [(ngModel)]="draftForm.name" /></label
                ><label
                  >分类<select [(ngModel)]="draftForm.category">
                    <option value="algorithm">算法</option>
                    <option value="transform">数据转换</option>
                    <option value="control">控制</option>
                    <option value="output">输出</option>
                  </select></label
                >
              </div>
              <label
                >入口函数<input [(ngModel)]="draftForm.entrypoint" placeholder="module:function"
              /></label>
              <label>说明<textarea [(ngModel)]="draftForm.description" rows="2"></textarea></label>
              <details>
                <summary>高级契约 JSON（端口、参数与可视化）</summary>
                <textarea
                  class="code-editor"
                  [(ngModel)]="draftForm.json"
                  rows="16"
                  spellcheck="false"
                ></textarea>
              </details>
              @if (draft.validation_errors.length) {
                <div class="inline-error">
                  @for (error of draft.validation_errors; track $index) {
                    <div>{{ error['message'] }}</div>
                  }
                </div>
              }
              <div class="actions">
                <button class="secondary" type="button" (click)="saveDraft(draft)">保存契约</button
                ><button class="primary" type="button" (click)="validateDraft(draft)">
                  校验契约
                </button>
              </div>
            } @else {
              <p class="empty">静态检查完成后会显示 manifest 声明的算子。</p>
            }
          </section>

          <section class="sub-card">
            <div class="section-title">
              <div>
                <span class="step">4</span>
                <h3>模型槽位</h3>
              </div>
              <small>文件按 SHA256 去重</small>
            </div>
            <div class="model-list">
              @for (model of item.models; track model.id) {
                <div>
                  <strong>{{ model.model_key }}</strong
                  ><span>{{ model.original_filename }}</span
                  ><code>{{ model.sha256.slice(0, 12) }}…</code>
                </div>
              } @empty {
                <p class="empty">该版本尚未绑定模型；无权重算法可直接进入试运行。</p>
              }
            </div>
            <div class="file-row">
              <input [(ngModel)]="modelKey" placeholder="槽位，例如 weights" /><input
                type="file"
                (change)="selectModel($event)"
              /><button
                class="secondary"
                type="button"
                [disabled]="!modelFile() || !modelKey"
                (click)="uploadModel(item)"
              >
                绑定模型
              </button>
            </div>
          </section>

          <section class="sub-card">
            <div class="section-title">
              <div>
                <span class="step">5</span>
                <h3>样例试运行</h3>
              </div>
              <small>标准 JSON 输入</small>
            </div>
            <div class="json-grid">
              <label
                >输入端口 JSON<textarea
                  [(ngModel)]="smokeInputs"
                  rows="9"
                  spellcheck="false"
                ></textarea></label
              ><label
                >参数 JSON<textarea
                  [(ngModel)]="smokeParameters"
                  rows="9"
                  spellcheck="false"
                ></textarea>
              </label>
            </div>
            <div class="actions">
              <button
                class="primary"
                type="button"
                [disabled]="item.environment?.status !== 'ready' || !activeDraft()"
                (click)="smoke(item)"
              >
                运行当前算子
              </button>
              @if (latestSmoke(item); as smoke) {
                <a class="task-link" [routerLink]="['/tasks', smoke.task_id]"
                  >{{ smoke.status }} · 查看任务</a
                >
                @if (smoke.output_preview; as output) {
                  <pre>{{ output | json }}</pre>
                }
              }
            </div>
          </section>

          <section class="sub-card review-card">
            <div>
              <span class="step">6</span>
              <h3>提交审核与激活</h3>
              <p>管理员批准后，算子无需重启服务即可进入 DAG 目录。</p>
            </div>
            <div class="actions">
              <button
                class="secondary"
                type="button"
                [disabled]="item.status === 'review_pending' || item.status === 'active'"
                (click)="submit(item)"
              >
                提交管理员审核
              </button>
              @if (canApprove()) {
                <button
                  class="primary"
                  type="button"
                  [disabled]="item.status !== 'review_pending'"
                  (click)="approve(item)"
                >
                  批准并激活</button
                ><button
                  class="danger"
                  type="button"
                  [disabled]="item.status !== 'review_pending'"
                  (click)="reject(item)"
                >
                  退回修改
                </button>
              }
            </div>
          </section>
        } @else {
          <div class="empty detail-empty">上传或选择一个算法版本开始配置。</div>
        }
      </main>
    </div>
  `,
  styles: `
    :host {
      display: block;
      color: #172033;
    }
    h1,
    h2,
    h3,
    p {
      margin: 0;
    }
    .page-header,
    .section-title,
    .detail-head,
    .file-row,
    .actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .page-header,
    .detail-head,
    .section-title {
      justify-content: space-between;
    }
    .page-header {
      align-items: flex-end;
      margin-bottom: 20px;
    }
    .eyebrow {
      color: #2563eb;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
    }
    .lead,
    .empty,
    small {
      color: #667085;
    }
    .upload-card,
    .package-list,
    .package-detail,
    .sub-card {
      background: #fff;
      border: 1px solid #e4e7ec;
      border-radius: 14px;
    }
    .upload-card {
      padding: 20px;
      margin-bottom: 18px;
    }
    .workspace {
      display: grid;
      grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
      gap: 18px;
      align-items: start;
    }
    .package-list {
      padding: 12px;
      position: sticky;
      top: 16px;
    }
    .package-detail {
      padding: 22px;
      min-width: 0;
    }
    .package-row {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr auto;
      text-align: left;
      gap: 4px 10px;
      padding: 13px;
      border: 0;
      border-bottom: 1px solid #eef1f5;
      background: #fff;
      cursor: pointer;
    }
    .package-row strong,
    .package-row small {
      grid-column: 1;
    }
    .package-row .status {
      grid-column: 2;
      grid-row: 1/3;
      align-self: center;
    }
    .package-row.selected,
    .package-row:hover {
      background: #eef5ff;
    }
    .status {
      border-radius: 999px;
      padding: 4px 9px;
      background: #f1f3f5;
      color: #475467;
      font-size: 11px;
    }
    .status.large {
      font-size: 12px;
    }
    .form-grid,
    .json-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      color: #475467;
      font-size: 13px;
      margin-top: 12px;
    }
    input,
    select,
    textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #d0d5dd;
      border-radius: 8px;
      padding: 9px 11px;
      background: #fff;
      color: #172033;
      font: inherit;
    }
    .file-row {
      margin-top: 14px;
      flex-wrap: wrap;
    }
    .file-row input[type='file'] {
      width: auto;
      max-width: 320px;
    }
    .file-row > span {
      min-width: 0;
      flex: 1;
      overflow-wrap: anywhere;
    }
    .primary,
    .secondary,
    .danger,
    .text-button {
      border-radius: 9px;
      padding: 9px 14px;
      border: 0;
      cursor: pointer;
      font: inherit;
      text-decoration: none;
    }
    .primary {
      background: #0f67c9;
      color: #fff;
    }
    .secondary {
      background: #fff;
      color: #0f67c9;
      border: 1px solid #b6c5d9;
    }
    .danger {
      background: #fff0f0;
      color: #b42318;
      border: 1px solid #f5b7b1;
    }
    .text-button {
      background: transparent;
      color: #0f67c9;
      padding: 4px;
    }
    button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .message,
    .inline-error {
      padding: 11px 14px;
      border-radius: 9px;
      background: #fff7df;
      color: #8a5b00;
      margin-bottom: 14px;
    }
    .message.error,
    .inline-error {
      background: #fff0f0;
      color: #b42318;
    }
    .sub-card {
      margin-top: 16px;
      padding: 18px;
    }
    .step {
      display: inline-grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #eaf2ff;
      color: #0f67c9;
      font-weight: 800;
      margin-right: 8px;
    }
    .section-title > div,
    .review-card > div:first-child {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .progress {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      list-style: none;
      padding: 0;
      margin: 22px 0;
    }
    .progress li {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #98a2b3;
      font-size: 12px;
    }
    .progress li:after {
      content: '';
      height: 2px;
      background: #e4e7ec;
      flex: 1;
    }
    .progress li:last-child:after {
      display: none;
    }
    .progress span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #d0d5dd;
    }
    .progress li.done {
      color: #087443;
    }
    .progress li.done span {
      background: #1aa260;
    }
    .progress li.current {
      color: #0f67c9;
      font-weight: 700;
    }
    .progress li.current span {
      background: #0f67c9;
      box-shadow: 0 0 0 4px #dbeafe;
    }
    dl {
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
    }
    dl div {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    dt {
      font-size: 11px;
      color: #667085;
    }
    dd {
      margin: 0;
    }
    .task-link {
      color: #0f67c9;
      text-decoration: none;
      margin-left: 10px;
    }
    .draft-tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 14px 0;
    }
    .draft-tabs button {
      border: 1px solid #d0d5dd;
      background: #fff;
      border-radius: 999px;
      padding: 7px 11px;
    }
    .draft-tabs button.active {
      border-color: #0f67c9;
      background: #eef5ff;
      color: #0f67c9;
    }
    .code-editor,
    pre {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: 12px;
    }
    details {
      margin-top: 12px;
    }
    pre {
      white-space: pre-wrap;
      max-height: 320px;
      overflow: auto;
      background: #f6f8fb;
      padding: 12px;
      border-radius: 8px;
    }
    .model-list > div {
      display: grid;
      grid-template-columns: 130px 1fr auto;
      gap: 10px;
      padding: 9px 0;
      border-bottom: 1px solid #eef1f5;
    }
    .review-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .review-card > div:first-child {
      flex-wrap: wrap;
    }
    .detail-empty {
      padding: 80px;
      text-align: center;
    }
    @media (max-width: 900px) {
      .workspace {
        grid-template-columns: 1fr;
      }
      .package-list {
        position: static;
      }
      .form-grid,
      .json-grid {
        grid-template-columns: 1fr;
      }
      .progress {
        overflow-x: auto;
      }
      .review-card {
        align-items: flex-start;
        flex-direction: column;
      }
    }
    @media (max-width: 600px) {
      .page-header {
        align-items: flex-start;
        flex-direction: column;
      }
      .package-detail {
        padding: 14px;
      }
      .model-list > div {
        grid-template-columns: 1fr;
      }
      .actions {
        flex-wrap: wrap;
      }
    }
  `,
})
export class AlgorithmPackagePage implements OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly notice = inject(NotificationService);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  readonly profiles = signal<RuntimeProfile[]>([]);
  readonly packages = signal<ExternalAlgorithmPackage[]>([]);
  readonly selected = signal<ExternalAlgorithmPackage | null>(null);
  readonly draftId = signal<number | null>(null);
  readonly packageFile = signal<File | null>(null);
  readonly modelFile = signal<File | null>(null);
  readonly uploading = signal(false);
  readonly message = signal('');
  readonly isError = signal(false);
  readonly activeDraft = computed(
    () => this.selected()?.operator_drafts.find((item) => item.id === this.draftId()) ?? null,
  );
  readonly canApprove = computed(() => this.auth.hasPermission('algorithm:approve'));
  readonly stages = [
    { key: 'validated', label: '静态检查' },
    { key: 'provisioning', label: '环境制备' },
    { key: 'contract', label: '契约确认' },
    { key: 'smoke', label: '样例试运行' },
    { key: 'active', label: '审核激活' },
  ];
  upload = { code: '', name: '', version: '1.0.0', profile: '', description: '' };
  draftForm = { name: '', category: 'algorithm', entrypoint: '', description: '', json: '{}' };
  modelKey = 'weights';
  smokeInputs = '{\n  "series": {"kind": "timeseries", "rows": []}\n}';
  smokeParameters = '{}';

  constructor() {
    this.loadProfiles();
    this.loadPackages();
    this.pollTimer = setInterval(() => {
      if (this.selected() && this.shouldPoll(this.selected()!)) this.refreshSelected();
    }, 2500);
  }
  ngOnDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }
  loadProfiles(): void {
    this.api.get<RuntimeProfile[]>('/api/v1/runtime-profiles').subscribe({
      next: (items) => {
        this.profiles.set(items);
        if (!this.upload.profile)
          this.upload.profile = items.find((item) => item.available)?.profile_code || '';
      },
      error: () => this.fail('运行时配置加载失败。'),
    });
  }
  loadPackages(): void {
    this.api.get<ExternalAlgorithmPackage[]>('/api/v1/algorithm-packages').subscribe({
      next: (items) => {
        this.packages.set(items);
        const current = this.selected();
        if (current) {
          const next = items.find((item) => item.id === current.id);
          if (next) this.select(next);
        }
      },
      error: () => this.fail('算法包列表加载失败。'),
    });
  }
  select(item: ExternalAlgorithmPackage): void {
    this.selected.set(item);
    const draft =
      item.operator_drafts.find((value) => value.id === this.draftId()) || item.operator_drafts[0];
    if (draft) this.openDraft(draft);
  }
  refreshSelected(): void {
    const id = this.selected()?.id;
    if (!id) return;
    this.api.get<ExternalAlgorithmPackage>(`/api/v1/algorithm-packages/versions/${id}`).subscribe({
      next: (item) => {
        this.selected.set(item);
        this.packages.update((rows) => rows.map((row) => (row.id === item.id ? item : row)));
        const draft =
          item.operator_drafts.find((value) => value.id === this.draftId()) ||
          item.operator_drafts[0];
        if (draft && this.draftId() !== draft.id) this.openDraft(draft);
      },
    });
  }
  selectPackage(event: Event): void {
    this.packageFile.set((event.target as HTMLInputElement).files?.[0] || null);
  }
  selectModel(event: Event): void {
    this.modelFile.set((event.target as HTMLInputElement).files?.[0] || null);
  }
  canUpload(): boolean {
    return !!(
      this.upload.code &&
      this.upload.name &&
      this.upload.version &&
      this.upload.profile &&
      this.packageFile()
    );
  }
  uploadPackage(): void {
    const file = this.packageFile();
    if (!file) return;
    const form = new FormData();
    form.set('algorithm_code', this.upload.code);
    form.set('algorithm_name', this.upload.name);
    form.set('version', this.upload.version);
    form.set('runtime_profile_code', this.upload.profile);
    form.set('description', this.upload.description);
    form.set('package_file', file);
    this.uploading.set(true);
    this.api
      .post<{ algorithm_version_id: number; task_id: string }, FormData>(
        '/api/v1/algorithm-packages',
        form,
      )
      .subscribe({
        next: (result) => {
          this.uploading.set(false);
          this.ok('算法包已上传，正在执行静态检查。');
          this.loadPackages();
        },
        error: () => {
          this.uploading.set(false);
          this.fail('上传失败，请检查包结构和版本是否重复。');
        },
      });
  }
  openDraft(draft: AlgorithmOperatorDraft): void {
    this.draftId.set(draft.id);
    const value = { ...draft.contract };
    this.draftForm = {
      name: String(value['name'] || draft.operator_code),
      category: String(value['category'] || 'algorithm'),
      entrypoint: String(value['entrypoint'] || draft.entrypoint),
      description: String(value['description'] || ''),
      json: JSON.stringify(value, null, 2),
    };
  }
  contract(): Record<string, unknown> {
    const value = JSON.parse(this.draftForm.json) as Record<string, unknown>;
    return {
      ...value,
      name: this.draftForm.name,
      category: this.draftForm.category,
      entrypoint: this.draftForm.entrypoint,
      description: this.draftForm.description,
    };
  }
  saveDraft(draft: AlgorithmOperatorDraft): void {
    let contract: Record<string, unknown>;
    try {
      contract = this.contract();
    } catch {
      this.fail('契约 JSON 格式不正确。');
      return;
    }
    this.api
      .put<
        ExternalAlgorithmPackage,
        { expected_revision: number; contract: Record<string, unknown> }
      >(`/api/v1/algorithm-operator-drafts/${draft.id}`, {
        expected_revision: draft.revision,
        contract,
      })
      .subscribe({
        next: (item) => {
          this.selected.set(item);
          const next = item.operator_drafts.find((value) => value.id === draft.id);
          if (next) this.openDraft(next);
          this.ok('算子契约已保存。');
        },
        error: () => this.fail('契约保存失败，可能已被其他页面修改。'),
      });
  }
  validateDraft(draft: AlgorithmOperatorDraft): void {
    this.api
      .post<{ valid: boolean; errors: Array<Record<string, string>> }, Record<string, never>>(
        `/api/v1/algorithm-operator-drafts/${draft.id}/validate`,
        {},
      )
      .subscribe({
        next: (result) => {
          result.valid
            ? this.ok('契约校验通过。')
            : this.fail(result.errors.map((item) => item['message']).join('；'));
          this.refreshSelected();
        },
        error: () => this.fail('契约校验请求失败。'),
      });
  }
  provision(item: ExternalAlgorithmPackage): void {
    this.api
      .post<Record<string, unknown>, Record<string, never>>(
        `/api/v1/algorithm-packages/versions/${item.id}/provision`,
        {},
      )
      .subscribe({
        next: () => {
          this.ok('环境制备任务已提交。');
          this.refreshSelected();
        },
        error: () => this.fail('环境制备未能启动，请确认静态检查已完成。'),
      });
  }
  canProvision(item: ExternalAlgorithmPackage): boolean {
    return (
      ['validated', 'review_pending'].includes(item.status) &&
      item.environment?.status !== 'ready' &&
      item.environment?.status !== 'provisioning'
    );
  }
  uploadModel(item: ExternalAlgorithmPackage): void {
    const file = this.modelFile();
    if (!file) return;
    const form = new FormData();
    form.set('model_key', this.modelKey);
    form.set('model_file', file);
    this.api
      .post<Record<string, unknown>, FormData>(
        `/api/v1/algorithm-packages/versions/${item.id}/models`,
        form,
      )
      .subscribe({
        next: () => {
          this.ok('模型槽位已绑定。');
          this.modelFile.set(null);
          this.refreshSelected();
        },
        error: () => this.fail('模型上传失败，请检查槽位是否已存在或文件类型是否被禁止。'),
      });
  }
  smoke(item: ExternalAlgorithmPackage): void {
    const draft = this.activeDraft();
    if (!draft) return;
    let inputs: Record<string, unknown>, parameters: Record<string, unknown>;
    try {
      inputs = JSON.parse(this.smokeInputs);
      parameters = JSON.parse(this.smokeParameters);
    } catch {
      this.fail('试运行输入或参数不是合法 JSON。');
      return;
    }
    this.api
      .post<
        { task_id: string; smoke_test_id: string },
        { inputs: Record<string, unknown>; parameters: Record<string, unknown> }
      >(`/api/v1/algorithm-operator-drafts/${draft.id}/smoke-tests`, { inputs, parameters })
      .subscribe({
        next: () => {
          this.ok('试运行已提交。');
          this.refreshSelected();
        },
        error: () => this.fail('试运行提交失败，请先完成环境与契约校验。'),
      });
  }
  submit(item: ExternalAlgorithmPackage): void {
    this.api
      .post<ExternalAlgorithmPackage, Record<string, never>>(
        `/api/v1/algorithm-packages/versions/${item.id}/submit`,
        {},
      )
      .subscribe({
        next: (value) => {
          this.selected.set(value);
          this.ok('已提交管理员审核。');
        },
        error: () => this.fail('尚未满足审核条件：请确认环境、契约、模型槽位和试运行。'),
      });
  }
  approve(item: ExternalAlgorithmPackage): void {
    this.api
      .post<ExternalAlgorithmPackage, { reason: string }>(
        `/api/v1/algorithm-packages/versions/${item.id}/approve`,
        { reason: '算子中心审核通过' },
      )
      .subscribe({
        next: (value) => {
          this.selected.set(value);
          this.ok('已激活，刷新 DAG 编辑器即可使用。');
        },
        error: () => this.fail('批准失败，请核对审核条件。'),
      });
  }
  reject(item: ExternalAlgorithmPackage): void {
    this.api
      .post<ExternalAlgorithmPackage, { reason: string }>(
        `/api/v1/algorithm-packages/versions/${item.id}/reject`,
        { reason: '需要算法运营人员修正' },
      )
      .subscribe({
        next: (value) => {
          this.selected.set(value);
          this.ok('已退回修改。');
        },
        error: () => this.fail('退回操作失败。'),
      });
  }
  latestSmoke(item: ExternalAlgorithmPackage) {
    return item.smoke_tests[0] || null;
  }
  shouldPoll(item: ExternalAlgorithmPackage): boolean {
    return (
      ['validating', 'provisioning'].includes(item.status) ||
      ['pending', 'provisioning', 'smoke_testing'].includes(item.environment?.status || '')
    );
  }
  statusLabel(value: string): string {
    return (
      (
        {
          uploaded: '已上传',
          validating: '静态检查中',
          validated: '检查通过',
          provisioning: '环境制备中',
          review_pending: '待审核',
          active: '已激活',
          retired: '已退役',
          failed: '失败',
        } as Record<string, string>
      )[value] || value
    );
  }
  stageDone(item: ExternalAlgorithmPackage, key: string): boolean {
    return algorithmOnboardingStageDone(item, key);
  }
  stageCurrent(item: ExternalAlgorithmPackage, key: string): boolean {
    return (
      !this.stageDone(item, key) &&
      ((key === 'validated' && ['uploaded', 'validating'].includes(item.status)) ||
        (key === 'provisioning' && item.status === 'provisioning') ||
        (key === 'contract' && item.environment?.status === 'ready') ||
        (key === 'smoke' && item.operator_drafts.some((draft) => draft.status === 'valid')) ||
        (key === 'active' && item.status === 'review_pending'))
    );
  }
  private ok(value: string): void {
    this.message.set(value);
    this.isError.set(false);
    this.notice.success(value);
  }
  private fail(value: string): void {
    this.message.set(value);
    this.isError.set(true);
  }
}
