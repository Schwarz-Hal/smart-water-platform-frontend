import { CommonModule } from '@angular/common';
import { Component, Inject, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

import { ApiClient } from '../../core/services/api-client.service';

export interface CompositeRegistrationDialogData {
  workflowVersionId: number;
  workflowVersionNumber: number | null;
  workflowName: string;
  draftDirty: boolean;
}

export interface WorkflowCompositeRegistrationResult {
  registered: boolean;
  nodeCode: string;
  nodeName: string;
  nodeVersion: string;
}

export interface CompositePortCandidate {
  id: string;
  key: string;
  label: string;
  dataType: string;
  semanticType: string | null;
  unit: string | null;
  required: boolean;
  selected: boolean;
  source: { node_id: string; port: string };
}

export interface CompositeParameterCandidate {
  id: string;
  key: string;
  label: string;
  nodeId: string;
  nodeName: string;
  parameter: string;
  schema: Record<string, unknown>;
  defaultValue: unknown;
  hasDefault: boolean;
  required: boolean;
  selected: boolean;
}

export interface CompositeCandidateResult {
  inputs: CompositePortCandidate[];
  outputs: CompositePortCandidate[];
  parameters: CompositeParameterCandidate[];
  errors: string[];
}

type Mapping = Record<string, unknown>;

function asMapping(value: unknown): Mapping {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Mapping) : {};
}

function asArray(value: unknown): Mapping[] {
  return Array.isArray(value)
    ? value.map(asMapping).filter((item) => Object.keys(item).length > 0)
    : [];
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function portMap(definition: Mapping | undefined, direction: 'input_ports' | 'output_ports') {
  const result = new Map<string, Mapping>();
  for (const port of asArray(definition?.[direction])) {
    const key = text(port['key']);
    if (key) result.set(key, port);
  }
  return result;
}

function definitionMap(value: unknown): Map<string, Mapping> {
  const result = new Map<string, Mapping>();
  const values: Mapping[] = Array.isArray(value)
    ? asArray(value)
    : Object.entries(asMapping(value)).map(([key, item]) => ({ id: key, ...asMapping(item) }));
  for (const definition of values) {
    const code = text(definition['node_code'] ?? definition['code']);
    const version = text(definition['node_version'] ?? definition['version']);
    const id = text(definition['id']);
    if (code && version) result.set(`${code}@${version}`, definition);
    if (id) result.set(`id:${id}`, definition);
  }
  return result;
}

/**
 * Build registration candidates from an immutable published workflow graph.
 * This is deliberately pure: it never reads the draft graph and never mutates the API response.
 */
export function deriveCompositeCandidates(
  graphValue: unknown,
  definitionsValue: unknown,
): CompositeCandidateResult {
  const graph = asMapping(graphValue);
  const rawNodes = asArray(graph['nodes']);
  const rawEdges = asArray(graph['edges']);
  const rawOutputs = asArray(graph['outputs']);
  const definitions = definitionMap(definitionsValue);
  const nodes = new Map<string, Mapping>();
  const nodeDefinitions = new Map<string, Mapping>();
  const errors: string[] = [];

  for (const node of rawNodes) {
    const id = text(node['id']);
    if (!id || nodes.has(id)) {
      errors.push('发布版本包含无效或重复的节点标识。');
      continue;
    }
    nodes.set(id, node);
    const code = text(node['node_code']);
    const version = text(node['node_version']);
    const definition = definitions.get(`${code}@${version}`) || definitions.get(`id:${id}`);
    if (!definition) {
      errors.push(`无法读取节点“${id}”的端口契约。`);
    } else {
      nodeDefinitions.set(id, definition);
    }
  }

  const incoming = new Set<string>();
  const outgoing = new Map<string, Array<{ nodeId: string; port: string }>>();
  for (const edge of rawEdges) {
    const source = asMapping(edge['source']);
    const target = asMapping(edge['target']);
    const sourceId = text(source['node_id']);
    const sourcePort = text(source['port']);
    const targetId = text(target['node_id']);
    if (!sourceId || !sourcePort || !targetId || !nodes.has(sourceId) || !nodes.has(targetId)) {
      errors.push('发布版本包含无法解析的连线。');
      continue;
    }
    incoming.add(targetId);
    const values = outgoing.get(sourceId) || [];
    values.push({ nodeId: targetId, port: sourcePort });
    outgoing.set(sourceId, values);
  }

  const inputs: CompositePortCandidate[] = [];
  for (const [nodeId, node] of nodes) {
    if (incoming.has(nodeId)) continue;
    const definition = nodeDefinitions.get(nodeId);
    const ports = portMap(definition, 'output_ports');
    const usedPorts = new Set((outgoing.get(nodeId) || []).map((edge) => edge.port));
    for (const portKey of usedPorts) {
      const port = ports.get(portKey);
      if (!port) {
        errors.push(`节点“${nodeId}”的输出端口“${portKey}”不存在。`);
        continue;
      }
      const label = text(port['label'], portKey);
      inputs.push({
        id: `input:${nodeId}:${portKey}`,
        key: portKey,
        label,
        dataType: text(port['data_type'], 'json'),
        semanticType: text(port['semantic_type']) || null,
        unit: text(port['unit']) || null,
        required: true,
        selected: true,
        source: { node_id: nodeId, port: portKey },
      });
    }
  }

  const outputs: CompositePortCandidate[] = [];
  const seenOutputs = new Set<string>();
  for (const output of rawOutputs) {
    const nodeId = text(output['node_id']);
    const portKey = text(output['port']);
    const outputId = `${nodeId}:${portKey}`;
    if (!nodeId || !portKey || seenOutputs.has(outputId)) continue;
    seenOutputs.add(outputId);
    const definition = nodeDefinitions.get(nodeId);
    const port = portMap(definition, 'output_ports').get(portKey);
    if (!port) {
      errors.push(`最终输出“${nodeId}.${portKey}”缺少端口契约。`);
      continue;
    }
    outputs.push({
      id: `output:${outputId}`,
      key: portKey,
      label: text(port['label'], portKey),
      dataType: text(port['data_type'], 'json'),
      semanticType: text(port['semantic_type']) || null,
      unit: text(port['unit']) || null,
      required: true,
      selected: true,
      source: { node_id: nodeId, port: portKey },
    });
  }

  const parameters: CompositeParameterCandidate[] = [];
  for (const [nodeId, node] of nodes) {
    const definition = nodeDefinitions.get(nodeId);
    const schema = asMapping(definition?.['parameter_schema']);
    const properties = asMapping(schema['properties']);
    const required = new Set(
      Array.isArray(schema['required']) ? schema['required'].map((item) => text(item)) : [],
    );
    const nodeParameters = asMapping(node['parameters']);
    const nodeName = text(definition?.['node_name'], text(node['node_code'], nodeId));
    for (const [parameter, rawSchema] of Object.entries(properties)) {
      const propertySchema = asMapping(rawSchema);
      const hasSchemaDefault = Object.prototype.hasOwnProperty.call(propertySchema, 'default');
      const hasNodeDefault = Object.prototype.hasOwnProperty.call(nodeParameters, parameter);
      parameters.push({
        id: `parameter:${nodeId}:${parameter}`,
        key: parameter,
        label: text(propertySchema['title'], parameter),
        nodeId,
        nodeName,
        parameter,
        schema: { ...propertySchema },
        defaultValue: hasSchemaDefault
          ? propertySchema['default']
          : hasNodeDefault
            ? nodeParameters[parameter]
            : undefined,
        hasDefault: hasSchemaDefault || hasNodeDefault,
        required: required.has(parameter),
        selected: false,
      });
    }
  }

  if (rawOutputs.length === 0) errors.push('发布版本没有声明最终输出，至少需要暴露一个输出。');
  if (rawNodes.length === 0) errors.push('发布版本没有可用节点。');
  if (inputs.length === 0 && outputs.length === 0) errors.push('没有发现可注册的输入或输出端口。');

  return { inputs, outputs, parameters, errors: [...new Set(errors)] };
}

@Component({
  selector: 'app-workflow-composite-registration-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>注册为复合算子</h2>
    <mat-dialog-content class="dialog-content">
      <p class="intro">
        将发布版本 V{{ data.workflowVersionNumber ?? data.workflowVersionId }}
        注册为可复用的复合算子。 注册只读取不可变发布快照，不会修改当前工作流图。
      </p>
      @if (data.draftDirty) {
        <div class="notice" role="note">
          当前草稿包含尚未保存或尚未发布的修改。本次注册严格使用已发布的 V{{
            data.workflowVersionNumber ?? data.workflowVersionId
          }}，不会包含当前草稿内容。
        </div>
      }

      @if (loading()) {
        <p class="state" aria-live="polite">正在读取已发布版本的不可变图快照…</p>
      } @else if (loadError()) {
        <div class="error" role="alert">{{ loadError() }}</div>
      } @else {
        <form [formGroup]="metadataForm" class="metadata-form">
          <mat-form-field appearance="outline">
            <mat-label>中文名称</mat-label>
            <input matInput formControlName="nodeName" autocomplete="off" />
            @if (metadataForm.controls.nodeName.invalid && metadataForm.controls.nodeName.touched) {
              <mat-error>请输入中文名称。</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>算子编码</mat-label>
            <input matInput formControlName="nodeCode" autocomplete="off" />
            <mat-hint
              >使用 2–96 个字符，仅允许小写字母、数字和下划线，且必须以小写字母开头。</mat-hint
            >
            @if (metadataForm.controls.nodeCode.invalid && metadataForm.controls.nodeCode.touched) {
              <mat-error>请输入合法的算子编码。</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>版本</mat-label>
            <input matInput formControlName="nodeVersion" autocomplete="off" />
            <mat-hint>语义化版本，例如 1.0.0 或 1.0.0-rc.1+build.2。</mat-hint>
            @if (
              metadataForm.controls.nodeVersion.invalid && metadataForm.controls.nodeVersion.touched
            ) {
              <mat-error>请输入合法的语义化版本。</mat-error>
            }
          </mat-form-field>
          <mat-form-field appearance="outline" class="description-field">
            <mat-label>说明</mat-label>
            <textarea matInput rows="2" formControlName="description"></textarea>
          </mat-form-field>
        </form>

        <section class="candidate-section">
          <h3>输入端口</h3>
          <p class="hint">
            来源为没有入边、但向内部节点提供数据的边界输出。类型、语义和单位来自发布契约，只读。
          </p>
          @if (inputs().length === 0) {
            <p class="empty">没有发现可暴露的输入端口。</p>
          } @else {
            @for (candidate of inputs(); track candidate.id) {
              <div class="candidate-row">
                <label class="check-label">
                  <input
                    type="checkbox"
                    [(ngModel)]="candidate.selected"
                    [ngModelOptions]="{ standalone: true }"
                  />
                  暴露
                </label>
                <input
                  class="editable"
                  [(ngModel)]="candidate.key"
                  [ngModelOptions]="{ standalone: true }"
                  aria-label="输入端口编码"
                />
                <input
                  class="editable wide"
                  [(ngModel)]="candidate.label"
                  [ngModelOptions]="{ standalone: true }"
                  aria-label="输入端口名称"
                />
                <span class="contract"
                  >{{ candidate.dataType }}<br />{{ candidate.semanticType || '无语义' }} ·
                  {{ candidate.unit || '无单位' }}</span
                >
                <label class="check-label"
                  ><input
                    type="checkbox"
                    [(ngModel)]="candidate.required"
                    [ngModelOptions]="{ standalone: true }"
                  />
                  必需</label
                >
              </div>
            }
          }
        </section>

        <section class="candidate-section">
          <h3>输出端口</h3>
          <p class="hint">默认选中发布版本声明的最终输出；取消后该输出不会成为复合算子对外端口。</p>
          @if (outputs().length === 0) {
            <p class="empty">发布版本没有可用的最终输出。</p>
          } @else {
            @for (candidate of outputs(); track candidate.id) {
              <div class="candidate-row">
                <label class="check-label"
                  ><input
                    type="checkbox"
                    [(ngModel)]="candidate.selected"
                    [ngModelOptions]="{ standalone: true }"
                  />
                  暴露</label
                >
                <input
                  class="editable"
                  [(ngModel)]="candidate.key"
                  [ngModelOptions]="{ standalone: true }"
                  aria-label="输出端口编码"
                />
                <input
                  class="editable wide"
                  [(ngModel)]="candidate.label"
                  [ngModelOptions]="{ standalone: true }"
                  aria-label="输出端口名称"
                />
                <span class="contract"
                  >{{ candidate.dataType }}<br />{{ candidate.semanticType || '无语义' }} ·
                  {{ candidate.unit || '无单位' }}</span
                >
              </div>
            }
          }
        </section>

        <section class="candidate-section">
          <h3>可选参数</h3>
          <p class="hint">
            只展示内部节点已经声明的参数。勾选后参数会出现在复合算子属性中，参数类型和默认值不可在此任意修改。
          </p>
          @if (parameters().length === 0) {
            <p class="empty">内部节点没有可暴露参数。</p>
          } @else {
            @for (candidate of parameters(); track candidate.id) {
              <div class="parameter-row">
                <label class="check-label"
                  ><input
                    type="checkbox"
                    [(ngModel)]="candidate.selected"
                    [ngModelOptions]="{ standalone: true }"
                  />
                  暴露</label
                >
                <input
                  class="editable"
                  [(ngModel)]="candidate.key"
                  [ngModelOptions]="{ standalone: true }"
                  aria-label="参数编码"
                />
                <input
                  class="editable wide"
                  [(ngModel)]="candidate.label"
                  [ngModelOptions]="{ standalone: true }"
                  aria-label="参数名称"
                />
                <span class="contract"
                  >{{ candidate.nodeName }} · {{ candidate.parameter }}<br />{{
                    candidate.schema['type'] || 'json'
                  }}
                  · 默认：{{ candidate.hasDefault ? (candidate.defaultValue | json) : '无' }}</span
                >
              </div>
            }
          }
        </section>

        @if (dialogError()) {
          <div class="error" role="alert">
            {{ dialogError() }}
          </div>
        }
        @if (submitError()) {
          <div class="error" role="alert">{{ submitError() }}</div>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close [disabled]="submitting()">取消</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        (click)="submit()"
        [disabled]="!canSubmit()"
      >
        {{ submitting() ? '注册中…' : '注册复合算子' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
    }
    .dialog-content {
      max-height: 78vh;
      min-width: min(760px, 88vw);
    }
    .intro,
    .hint,
    .state,
    .empty {
      color: var(--sw-text-secondary, #52637a);
    }
    .notice {
      margin: 10px 0 14px;
      padding: 10px 12px;
      border-left: 4px solid #d97706;
      background: #fff7ed;
      color: #92400e;
      border-radius: 4px;
    }
    .metadata-form {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .description-field {
      grid-column: 1 / -1;
    }
    .candidate-section {
      margin-top: 20px;
    }
    h3 {
      margin: 0 0 4px;
      font-size: 16px;
    }
    .candidate-row,
    .parameter-row {
      display: grid;
      grid-template-columns: auto minmax(130px, 0.8fr) minmax(150px, 1.2fr) minmax(150px, 1fr) auto;
      gap: 8px;
      align-items: center;
      border: 1px solid var(--sw-border, #dbe3ee);
      border-radius: 6px;
      padding: 8px;
      margin-top: 8px;
    }
    .parameter-row {
      grid-template-columns: auto minmax(130px, 0.8fr) minmax(150px, 1.2fr) minmax(180px, 1.4fr);
    }
    .editable {
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--sw-border, #dbe3ee);
      border-radius: 4px;
      padding: 7px;
      background: var(--sw-surface, white);
      color: inherit;
    }
    .check-label {
      white-space: nowrap;
      font-size: 12px;
    }
    .contract {
      color: var(--sw-text-muted, #65758b);
      font-size: 11px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .error {
      margin-top: 14px;
      padding: 10px 12px;
      color: #991b1b;
      background: #fef2f2;
      border-radius: 5px;
    }
    @media (max-width: 760px) {
      .dialog-content {
        min-width: 0;
      }
      .metadata-form {
        grid-template-columns: 1fr;
      }
      .description-field {
        grid-column: auto;
      }
      .candidate-row,
      .parameter-row {
        grid-template-columns: auto 1fr;
      }
      .candidate-row .contract,
      .parameter-row .contract {
        grid-column: 2;
      }
    }
  `,
})
export class WorkflowCompositeRegistrationDialogComponent {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(ApiClient);
  private readonly dialogRef = inject(
    MatDialogRef<WorkflowCompositeRegistrationDialogComponent, WorkflowCompositeRegistrationResult>,
  );

  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly submitError = signal('');
  readonly derivationError = signal('');
  readonly formError = signal('');
  readonly submitting = signal(false);
  readonly inputs = signal<CompositePortCandidate[]>([]);
  readonly outputs = signal<CompositePortCandidate[]>([]);
  readonly parameters = signal<CompositeParameterCandidate[]>([]);
  readonly metadataForm = this.fb.group({
    nodeName: this.fb.control('', [Validators.required, Validators.maxLength(128)]),
    nodeCode: this.fb.control('', [
      Validators.required,
      Validators.pattern(/^[a-z][a-z0-9_]{1,95}$/),
    ]),
    nodeVersion: this.fb.control('1.0.0', [
      Validators.required,
      Validators.pattern(
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
      ),
    ]),
    description: this.fb.control('', [Validators.maxLength(10000)]),
  });

  constructor(@Inject(MAT_DIALOG_DATA) readonly data: CompositeRegistrationDialogData) {
    this.metadataForm.patchValue({
      nodeName: `${data.workflowName || '工作流'}复合算子`,
      description: `由已发布工作流“${data.workflowName || '工作流'}”生成的复合算子。`,
    });
    this.loadPublishedGraph();
  }

  private loadPublishedGraph(): void {
    this.api
      .get<Record<string, unknown>>(
        `/api/v1/workflow-versions/${this.data.workflowVersionId}/composite-graph`,
      )
      .subscribe({
        next: (response) => {
          const graph = response['graph'];
          const definitions = response['definitions'] ?? response['node_definitions'];
          const result = deriveCompositeCandidates(graph, definitions);
          this.inputs.set(result.inputs);
          this.outputs.set(result.outputs);
          this.parameters.set(result.parameters);
          this.derivationError.set(result.errors.join(' '));
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set('已发布版本读取失败，无法生成复合算子接口。请关闭窗口后重试。');
        },
      });
  }

  canSubmit(): boolean {
    return (
      !this.loading() &&
      !this.loadError() &&
      !this.derivationError() &&
      !this.submitting() &&
      this.metadataForm.valid &&
      !this.interfaceValidationError()
    );
  }

  private selectedOutputs(): CompositePortCandidate[] {
    return this.outputs().filter((candidate) => candidate.selected);
  }

  interfaceValidationError(): string {
    const selected = [
      ...this.inputs().filter((candidate) => candidate.selected),
      ...this.selectedOutputs(),
      ...this.parameters().filter((candidate) => candidate.selected),
    ];
    if (this.outputs().length === 0 || this.selectedOutputs().length === 0) {
      return '请至少暴露一个发布版本声明的最终输出。';
    }
    if (selected.some((candidate) => !candidate.key.trim())) return '接口编码不能为空。';
    if (selected.some((candidate) => !candidate.label.trim())) return '接口名称不能为空。';
    const keys = selected.map((candidate) => candidate.key.trim());
    const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
    return duplicates.length ? `接口编码重复：${[...new Set(duplicates)].join('、')}。` : '';
  }

  private markFormTouched(): void {
    this.metadataForm.markAllAsTouched();
    this.formError.set(this.interfaceValidationError() || '请完善注册信息。');
  }

  dialogError(): string {
    if (this.derivationError()) return this.derivationError();
    const interfaceError = this.interfaceValidationError();
    if (interfaceError) return interfaceError;
    return this.metadataForm.invalid ? this.formError() : '';
  }

  private buildInterface(): Mapping {
    const inputs = this.inputs()
      .filter((candidate) => candidate.selected)
      .map((candidate) => this.portPayload(candidate));
    const outputs = this.selectedOutputs().map((candidate) => this.portPayload(candidate));
    const parameters = this.parameters()
      .filter((candidate) => candidate.selected)
      .map((candidate) => {
        const value: Mapping = {
          key: candidate.key.trim(),
          label: candidate.label.trim(),
          required: candidate.required,
          target: { node_id: candidate.nodeId, parameter: candidate.parameter },
          schema: this.safeClone(candidate.schema),
        };
        if (candidate.hasDefault) value['default'] = this.safeClone(candidate.defaultValue);
        return value;
      });
    return { schema_version: '1.0', inputs, outputs, parameters };
  }

  private portPayload(candidate: CompositePortCandidate): Mapping {
    const value: Mapping = {
      key: candidate.key.trim(),
      label: candidate.label.trim(),
      data_type: candidate.dataType,
      required: candidate.required,
      cardinality: 'one',
      source: { ...candidate.source },
    };
    if (candidate.semanticType) value['semantic_type'] = candidate.semanticType;
    if (candidate.unit) value['unit'] = candidate.unit;
    return value;
  }

  private safeClone(value: unknown): unknown {
    if (value === undefined) return undefined;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return undefined;
    }
  }

  submit(): void {
    this.submitError.set('');
    this.formError.set('');
    if (!this.canSubmit()) {
      this.markFormTouched();
      return;
    }
    this.submitting.set(true);
    const values = this.metadataForm.getRawValue();
    this.api
      .post<Record<string, unknown>, Mapping>(
        `/api/v1/workflow-versions/${this.data.workflowVersionId}/composite-operator`,
        {
          node_code: values.nodeCode.trim(),
          node_version: values.nodeVersion.trim(),
          node_name: values.nodeName.trim(),
          description: values.description.trim(),
          interface: this.buildInterface(),
        },
      )
      .subscribe({
        next: () => {
          this.dialogRef.close({
            registered: true,
            nodeCode: values.nodeCode.trim(),
            nodeName: values.nodeName.trim(),
            nodeVersion: values.nodeVersion.trim(),
          });
        },
        error: (error: any) => {
          this.submitting.set(false);
          const detail = error?.error?.detail;
          const message =
            detail && typeof detail === 'object' && typeof detail.message === 'string'
              ? detail.message
              : typeof error?.error?.message === 'string'
                ? error.error.message
                : '复合算子注册失败，请检查发布版本和权限。';
          this.submitError.set(message);
        },
      });
  }
}
